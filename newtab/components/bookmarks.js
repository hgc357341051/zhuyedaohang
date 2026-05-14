/**
 * 书签管理组件
 * 显示浏览器书签树，支持展开/折叠、打开、编辑、删除
 * 优化设计：隐藏系统文件夹名称（收藏夹栏等），直接展示书签内容
 */
class BookmarksComponent {
  /**
   * 构造函数
   * @param {Object} config - 组件配置
   */
  constructor(config) {
    this.config = config;
    this.el = null;
  }

  /**
   * 渲染组件
   * @param {HTMLElement} container - 父容器
   */
  render(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'component-wrapper';
    wrapper.dataset.component = 'bookmarks';

    const card = document.createElement('div');
    card.className = 'glass-card bookmarks-component';

    // 头部
    const header = document.createElement('div');
    header.className = 'bookmarks-header';

    const title = document.createElement('div');
    title.className = 'bookmarks-title';
    title.textContent = '书签';

    // 工具栏按钮
    const toolbar = document.createElement('div');
    toolbar.className = 'bookmarks-toolbar';

    // 刷新按钮
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '刷新';
    refreshBtn.addEventListener('click', () => this._loadBookmarks());

    // 添加书签按钮
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ 添加';
    addBtn.addEventListener('click', () => this._showAddBookmarkModal());

    toolbar.appendChild(refreshBtn);
    toolbar.appendChild(addBtn);
    header.appendChild(title);
    header.appendChild(toolbar);

    // 书签树容器
    const tree = document.createElement('div');
    tree.className = 'bookmarks-tree';
    tree.id = 'bookmarks-tree';

    card.appendChild(header);
    card.appendChild(tree);
    wrapper.appendChild(card);
    container.appendChild(wrapper);

    // 保存引用
    this.el = wrapper;
    this.tree = tree;

    // 延迟加载书签数据：使用requestIdleCallback在浏览器空闲时加载
    // 避免阻塞首屏渲染，提升页面打开速度
    if (typeof requestIdleCallback === 'function') {
      // 浏览器支持requestIdleCallback，在空闲时加载
      requestIdleCallback(() => this._loadBookmarks(), { timeout: 1000 });
    } else {
      // 不支持时使用setTimeout延迟100ms加载
      setTimeout(() => this._loadBookmarks(), 100);
    }
  }

  /**
   * 从浏览器加载书签树
   * 使用DocumentFragment批量插入DOM，减少重排次数
   * 优化：跳过系统根文件夹（收藏夹栏、其他书签等），直接展示内容
   * @private
   */
  async _loadBookmarks() {
    try {
      // 获取完整书签树
      const bookmarkTree = await chrome.bookmarks.getTree();

      // 使用DocumentFragment批量构建DOM，避免多次重排
      const fragment = document.createDocumentFragment();

      // 根节点通常有"书签栏"和"其他书签"两个子节点
      const root = bookmarkTree[0];
      if (root.children) {
        root.children.forEach(child => {
          // 跳过空文件夹
          if (child.children && child.children.length > 0) {
            // 判断是否为系统根文件夹（收藏夹栏、其他书签等）
            // 系统根文件夹的id通常为"1"（书签栏）或"2"（其他书签）
            const isSystemFolder = child.id === '1' || child.id === '2' || child.id === '0';

            if (isSystemFolder && child.children) {
              // 系统根文件夹：不显示文件夹名称，直接展开其内容
              child.children.forEach(subChild => {
                if (subChild.url) {
                  // 直接是书签项
                  const item = this._renderBookmark(subChild);
                  fragment.appendChild(item);
                } else if (subChild.children && subChild.children.length > 0) {
                  // 子文件夹：正常渲染（显示文件夹名称）
                  const folderEl = this._renderFolder(subChild, 0);
                  fragment.appendChild(folderEl);
                }
              });
            } else {
              // 非系统文件夹：正常渲染（显示文件夹名称）
              const folderEl = this._renderFolder(child, 0);
              fragment.appendChild(folderEl);
            }
          }
        });
      }

      // 一次性清空并插入，只触发一次重排
      this.tree.innerHTML = '';
      this.tree.appendChild(fragment);
    } catch (error) {
      this.tree.innerHTML = `<div style="color:var(--danger);padding:12px;">加载书签失败: ${error.message}</div>`;
    }
  }

