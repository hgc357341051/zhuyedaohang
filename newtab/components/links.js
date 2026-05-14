/**
 * 快捷链接组件
 * 自定义网页链接和图标，点击快速访问
 * 支持拖拽排序链接顺序
 */
class LinksComponent {
  /**
   * 构造函数
   * @param {Object} config - 组件配置
   */
  constructor(config) {
    this.config = config;
    this.el = null;
    this.draggedLinkIndex = null; // 当前拖拽中的链接索引
  }

  /**
   * 渲染组件
   * @param {HTMLElement} container - 父容器
   */
  render(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'component-wrapper';
    wrapper.dataset.component = 'links';

    const card = document.createElement('div');
    card.className = 'glass-card links-component';

    // 头部：标题 + 添加按钮
    const header = document.createElement('div');
    header.className = 'links-header';

    const title = document.createElement('div');
    title.className = 'links-title';
    title.textContent = '快捷链接';

    const addBtn = document.createElement('button');
    addBtn.className = 'links-add-btn';
    addBtn.textContent = '+ 添加';

    header.appendChild(title);
    header.appendChild(addBtn);

    // 链接网格
    const grid = document.createElement('div');
    grid.className = 'links-grid';
    grid.id = 'links-grid';

    card.appendChild(header);
    card.appendChild(grid);
    wrapper.appendChild(card);
    container.appendChild(wrapper);

    // 保存引用
    this.el = wrapper;
    this.grid = grid;
    this.addBtn = addBtn;

    // 渲染已有链接
    this._renderLinks();
    // 绑定事件
    this._bindEvents();
  }

  /**
   * 渲染所有快捷链接
   * @private
   */
  _renderLinks() {
    // 清空网格
    this.grid.innerHTML = '';
    // 获取已保存的链接列表
    const links = this.config.links || [];

    // 渲染每个链接
    links.forEach((link, index) => {
      const item = this._createLinkItem(link, index);
      this.grid.appendChild(item);
    });

    // 添加"新增链接"占位卡片
    const addItem = document.createElement('div');
    addItem.className = 'link-item link-item-add';
    addItem.innerHTML = `
      <div class="link-icon">+</div>
      <div class="link-title">添加</div>
    `;
    // 点击添加新链接
    addItem.addEventListener('click', () => this._showAddModal());
    this.grid.appendChild(addItem);
  }

