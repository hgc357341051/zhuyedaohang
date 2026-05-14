/**
 * 书签操作工具
 * 封装浏览器书签API，提供书签的读取、合并、创建等操作
 * 兼容Chrome（chrome.bookmarks）和Firefox（browser.bookmarks）
 */

// 统一获取bookmarks API入口，兼容Chrome和Firefox
const bookmarksApi = typeof browser !== 'undefined' ? browser.bookmarks : chrome.bookmarks;

const BookmarkUtil = {

  // 根节点ID（Chrome和Firefox通用）
  ROOT_ID: '0',
  // 书签栏的固定ID（Chrome和Firefox通用）
  BOOKMARK_BAR_ID: '1',
  // 其他书签的固定ID
  OTHER_BOOKMARKS_ID: '2',

  /**
   * 递归获取所有书签，返回扁平化的书签数组
   * 每个书签项包含：id、parentId、title、url、folderPath、rootFolder
   * @returns {Promise<Array>} 所有书签节点的扁平数组
   */
  async getAllBookmarks() {
    // 获取完整的书签树
    const tree = await bookmarksApi.getTree();
    // 从根节点开始递归遍历，收集所有书签
    const result = [];
    this._flattenTree(tree[0], result);
    return result;
  },

  /**
   * 递归展平书签树为数组
   * 路径设计：不包含根文件夹名（书签栏/其他书签），
   * 仅记录根文件夹下的相对路径，避免导入时重复创建根文件夹
   * @param {Object} node - 书签树节点
   * @param {Array} result - 收集结果的数组
   * @param {string} folderPath - 当前文件夹相对路径（不含根文件夹名）
   * @param {string|null} rootFolderId - 所属根文件夹ID（书签栏/其他书签）
   */
  _flattenTree(node, result, folderPath = '', rootFolderId = null) {
    // 判断当前节点是否为根级文件夹（书签栏、其他书签等）
    const isRootFolder = node.parentId === this.ROOT_ID;

    // 如果是根级文件夹，记录其ID作为后续节点的rootFolderId
    const currentRootId = isRootFolder ? node.id : rootFolderId;

    if (node.url) {
      // 叶子节点：实际书签（有URL的才是书签）
      result.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title || '',
        url: node.url,
        // folderPath是相对于根文件夹的路径，不包含根文件夹名
        folderPath: folderPath,
        // rootFolder标识属于哪个根文件夹（'1'=书签栏，'2'=其他书签）
        rootFolder: currentRootId || this.BOOKMARK_BAR_ID
      });
    } else if (node.children) {
      // 分支节点：文件夹（有children的）
      if (!isRootFolder && node.id !== this.ROOT_ID) {
        // 非根级文件夹才记录（跳过"书签栏"本身和根节点）
        // 构建当前文件夹的相对路径
        const currentPath = folderPath ? `${folderPath}/${node.title}` : node.title;
        result.push({
          id: node.id,
          parentId: node.parentId,
          title: node.title || '',
          url: null,
          folderPath: currentPath,
          isFolder: true,
          rootFolder: currentRootId || this.BOOKMARK_BAR_ID
        });
        // 递归处理子节点，传递更新后的路径
        for (const child of node.children) {
          this._flattenTree(child, result, currentPath, currentRootId);
        }
      } else {
        // 根级文件夹或根节点：不记录自身，但递归处理子节点
        // 子节点的folderPath从空字符串开始（不包含根文件夹名）
        for (const child of node.children) {
          this._flattenTree(child, result, '', currentRootId);
        }
      }
    }
  },

  /**
   * 将书签数据序列化为JSON字符串
   * 只保留恢复时需要的核心字段，去除运行时ID等不可移植数据
   * @returns {Promise<string>} JSON格式的书签数据
   */
  async exportBookmarks() {
    const allBookmarks = await this.getAllBookmarks();

    // 构建导出数据结构
    const exportData = {
      // 版本号，便于未来格式升级时做兼容处理
      version: '1.0',
      // 导出时间戳（ISO 8601格式）
      exportTime: new Date().toISOString(),
      // 导出平台的浏览器信息
      browserInfo: navigator.userAgent,
      // 书签数据，去除运行时ID
      bookmarks: allBookmarks.map(b => ({
        title: b.title,
        url: b.url || null,
        // folderPath：相对于根文件夹的路径，不含根文件夹名
        folderPath: b.folderPath || '',
        // rootFolder：标识属于哪个根文件夹
        rootFolder: b.rootFolder || this.BOOKMARK_BAR_ID,
        isFolder: b.isFolder || false
      }))
    };

    return JSON.stringify(exportData, null, 2);
  },

  /**
   * 从WebDAV恢复书签到本地（合并模式）
   * 合并规则：以URL为唯一标识，本地已存在则跳过，不存在则创建
   * @param {string} jsonData - WebDAV上下载的书签JSON数据
   * @returns {Promise<Object>} 恢复结果统计
   */
  async importBookmarks(jsonData) {
    // 解析JSON数据
    const importData = JSON.parse(jsonData);
    const bookmarks = importData.bookmarks || [];

    // 获取本地所有书签，用于去重判断
    const localBookmarks = await this.getAllBookmarks();
    // 构建本地URL集合，用于快速查重
    const localUrlSet = new Set(
      localBookmarks.filter(b => b.url).map(b => b.url)
    );
    // 构建本地文件夹路径到ID的映射
    // key格式：rootFolderId:folderPath（区分不同根文件夹下的同名路径）
    const folderMap = new Map();
    localBookmarks.filter(b => b.isFolder).forEach(b => {
      const key = `${b.rootFolder}:${b.folderPath}`;
      folderMap.set(key, b.id);
    });

    // 统计结果
    const stats = {
      total: bookmarks.length, // 导入数据中的总项数（含文件夹和书签）
      skipped: 0, // 跳过的书签数（URL已存在）
      created: 0, // 新创建的书签数
      foldersCreated: 0, // 新创建的文件夹数
      foldersSkipped: 0 // 已存在跳过的文件夹数
    };

    // 第一轮：先处理所有文件夹，确保文件夹层级存在
    // 注意：文件夹的folderPath是其自身路径，需要先确保父路径存在再创建自身
    const folders = bookmarks.filter(b => b.isFolder);
    for (const folder of folders) {
      const mapKey = `${folder.rootFolder}:${folder.folderPath}`;
      if (!folderMap.has(mapKey)) {
        // 获取父路径（去掉最后一段，即文件夹自身名称）
        // 例如 folderPath="技术/前端" → parentPath="技术", folderName="前端"
        const lastSlash = folder.folderPath.lastIndexOf('/');
        const parentPath = lastSlash > 0 ? folder.folderPath.substring(0, lastSlash) : '';
        // 确保父路径上的所有文件夹都已存在
        const parentId = parentPath
          ? await this._ensureFolderPath(parentPath, folder.rootFolder, folderMap, stats)
          : this._resolveRootFolderId(folder.rootFolder);
        // 在父文件夹下创建当前文件夹
        const created = await bookmarksApi.create({
          parentId: parentId,
          title: folder.title
        });
        folderMap.set(mapKey, created.id);
        stats.foldersCreated++;
      } else {
        // 文件夹已存在，跳过
        stats.foldersSkipped++;
      }
    }

    // 第二轮：处理所有书签（非文件夹）
    const links = bookmarks.filter(b => !b.isFolder && b.url);
    for (const bookmark of links) {
      // 以URL为唯一标识，已存在则跳过
      if (localUrlSet.has(bookmark.url)) {
        stats.skipped++;
        continue;
      }

      // 确保书签所在的父文件夹存在
      // bookmark.folderPath是书签所在文件夹的完整路径
      // 对于直接在根文件夹下的书签，folderPath为空
      const parentId = bookmark.folderPath
        ? await this._ensureFolderPath(
            bookmark.folderPath, bookmark.rootFolder, folderMap, stats
          )
        : this._resolveRootFolderId(bookmark.rootFolder);

      // 创建书签
      await bookmarksApi.create({
        parentId: parentId,
        title: bookmark.title,
        url: bookmark.url
      });
      stats.created++;
      // 将新创建的URL加入集合，避免后续重复导入
      localUrlSet.add(bookmark.url);
    }

    return stats;
  },

  /**
   * 确保指定路径的文件夹存在，不存在则逐级创建
   * 与_ensureParentFolder不同，此函数会创建完整路径（包含最后一段）
   * 用于确保书签所在的文件夹完整路径存在
   * @param {string} folderPath - 相对于根文件夹的路径（如"技术/前端"，不含根文件夹名）
   * @param {string} rootFolder - 根文件夹ID（'1'=书签栏，'2'=其他书签）
   * @param {Map} folderMap - 文件夹路径到ID的映射
   * @param {Object} stats - 统计对象
   * @returns {Promise<string>} 最终文件夹的ID
   */
  async _ensureFolderPath(folderPath, rootFolder, folderMap, stats) {
    // 空路径，直接返回对应的根文件夹ID
    if (!folderPath) {
      return this._resolveRootFolderId(rootFolder);
    }

    // 拆分路径为层级数组（如["技术", "前端"]）
    const parts = folderPath.split('/').filter(p => p);
    // 起始父ID为对应的根文件夹
    let currentParentId = this._resolveRootFolderId(rootFolder);
    let currentPath = '';

    // 逐级确保文件夹存在
    for (let i = 0; i < parts.length; i++) {
      const folderName = parts[i];
      currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
      const mapKey = `${rootFolder}:${currentPath}`;

      if (folderMap.has(mapKey)) {
        // 文件夹已存在，直接使用其ID作为下一级的父ID
        currentParentId = folderMap.get(mapKey);
      } else {
        // 文件夹不存在，创建它
        const created = await bookmarksApi.create({
          parentId: currentParentId,
          title: folderName
        });
        folderMap.set(mapKey, created.id);
        currentParentId = created.id;
        stats.foldersCreated++;
      }
    }

    return currentParentId;
  },

  /**
   * 将rootFolder字段解析为实际的浏览器书签根文件夹ID
   * 处理导出数据中rootFolder可能为旧值的情况
   * @param {string} rootFolder - 导出数据中的rootFolder值
   * @returns {string} 实际的根文件夹ID
   */
  _resolveRootFolderId(rootFolder) {
    // 如果已经是标准ID（'1'或'2'），直接返回
    if (rootFolder === this.BOOKMARK_BAR_ID || rootFolder === this.OTHER_BOOKMARKS_ID) {
      return rootFolder;
    }
    // 其他情况默认返回书签栏ID
    return this.BOOKMARK_BAR_ID;
  }
};

// 导出给其他模块使用
if (typeof globalThis !== 'undefined') {
  globalThis.BookmarkUtil = BookmarkUtil;
}