  /**
   * 渲染书签文件夹
   * @param {Object} folder - 书签文件夹节点
   * @param {number} depth - 嵌套深度
   * @returns {HTMLElement} 文件夹DOM
   * @private
   */
  _renderFolder(folder, depth) {
    const folderEl = document.createElement('div');
    folderEl.className = 'bookmark-folder';

    // 文件夹头部（可点击展开/折叠）
    const header = document.createElement('div');
    header.className = 'bookmark-folder-header';

    // 展开箭头
    const arrow = document.createElement('span');
    arrow.className = 'folder-arrow';
    arrow.textContent = '▶';

    // 文件夹图标 - 使用更精致的设计
    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.textContent = '📂';

    // 文件夹名称
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = folder.title || '未命名文件夹';

    // 子节点数量标记
    const count = document.createElement('span');
    count.className = 'folder-count';
    const childCount = folder.children ? folder.children.filter(c => c.url).length : 0;
    count.textContent = childCount > 0 ? `${childCount}` : '';

    header.appendChild(arrow);
    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(count);

    // 子节点容器
    const childrenEl = document.createElement('div');
    childrenEl.className = 'folder-children';

    // 渲染子节点
    if (folder.children) {
      folder.children.forEach(child => {
        if (child.url) {
          // 书签项
          const item = this._renderBookmark(child);
          childrenEl.appendChild(item);
        } else if (child.children) {
          // 子文件夹（递归渲染）
          const subFolder = this._renderFolder(child, depth + 1);
          childrenEl.appendChild(subFolder);
        }
      });
    }

    // 点击头部展开/折叠
    header.addEventListener('click', () => {
      const isExpanded = childrenEl.classList.contains('expanded');
      if (isExpanded) {
        // 折叠
        childrenEl.classList.remove('expanded');
        arrow.classList.remove('expanded');
      } else {
        // 展开
        childrenEl.classList.add('expanded');
        arrow.classList.add('expanded');
      }
    });

    folderEl.appendChild(header);
    folderEl.appendChild(childrenEl);

    // 所有文件夹默认收起，用户点击手动展开
    // 不再自动展开任何层级，保持页面简洁

    return folderEl;
  }

  /**
   * 渲染单个书签项
   * 使用更精致的卡片式设计
   * @param {Object} bookmark - 书签数据
   * @returns {HTMLElement} 书签DOM
   * @private
   */
  _renderBookmark(bookmark) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';

    // 书签图标（favicon）
    const favicon = document.createElement('img');
    favicon.className = 'bookmark-favicon';

    // 优先使用Chrome内置_favicon API获取图标（本地缓存，无网络请求）
    const faviconUrl = this._getFaviconUrl(bookmark.url);
    if (faviconUrl) {
      favicon.src = faviconUrl;
    } else {
      // URL解析失败时使用默认图标
      favicon.src = this._getDefaultIcon();
    }

    // favicon加载失败时显示默认图标（使用addEventListener避免CSP问题）
    favicon.addEventListener('error', () => {
      favicon.src = this._getDefaultIcon();
    });

    // 书签标题
    const title = document.createElement('span');
    title.className = 'bookmark-title';
    title.textContent = bookmark.title || bookmark.url;

    // 操作按钮区
    const actions = document.createElement('div');
    actions.className = 'bookmark-actions';