  /**
   * 创建单个链接卡片
   * 支持拖拽排序（draggable属性）
   * @param {Object} link - 链接数据 {title, url, icon}
   * @param {number} index - 链接在列表中的索引
   * @returns {HTMLElement} 链接卡片DOM
   * @private
   */
  _createLinkItem(link, index) {
    const item = document.createElement('div');
    item.className = 'link-item';
    item.draggable = true; // 允许拖拽排序
    item.dataset.linkIndex = index; // 存储索引，用于拖拽排序

    // 链接图标
    const iconEl = document.createElement('div');
    iconEl.className = 'link-icon';

    if (link.icon) {
      // 用户自定义图标URL，直接使用
      const img = document.createElement('img');
      img.src = link.icon;
      img.alt = link.title;
      // 图标加载失败时显示首字母后备方案（使用addEventListener避免CSP问题）
      img.addEventListener('error', () => {
        img.remove();
        iconEl.textContent = (link.title || '?')[0].toUpperCase();
      });
      iconEl.appendChild(img);
    } else {
      // 使用Chrome内置_favicon API获取网站图标（无需网络请求）
      const faviconUrl = this._getFaviconUrl(link.url);
      if (faviconUrl) {
        const img = document.createElement('img');
        img.src = faviconUrl;
        img.alt = link.title;
        // favicon加载失败时显示首字母后备方案（使用addEventListener避免CSP问题）
        img.addEventListener('error', () => {
          img.remove();
          iconEl.textContent = (link.title || '?')[0].toUpperCase();
        });
        iconEl.appendChild(img);
      } else {
        // API不可用时直接显示首字母
        iconEl.textContent = (link.title || '?')[0].toUpperCase();
      }
    }

    // 链接标题
    const titleEl = document.createElement('div');
    titleEl.className = 'link-title';
    titleEl.textContent = link.title || '未命名';

    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'link-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = '删除';
    // 阻止事件冒泡，避免触发链接点击
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._deleteLink(index);
    });

    // 点击链接打开网页
    item.addEventListener('click', () => {
      if (link.url) window.open(link.url, '_blank');
    });

    // 拖拽排序事件：开始拖拽
    item.addEventListener('dragstart', (e) => {
      // 记录拖拽中的链接索引
      this.draggedLinkIndex = index;
      // 设置拖拽数据（必须设置，否则拖拽不生效）
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      // 添加拖拽中样式
      requestAnimationFrame(() => {
        item.classList.add('link-dragging');
      });
    });

    // 拖拽排序事件：拖拽结束
    item.addEventListener('dragend', () => {
      // 清除拖拽状态
      this.draggedLinkIndex = null;
      item.classList.remove('link-dragging');
      // 清除所有拖拽悬停样式
      this.grid.querySelectorAll('.link-drag-over').forEach(el => {
        el.classList.remove('link-drag-over');
      });
    });

    // 拖拽排序事件：拖拽经过（允许放置）
    item.addEventListener('dragover', (e) => {
      e.preventDefault(); // 必须阻止默认行为才能允许drop
      e.dataTransfer.dropEffect = 'move';
      // 不在自己上方时显示放置指示
      if (this.draggedLinkIndex !== null && this.draggedLinkIndex !== index) {
        item.classList.add('link-drag-over');
      }
    });

    // 拖拽排序事件：拖拽离开
    item.addEventListener('dragleave', () => {
      item.classList.remove('link-drag-over');
    });

    // 拖拽排序事件：放下（完成排序）
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('link-drag-over');

      // 从拖拽数据获取源索引
      const fromIndex = this.draggedLinkIndex;
      const toIndex = index;

      // 索引有效且不是同一位置时执行排序
      if (fromIndex !== null && fromIndex !== toIndex && this.config.links) {
        // 从数组中取出被拖拽的链接
        const [movedLink] = this.config.links.splice(fromIndex, 1);
        // 插入到目标位置
        this.config.links.splice(toIndex, 0, movedLink);
        // 保存并重新渲染
        this._saveAndRefresh();
      }
    });

    item.appendChild(iconEl);
    item.appendChild(titleEl);
    item.appendChild(deleteBtn);
    return item;
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
      const faviconUrl = window.NewTabApp.getFaviconUrl(url, 32);
      if (faviconUrl) return faviconUrl;
    }
    // 后备方案：使用Google favicon服务（比DuckDuckGo更稳定）
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  }

  /**
   * 显示添加链接弹窗
   * @private
   */
  _showAddModal() {
    // 创建弹窗遮罩
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';

    const modal = document.createElement('div');
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-title">添加快捷链接</div>
      <div class="modal-field">
        <label>标题</label>
        <input type="text" id="link-title-input" placeholder="例如：GitHub">
      </div>
      <div class="modal-field">
        <label>网址</label>
        <input type="url" id="link-url-input" placeholder="https://github.com">
      </div>
      <div class="modal-field">
        <label>图标URL（可选）</label>
        <input type="url" id="link-icon-input" placeholder="留空自动获取">
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" id="link-cancel">取消</button>
        <button class="modal-btn modal-btn-confirm" id="link-confirm">添加</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 聚焦标题输入框
    setTimeout(() => document.getElementById('link-title-input')?.focus(), 100);

    // 取消按钮
    document.getElementById('link-cancel').addEventListener('click', () => {
      overlay.remove();
    });

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // 确认添加
    document.getElementById('link-confirm').addEventListener('click', () => {
      const title = document.getElementById('link-title-input').value.trim();
      const url = document.getElementById('link-url-input').value.trim();
      const icon = document.getElementById('link-icon-input').value.trim();

      // URL必填
      if (!url) {
        document.getElementById('link-url-input').style.borderColor = 'var(--danger)';
        return;
      }

      // 添加到配置
      if (!this.config.links) this.config.links = [];
      this.config.links.push({ title: title || '未命名', url, icon });
      // 保存并重新渲染
      this._saveAndRefresh();
      overlay.remove();
    });
  }

  /**
   * 删除链接
   * 使用自定义确认弹窗替代原生confirm
   * @param {number} index - 要删除的链接索引
   * @private
   */
  async _deleteLink(index) {
    if (!this.config.links) return;
    // 使用自定义确认弹窗
    const confirmed = await window.NewTabApp.showConfirm(
      `确定删除"${this.config.links[index]?.title}"？`,
      { title: '删除链接', confirmText: '删除', type: 'danger' }
    );
    if (!confirmed) return; // 用户取消
    this.config.links.splice(index, 1);
    this._saveAndRefresh();
  }

  /**
   * 保存配置并刷新渲染
   * @private
   */
  _saveAndRefresh() {
    // 通知主编排器保存配置
    if (window.NewTabApp) {
      window.NewTabApp.saveConfig();
    }
    this._renderLinks();
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 添加按钮点击
    this.addBtn.addEventListener('click', () => this._showAddModal());
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
