/**
 * 书签管理组件
 * 显示浏览器书签树，支持展开/折叠、打开、编辑、删除
 * 支持搜索过滤快速定位书签
 */
class BookmarksComponent {
  /**
   * 构造函数
   * @param {Object} config - 组件配置
   */
  constructor(config) {
    this.config = config;
    this.el = null;
    this.tree = null; // 书签树容器
    this.searchInput = null; // 搜索输入框
    this._searchKeyword = ''; // 当前搜索关键词
    this._searchTimer = null; // 搜索防抖定时器
    this._bookmarkData = null; // 缓存原始书签数据，搜索时复用
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

    // 搜索栏（根据配置决定是否显示）
    const showSearch = this.config.components?.style?.bookmarks?.showSearch !== false;
    if (showSearch) {
      const searchBar = document.createElement('div');
      searchBar.className = 'bookmarks-search-bar';

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'bookmarks-search-input';
      searchInput.placeholder = '搜索书签...';
      // 搜索防抖：300ms延迟，避免频繁过滤
      searchInput.addEventListener('input', () => this._handleSearch());

      searchBar.appendChild(searchInput);
      card.appendChild(header);
      card.appendChild(searchBar);
    } else {
      card.appendChild(header);
    }

    // 书签树容器
    const tree = document.createElement('div');
    tree.className = 'bookmarks-tree';
    tree.id = 'bookmarks-tree';

    card.appendChild(tree);
    wrapper.appendChild(card);
    container.appendChild(wrapper);

    // 保存引用
    this.el = wrapper;
    this.tree = tree;
    this.searchInput = wrapper.querySelector('.bookmarks-search-input');

    // 延迟加载书签数据：使用requestIdleCallback在浏览器空闲时加载
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => this._loadBookmarks(), { timeout: 1000 });
    } else {
      setTimeout(() => this._loadBookmarks(), 100);
    }
  }

  /**
   * 搜索输入处理（300ms防抖）
   * @private
   */
  _handleSearch() {
    // 清除上一次的防抖定时器
    if (this._searchTimer) clearTimeout(this._searchTimer);
    // 设置新的防抖定时器
    this._searchTimer = setTimeout(() => {
      // 获取搜索关键词并转小写
      this._searchKeyword = (this.searchInput?.value || '').trim().toLowerCase();
      // 重新渲染书签树
      this._renderTree();
    }, 300);
  }

  /**
   * 从浏览器加载书签数据（仅加载，不渲染）
   * @private
   */
  async _loadBookmarks() {
    try {
      // 获取完整书签树
      const bookmarkTree = await chrome.bookmarks.getTree();
      // 缓存原始数据
      this._bookmarkData = bookmarkTree[0];
      // 渲染树
      this._renderTree();
    } catch (error) {
      this.tree.innerHTML = `<div style="color:var(--danger);padding:12px;">加载书签失败: ${error.message}</div>`;
    }
  }

  /**
   * 渲染书签树（根据搜索关键词过滤）
   * @private
   */
  _renderTree() {
    const root = this._bookmarkData;
    if (!root) return;

    // 使用DocumentFragment批量构建DOM
    const fragment = document.createDocumentFragment();

    if (root.children) {
      root.children.forEach(child => {
        // 跳过空文件夹
        if (child.children && child.children.length > 0) {
          const isSystemFolder = child.id === '1' || child.id === '2' || child.id === '0';

          if (isSystemFolder && child.children) {
            // 系统根文件夹：不显示文件夹名称，直接展开其内容
            child.children.forEach(subChild => {
              if (subChild.url) {
                // 搜索过滤：只显示匹配的书签
                if (this._matchesSearch(subChild)) {
                  const item = this._renderBookmark(subChild);
                  fragment.appendChild(item);
                }
              } else if (subChild.children && subChild.children.length > 0) {
                // 子文件夹：递归渲染（内部会过滤）
                const folderEl = this._renderFolder(subChild, 0);
                // 只有文件夹内有匹配项时才添加
                if (folderEl) fragment.appendChild(folderEl);
              }
            });
          } else {
            // 非系统文件夹：正常渲染
            const folderEl = this._renderFolder(child, 0);
            if (folderEl) fragment.appendChild(folderEl);
          }
        }
      });
    }

    // 一次性清空并插入
    this.tree.innerHTML = '';

    // 搜索无结果时显示提示
    if (fragment.childElementCount === 0 && this._searchKeyword) {
      const empty = document.createElement('div');
      empty.className = 'bookmarks-search-empty';
      empty.textContent = '没有匹配的书签';
      this.tree.appendChild(empty);
    } else {
      this.tree.appendChild(fragment);
    }
  }

  /**
   * 判断书签是否匹配当前搜索关键词
   * @param {Object} bookmark - 书签数据
   * @returns {boolean} 是否匹配
   * @private
   */
  _matchesSearch(bookmark) {
    // 无搜索关键词时全部匹配
    if (!this._searchKeyword) return true;
    // 匹配标题
    const title = (bookmark.title || '').toLowerCase();
    // 匹配URL
    const url = (bookmark.url || '').toLowerCase();
    return title.includes(this._searchKeyword) || url.includes(this._searchKeyword);
  }

  /**
   * 判断文件夹内是否有匹配的书签
   * @param {Object} folder - 文件夹节点
   * @returns {boolean} 是否有匹配项
   * @private
   */
  _folderHasMatch(folder) {
    // 无搜索关键词时全部匹配
    if (!this._searchKeyword) return true;
    // 递归检查子节点
    if (folder.children) {
      for (const child of folder.children) {
        if (child.url && this._matchesSearch(child)) return true;
        if (child.children && this._folderHasMatch(child)) return true;
      }
    }
    return false;
  }

  /**
   * 渲染书签文件夹
   * @param {Object} folder - 书签文件夹节点
   * @param {number} depth - 嵌套深度
   * @returns {HTMLElement|null} 文件夹DOM，无匹配项时返回null
   * @private
   */
  _renderFolder(folder, depth) {
    // 搜索模式下，文件夹内无匹配项则不渲染
    if (!this._folderHasMatch(folder)) return null;

    const folderEl = document.createElement('div');
    folderEl.className = 'bookmark-folder';

    // 文件夹头部（可点击展开/折叠）
    const header = document.createElement('div');
    header.className = 'bookmark-folder-header';

    // 展开箭头
    const arrow = document.createElement('span');
    arrow.className = 'folder-arrow';
    arrow.textContent = '▶';

    // 文件夹图标
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
          // 搜索过滤：只显示匹配的书签
          if (this._matchesSearch(child)) {
            const item = this._renderBookmark(child);
            childrenEl.appendChild(item);
          }
        } else if (child.children) {
          // 子文件夹（递归渲染）
          const subFolder = this._renderFolder(child, depth + 1);
          if (subFolder) childrenEl.appendChild(subFolder);
        }
      });
    }

    // 搜索模式下自动展开包含匹配项的文件夹
    const hasKeyword = !!this._searchKeyword;
    if (hasKeyword) {
      childrenEl.classList.add('expanded');
      arrow.classList.add('expanded');
    }

    // 点击头部展开/折叠
    header.addEventListener('click', () => {
      const isExpanded = childrenEl.classList.contains('expanded');
      if (isExpanded) {
        childrenEl.classList.remove('expanded');
        arrow.classList.remove('expanded');
      } else {
        childrenEl.classList.add('expanded');
        arrow.classList.add('expanded');
      }
    });

    folderEl.appendChild(header);
    folderEl.appendChild(childrenEl);

    return folderEl;
  }

  /**
   * 渲染单个书签项
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

    // 优先使用Chrome内置_favicon API获取图标
    const faviconUrl = this._getFaviconUrl(bookmark.url);
    if (faviconUrl) {
      favicon.src = faviconUrl;
    } else {
      favicon.src = this._getDefaultIcon();
    }

    // favicon加载失败时显示默认图标
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
        <textarea id="bm-title-input" rows="2" placeholder="书签标题">${this._escapeHtml(bookmark.title || '')}</textarea>
      </div>
      <div class="modal-field">
        <label>网址</label>
        <textarea id="bm-url-input" rows="2" placeholder="https://example.com">${this._escapeHtml(bookmark.url || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="bm-cancel">取消</button>
        <button class="modal-btn modal-btn-confirm" id="bm-confirm">保存</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('bm-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.getElementById('bm-confirm').addEventListener('click', async () => {
      const newTitle = document.getElementById('bm-title-input').value.trim();
      const newUrl = document.getElementById('bm-url-input').value.trim();

      try {
        await chrome.bookmarks.update(bookmark.id, {
          title: newTitle || bookmark.title,
          url: newUrl || bookmark.url
        });
        this._loadBookmarks();
        overlay.remove();
      } catch (error) {
        if (window.NewTabApp) {
          window.NewTabApp.showToast('更新失败: ' + error.message, 'error');
        }
      }
    });
  }

  /**
   * 删除书签
   * @param {string} id - 书签ID
   * @param {string} title - 书签标题
   * @private
   */
  async _deleteBookmark(id, title) {
    const confirmed = await window.NewTabApp.showConfirm(
      `确定删除书签"${title}"？`,
      { title: '删除书签', confirmText: '删除', type: 'danger' }
    );
    if (!confirmed) return;
    try {
      await chrome.bookmarks.remove(id);
      this._loadBookmarks();
    } catch (error) {
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
        <textarea id="bm-new-title" rows="2" placeholder="书签标题"></textarea>
      </div>
      <div class="modal-field">
        <label>网址</label>
        <textarea id="bm-new-url" rows="2" placeholder="https://example.com"></textarea>
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
        await chrome.bookmarks.create({
          parentId: '1',
          title: title || url,
          url: url
        });
        this._loadBookmarks();
        overlay.remove();
      } catch (error) {
        if (window.NewTabApp) {
          window.NewTabApp.showToast('添加失败: ' + error.message, 'error');
        }
      }
    });
  }

  /**
   * 获取网站favicon URL
   * @param {string} url - 完整URL
   * @returns {string|null} favicon URL
   * @private
   */
  _getFaviconUrl(url) {
    if (window.NewTabApp && window.NewTabApp.getFaviconUrl) {
      const faviconUrl = window.NewTabApp.getFaviconUrl(url, 16);
      if (faviconUrl) return faviconUrl;
    }
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return null;
    }
  }

  /**
   * 获取默认书签图标
   * @returns {string} 默认图标的data URI
   * @private
   */
  _getDefaultIcon() {
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
    // 清理搜索防抖定时器
    if (this._searchTimer) {
      clearTimeout(this._searchTimer);
      this._searchTimer = null;
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