    // 编辑按钮
    const editBtn = document.createElement('button');
    editBtn.className = 'bookmark-action-btn';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._showEditBookmarkModal(bookmark);
    });

    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'bookmark-action-btn delete';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._deleteBookmark(bookmark.id, bookmark.title);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    // 点击打开书签
    item.addEventListener('click', () => {
      window.open(bookmark.url, '_blank');
    });

    item.appendChild(favicon);
    item.appendChild(title);
    item.appendChild(actions);
    return item;
  }

  /**
   * 显示编辑书签弹窗
   * @param {Object} bookmark - 书签数据
   * @private
   */
  _showEditBookmarkModal(bookmark) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-title">编辑书签</div>
      <div class="modal-field">
        <label>标题</label>
        <input type="text" id="bm-title-input" value="${this._escapeHtml(bookmark.title || '')}">
      </div>
      <div class="modal-field">
        <label>网址</label>
        <input type="url" id="bm-url-input" value="${this._escapeHtml(bookmark.url || '')}">
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="bm-cancel">取消</button>
        <button class="modal-btn modal-btn-confirm" id="bm-confirm">保存</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 取消
    document.getElementById('bm-cancel').addEventListener('click', () => overlay.remove());
    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // 保存
    document.getElementById('bm-confirm').addEventListener('click', async () => {
      const newTitle = document.getElementById('bm-title-input').value.trim();
      const newUrl = document.getElementById('bm-url-input').value.trim();

      try {
        // 调用Chrome API更新书签
        await chrome.bookmarks.update(bookmark.id, {
          title: newTitle || bookmark.title,
          url: newUrl || bookmark.url
        });
        this._loadBookmarks();
        overlay.remove();
      } catch (error) {
        // 使用toast替代alert
        if (window.NewTabApp) {
          window.NewTabApp.showToast('更新失败: ' + error.message, 'error');
        }
      }
    });
  }

  /**
   * 删除书签
   * 使用自定义确认弹窗替代原生confirm
   * @param {string} id - 书签ID
   * @param {string} title - 书签标题（用于确认提示）
   * @private
   */
  async _deleteBookmark(id, title) {
    // 使用自定义确认弹窗
    const confirmed = await window.NewTabApp.showConfirm(
      `确定删除书签"${title}"？`,
      { title: '删除书签', confirmText: '删除', type: 'danger' }
    );
    if (!confirmed) return; // 用户取消
    try {
      await chrome.bookmarks.remove(id);
      this._loadBookmarks();
    } catch (error) {
      // 使用toast替代alert
      if (window.NewTabApp) {
        window.NewTabApp.showToast('删除失败: ' + error.message, 'error');
      }
    }
  }

  /**
   * 显示添加书签弹窗
   * @private
   */
  _showAddBookmarkModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-title">添加书签</div>
      <div class="modal-field">
        <label>标题</label>
        <input type="text" id="bm-new-title" placeholder="书签标题">
      </div>
      <div class="modal-field">
        <label>网址</label>
        <input type="url" id="bm-new-url" placeholder="https://example.com">
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="bm-new-cancel">取消</button>
        <button class="modal-btn modal-btn-confirm" id="bm-new-confirm">添加</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => document.getElementById('bm-new-title')?.focus(), 100);

    document.getElementById('bm-new-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.getElementById('bm-new-confirm').addEventListener('click', async () => {
      const title = document.getElementById('bm-new-title').value.trim();
      const url = document.getElementById('bm-new-url').value.trim();

      if (!url) {
        document.getElementById('bm-new-url').style.borderColor = 'var(--danger)';
        return;
      }

      try {
        // 添加到书签栏
        await chrome.bookmarks.create({
          parentId: '1', // "1"是书签栏的ID
          title: title || url,
          url: url
        });
        this._loadBookmarks();
        overlay.remove();
      } catch (error) {
        // 使用toast替代alert
        if (window.NewTabApp) {
          window.NewTabApp.showToast('添加失败: ' + error.message, 'error');
        }
      }
    });
  }

  /**
   * 获取网站favicon URL
   * 优先使用Chrome内置_favicon API（本地缓存，无网络请求）
   * 不可用时回退到Google favicon服务
   * @param {string} url - 完整URL
   * @returns {string|null} favicon URL
   * @private
   */
  _getFaviconUrl(url) {
    // 优先使用Chrome内置API（通过全局NewTabApp）
    if (window.NewTabApp && window.NewTabApp.getFaviconUrl) {
      const faviconUrl = window.NewTabApp.getFaviconUrl(url, 16);
      if (faviconUrl) return faviconUrl;
    }
    // 后备方案：使用Google favicon服务（比DuckDuckGo更稳定）
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return null;
    }
  }

  /**
   * 获取默认书签图标（data URI，无需网络请求）
   * @returns {string} 默认图标的data URI
   * @private
   */
  _getDefaultIcon() {
    // 使用data URI避免额外的网络请求
    return 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
      '<rect width="16" height="16" rx="2" fill="rgba(255,255,255,0.15)"/>' +
      '<text x="8" y="12" font-size="10" text-anchor="middle" fill="rgba(255,255,255,0.6)">🔗</text>' +
      '</svg>'
    );
  }

  /**
   * HTML转义，防止XSS
   * @param {string} str - 原始字符串
   * @returns {string} 转义后的字符串
   * @private
   */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 销毁组件
   */
  destroy() {
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
