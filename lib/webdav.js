class WebDAVClient {
  constructor(config) {
    // 去除末尾斜杠，保证URL拼接一致性
    this.baseUrl = config.url.replace(/\/$/, '');
    // 存储WebDAV认证用户名
    this.username = config.username;
    // 存储WebDAV认证密码
    this.password = config.password;
    // 预生成Basic认证头，避免每次请求重复计算
    // 使用安全的Base64编码方式，支持非ASCII字符（如中文用户名/密码）
    this.authHeader = 'Basic ' + this._safeBase64Encode(`${this.username}:${this.password}`);
  }

  /**
   * 安全的Base64编码，支持Unicode字符
   * 原生btoa()不支持非ASCII字符，需要先转为UTF-8字节
   * @param {string} str - 要编码的字符串
   * @returns {string} Base64编码结果
   */
  _safeBase64Encode(str) {
    // 将字符串编码为UTF-8字节数组
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    // 将字节数组转为二进制字符串，再用btoa编码
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 拼接完整URL
   * @param {string} path - WebDAV路径
   * @returns {string} 完整的请求URL
   */
  _getFullUrl(path) {
    // 确保路径以/开头，与baseUrl正确拼接
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return this.baseUrl + cleanPath;
  }

  /**
   * 发送WebDAV请求（使用浏览器原生fetch）
   * 包含超时控制和CORS错误提示
   * @param {string} method - HTTP方法（GET/PUT/MKCOL等）
   * @param {string} path - WebDAV路径
   * @param {Object} options - 请求选项（headers/body等）
   * @returns {Promise<Response>} fetch原生Response对象
   */
  async _request(method, path, options = {}) {
    // 拼接完整请求URL
    const url = this._getFullUrl(path);
    // 合并认证头和自定义头
    const headers = {
      'Authorization': this.authHeader,
      ...options.headers
    };

    // 创建AbortController用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    try {
      // 使用浏览器原生fetch发起请求
      const response = await fetch(url, {
        method: method,
        headers: headers,
        body: options.body || null,
        signal: controller.signal // 绑定超时信号
      });
      return response;
    } catch (error) {
      // 区分超时错误和网络错误
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接或WebDAV服务器是否可达');
      }
      // 网络错误可能是CORS问题
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        throw new Error(
          '网络请求失败，可能原因：\n' +
          '1. WebDAV服务器地址不可达\n' +
          '2. 服务器未配置CORS允许跨域访问\n' +
          '3. 浏览器网络代理设置问题'
        );
      }
      throw error;
    } finally {
      // 无论成功失败都清除超时定时器
      clearTimeout(timeoutId);
    }
  }

  /**
   * 检查指定路径的文件或目录是否存在
   * 使用PROPFIND Depth:0代替HEAD，因为很多WebDAV服务器对HEAD请求返回403
   * @param {string} path - WebDAV路径
   * @returns {Promise<boolean>} 是否存在
   */
  async exists(path) {
    try {
      // 优先使用PROPFIND Depth:0检测资源是否存在
      // 这是WebDAV标准方式，兼容性远优于HEAD
      const response = await this._request('PROPFIND', path, {
        headers: {
          'Depth': '0' // 只请求资源自身属性，不列子项
        }
      });
      // 200/207表示资源存在，404表示不存在，403可能是权限问题但资源可能存在
      if (response.ok || response.status === 207) {
        return true;
      }
      // 404明确表示不存在
      if (response.status === 404) {
        return false;
      }
      // 403可能是服务器不允许PROPFIND但资源存在，尝试HEAD作为兜底
      try {
        const headResponse = await this._request('HEAD', path);
        return headResponse.ok;
      } catch (headError) {
        // HEAD也失败，保守返回false
        return false;
      }
    } catch (error) {
      // PROPFIND网络异常，尝试HEAD作为兜底
      try {
        const headResponse = await this._request('HEAD', path);
        return headResponse.ok;
      } catch (headError) {
        console.error('exists检查失败:', error);
        return false;
      }
    }
  }

  /**
   * 创建目录，支持递归创建多级目录
   * @param {string} path - 要创建的目录路径
   * @param {Object} options - 选项，recursive为true时逐级创建
   */
  async createDirectory(path, options = { recursive: true }) {
    try {
      if (options.recursive) {
        // 递归模式：逐级拆分路径，逐级创建目录
        const parts = path.split('/').filter(p => p);
        let currentPath = '';
        for (const part of parts) {
          currentPath += '/' + part;
          // 先检查当前层级是否已存在，避免重复创建报错
          const exists = await this.exists(currentPath);
          if (!exists) {
            // 发送MKCOL请求创建目录
            const response = await this._request('MKCOL', currentPath);
            // 405表示目录已存在，不算错误
            if (!response.ok && response.status !== 405) {
              throw new Error(`创建目录失败: ${response.status} ${response.statusText}`);
            }
          }
        }
      } else {
        // 非递归模式：直接创建指定目录
        const response = await this._request('MKCOL', path);
        if (!response.ok && response.status !== 405) {
          throw new Error(`创建目录失败: ${response.status} ${response.statusText}`);
        }
      }
    } catch (error) {
      console.error('createDirectory失败:', error);
      throw error;
    }
  }

  /**
   * 获取文件内容，支持文本/JSON/二进制三种格式
   * @param {string} path - 文件路径
   * @param {Object} options - 选项，format指定返回格式
   * @returns {Promise<string|Object|ArrayBuffer>} 文件内容
   */
  async getFileContents(path, options = { format: 'text' }) {
    try {
      const response = await this._request('GET', path);
      if (!response.ok) {
        throw new Error(`获取文件失败: ${response.status} ${response.statusText}`);
      }
      // 根据请求的格式返回对应类型的数据
      switch (options.format) {
        case 'text':
          return await response.text();
        case 'binary':
          return await response.arrayBuffer();
        case 'json':
          return await response.json();
        default:
          return await response.text();
      }
    } catch (error) {
      console.error('getFileContents失败:', error);
      throw error;
    }
  }

  /**
   * 上传文件内容到WebDAV
   * @param {string} path - 目标文件路径
   * @param {string|ArrayBuffer} content - 文件内容
   * @param {Object} options - 选项（overwrite是否覆盖，contentType内容类型）
   */
  async putFileContents(path, content, options = { overwrite: true }) {
    try {
      // 如果不允许覆盖，先检查文件是否已存在
      if (!options.overwrite) {
        const exists = await this.exists(path);
        if (exists) {
          throw new Error('文件已存在，且未设置覆盖选项');
        }
      }
      // 根据内容类型设置Content-Type头
      const headers = {};
      if (options.contentType) {
        headers['Content-Type'] = options.contentType;
      } else if (typeof content === 'string') {
        // 字符串内容默认使用UTF-8编码
        headers['Content-Type'] = 'text/plain; charset=utf-8';
      }
      // 发送PUT请求上传文件
      const response = await this._request('PUT', path, {
        headers,
        body: content
      });
      if (!response.ok) {
        throw new Error(`上传文件失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('putFileContents失败:', error);
      throw error;
    }
  }

  /**
   * 列出目录下的文件和子目录
   * @param {string} path - 目录路径
   * @param {Object} options - 选项（recursive是否递归列出子目录）
   * @returns {Promise<Array>} 文件和目录列表
   */
  async getDirectoryContents(path, options = { recursive: false }) {
    try {
      options = options || {};
      // 使用_visitedPaths防止递归时出现循环引用
      if (!options._visitedPaths) options._visitedPaths = new Set();

      // 规范化请求路径，去除尾部斜杠
      let normalizedRequestPath = path.startsWith('/') ? path : '/' + path;
      normalizedRequestPath = normalizedRequestPath.replace(/\/+$/, '');

      // 如果已访问过该路径则返回空数组，防止死循环
      if (options._visitedPaths.has(normalizedRequestPath)) {
        return [];
      }
      options._visitedPaths.add(normalizedRequestPath);

      // 发送PROPFIND请求获取目录内容，Depth:1表示只获取直接子项
      const response = await this._request('PROPFIND', normalizedRequestPath, {
        headers: {
          'Depth': '1'
        }
      });

      if (!response.ok) {
        throw new Error(`列出目录失败: ${response.status} ${response.statusText}`);
      }

      // 解析WebDAV返回的XML响应
      const text = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      const items = [];

      // 使用命名空间无关的方式查找所有response节点
      let responses = xmlDoc.getElementsByTagNameNS('*', 'response');

      // 计算目标路径的pathname，用于排除目录自身
      let targetPathname;
      try {
        targetPathname = new URL(this._getFullUrl(normalizedRequestPath)).pathname.replace(/\/+$/, '');
      } catch (e) {
        targetPathname = normalizedRequestPath.replace(/\/+$/, '');
      }

      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        // 获取href节点（任意命名空间）
        let hrefEl = resp.getElementsByTagNameNS('*', 'href')[0];
        if (!hrefEl) {
          // 兜底：在子节点中查找localName为href的节点
          for (let k = 0; k < resp.childNodes.length; k++) {
            const cn = resp.childNodes[k];
            if (cn && cn.localName === 'href') {
              hrefEl = cn;
              break;
            }
          }
        }
        if (!hrefEl || !hrefEl.textContent) continue;

        const hrefRaw = hrefEl.textContent.trim();
        // 规范化href路径
        let hrefPathname;
        try {
          const hrefUrl = new URL(hrefRaw, this.baseUrl);
          hrefPathname = hrefUrl.pathname.replace(/\/+$/, '');
        } catch (e) {
          hrefPathname = hrefRaw.replace(/\/+$/, '');
        }

        // 跳过目标目录自身条目（PROPFIND会返回目录本身）
        if (hrefPathname === targetPathname) {
          continue;
        }

        // 判断是否为目录（collection）
        let isCollection = false;
        const resTypeEl = resp.getElementsByTagNameNS('*', 'resourcetype')[0];
        if (resTypeEl) {
          for (let m = 0; m < resTypeEl.childNodes.length; m++) {
            const child = resTypeEl.childNodes[m];
            if (child && child.localName === 'collection') {
              isCollection = true;
              break;
            }
          }
        }

        // 从路径中提取文件名（取最后一段）
        const parts = hrefPathname.split('/').filter(p => p);
        const filename = parts.length ? decodeURIComponent(parts.pop()) : '';

        items.push({
          filename,
          path: hrefRaw,
          type: isCollection ? 'directory' : 'file',
          _hrefPathname: hrefPathname // 内部使用，便于递归时计算相对路径
        });
      }

      // 过滤macOS产生的隐藏文件（._开头和.DS_Store）
      let filtered = items.filter(i => {
        if (!i.filename) return false;
        return !(i.filename.startsWith('._') || i.filename === '.DS_Store');
      });

      // 递归模式：遍历子目录并合并结果
      if (options.recursive) {
        // 计算baseUrl的pathname前缀，用于剥离得到相对路径
        let basePathname = '';
        try {
          basePathname = new URL(this.baseUrl).pathname.replace(/\/+$/, '');
        } catch (e) {
          basePathname = '';
        }

        // 收集所有子目录
        const dirs = filtered.filter(i => i.type === 'directory');
        for (const dir of dirs) {
          let childHrefPath = dir._hrefPathname || dir.path;
          // 剥离basePathname前缀，得到相对路径
          let childRelative;
          if (basePathname && childHrefPath.startsWith(basePathname)) {
            childRelative = childHrefPath.slice(basePathname.length);
            if (!childRelative.startsWith('/')) childRelative = '/' + childRelative;
          } else {
            childRelative = childHrefPath;
          }
          // 递归获取子目录内容（传入同一个_visitedPaths防止环）
          const childItems = await this.getDirectoryContents(childRelative, options);
          // 将子目录内容合并到当前结果中（扁平结构）
          filtered = filtered.concat(childItems);
        }
      }

      // 最终返回：移除内部字段_hrefPathname
      const result = filtered.map(({ _hrefPathname, ...rest }) => rest);
      return result;
    } catch (error) {
      console.error('getDirectoryContents失败:', error);
      throw error;
    }
  }

  /**
   * 删除WebDAV上的文件或目录
   * @param {string} path - 要删除的路径
   */
  async deleteFile(path) {
    try {
      const response = await this._request('DELETE', path);
      if (!response.ok) {
        throw new Error(`删除失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('deleteFile失败:', error);
      throw error;
    }
  }

  /**
   * 移动文件或目录（可用于重命名）
   * @param {string} fromPath - 源路径
   * @param {string} toPath - 目标路径
   * @param {Object} options - 选项（overwrite是否覆盖目标）
   */
  async moveFile(fromPath, toPath, options = { overwrite: false }) {
    try {
      const response = await this._request('MOVE', fromPath, {
        headers: {
          // Destination头必须是完整URL
          'Destination': this._getFullUrl(toPath),
          // WebDAV规范：T表示覆盖，F表示不覆盖
          'Overwrite': options.overwrite ? 'T' : 'F'
        }
      });
      if (!response.ok) {
        throw new Error(`移动文件失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('moveFile失败:', error);
      throw error;
    }
  }

  /**
   * 复制文件或目录
   * @param {string} fromPath - 源路径
   * @param {string} toPath - 目标路径
   * @param {Object} options - 选项（overwrite是否覆盖目标）
   */
  async copyFile(fromPath, toPath, options = { overwrite: false }) {
    try {
      const response = await this._request('COPY', fromPath, {
        headers: {
          'Destination': this._getFullUrl(toPath),
          'Overwrite': options.overwrite ? 'T' : 'F'
        }
      });
      if (!response.ok) {
        throw new Error(`复制文件失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('copyFile失败:', error);
      throw error;
    }
  }
}

// 导出给其他模块使用（兼容浏览器扩展环境）
if (typeof globalThis !== 'undefined') {
  globalThis.WebDAVClient = WebDAVClient;
}
