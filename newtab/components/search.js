/**
 * 搜索组件
 * 支持多搜索引擎切换搜索
 * 使用自定义下拉菜单替代原生select，视觉效果更统一
 */
class SearchComponent {
  /**
   * 构造函数
   * @param {Object} config - 组件配置
   */
  constructor(config) {
    this.config = config;
    this.el = null;
    this.currentEngine = null; // 当前选中的搜索引擎ID
    this.dropdownOpen = false; // 下拉菜单是否打开
  }

  /**
   * 渲染组件
   * @param {HTMLElement} container - 父容器
   */
  render(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'component-wrapper';
    wrapper.dataset.component = 'search';

    const card = document.createElement('div');
    card.className = 'glass-card search-component';

    // 搜索栏容器
    const searchBar = document.createElement('div');
    searchBar.className = 'search-bar';

    // 搜索引擎配置列表
    const engines = this._getEngines();
    // 获取用户默认搜索引擎
    this.currentEngine = this.config.search?.default || 'baidu';
    const current = engines.find(e => e.id === this.currentEngine) || engines[0];

    // 自定义搜索引擎选择器（替代原生select）
    const selector = document.createElement('div');
    selector.className = 'search-engine-selector';

    // 当前引擎按钮
    const engineBtn = document.createElement('button');
    engineBtn.className = 'search-engine-btn';
    engineBtn.innerHTML = `<span class="engine-icon">${current.icon}</span><span class="engine-name">${current.name}</span><span class="arrow">▼</span>`;

    // 下拉菜单面板
    const dropdown = document.createElement('div');
    dropdown.className = 'search-engine-dropdown';

    // 填充搜索引擎选项
    engines.forEach(engine => {
      const option = document.createElement('div');
      option.className = 'search-engine-option' + (engine.id === this.currentEngine ? ' active' : '');
      option.dataset.engineId = engine.id;
      option.innerHTML = `<span class="engine-icon">${engine.icon}</span><span>${engine.name}</span>`;

      // 点击选项切换搜索引擎
      option.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止冒泡，避免触发document点击关闭
        this._selectEngine(engine.id);
      });

      dropdown.appendChild(option);
    });

    selector.appendChild(engineBtn);
    selector.appendChild(dropdown);

    // 点击按钮切换下拉菜单
    engineBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleDropdown();
    });

    // 搜索输入框
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'search-input';
    input.id = 'search-input';
    input.placeholder = `${current.name}搜索...`;
    input.autofocus = true;

    // 搜索按钮
    const btn = document.createElement('button');
    btn.className = 'search-btn';
    btn.textContent = '搜索';

    // 组装搜索栏
    searchBar.appendChild(selector);
    searchBar.appendChild(input);
    searchBar.appendChild(btn);

    card.appendChild(searchBar);
    wrapper.appendChild(card);
    container.appendChild(wrapper);

    // 保存引用
    this.el = wrapper;
    this.selector = selector;
    this.engineBtn = engineBtn;
    this.dropdown = dropdown;
    this.input = input;
    this.btn = btn;

    // 绑定事件
    this._bindEvents();
  }

  /**
   * 获取支持的搜索引擎列表（含图标）
   * @returns {Array} 搜索引擎配置数组
   * @private
   */
  _getEngines() {
    return [
      { id: 'baidu', name: '百度', icon: '🔍', url: 'https://www.baidu.com/s?wd=' },
      { id: 'google', name: 'Google', icon: '🌐', url: 'https://www.google.com/search?q=' },
      { id: 'bing', name: '必应', icon: '🅱️', url: 'https://www.bing.com/search?q=' },
      { id: 'bilibili', name: 'B站', icon: '📺', url: 'https://search.bilibili.com/all?keyword=' },
      { id: 'douyin', name: '抖音', icon: '🎵', url: 'https://www.douyin.com/search/' },
      { id: 'github', name: 'GitHub', icon: '💻', url: 'https://github.com/search?q=' },
      { id: 'zhihu', name: '知乎', icon: '💡', url: 'https://www.zhihu.com/search?q=' },
      { id: 'taobao', name: '淘宝', icon: '🛒', url: 'https://s.taobao.com/search?q=' }
    ];
  }

  /**
   * 切换下拉菜单显示/隐藏
   * 同时提升/恢复组件wrapper层级，防止被其他组件遮挡
   * @private
   */
  _toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
    if (this.dropdownOpen) {
      this.dropdown.classList.add('show');
      this.engineBtn.classList.add('open');
      // 提升wrapper层级，使下拉框不被下方组件遮挡
      this.el.classList.add('dropdown-active');
    } else {
      this.dropdown.classList.remove('show');
      this.engineBtn.classList.remove('open');
      // 恢复wrapper层级
      this.el.classList.remove('dropdown-active');
    }
  }

  /**
   * 关闭下拉菜单
   * @private
   */
  _closeDropdown() {
    this.dropdownOpen = false;
    this.dropdown.classList.remove('show');
    this.engineBtn.classList.remove('open');
    // 恢复wrapper层级
    this.el.classList.remove('dropdown-active');
  }

  /**
   * 选择搜索引擎
   * @param {string} engineId - 搜索引擎ID
   * @private
   */
  _selectEngine(engineId) {
    this.currentEngine = engineId;
    const engines = this._getEngines();
    const engine = engines.find(e => e.id === engineId);
    if (!engine) return;

    // 更新按钮显示
    this.engineBtn.innerHTML = `<span class="engine-icon">${engine.icon}</span><span class="engine-name">${engine.name}</span><span class="arrow">▼</span>`;

    // 更新下拉选项高亮
    this.dropdown.querySelectorAll('.search-engine-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.engineId === engineId);
    });

    // 更新输入框placeholder
    this.input.placeholder = `${engine.name}搜索...`;

    // 保存偏好到配置
    if (this.config.search) {
      this.config.search.default = engineId;
    }

    // 关闭下拉菜单
    this._closeDropdown();

    // 聚焦输入框方便用户继续输入
    this.input.focus();
  }

  /**
   * 绑定搜索事件
   * @private
   */
  _bindEvents() {
    // 点击搜索按钮
    this.btn.addEventListener('click', () => this._doSearch());
    // 回车搜索
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._doSearch();
    });
    // 点击页面其他区域关闭下拉菜单
    document.addEventListener('click', (e) => {
      if (!this.selector.contains(e.target)) {
        this._closeDropdown();
      }
    });
  }

  /**
   * 执行搜索：跳转到对应搜索引擎结果页
   * @private
   */
  _doSearch() {
    const query = this.input.value.trim();
    if (!query) return;

    const engines = this._getEngines();
    const engine = engines.find(e => e.id === this.currentEngine);
    if (engine) {
      window.location.href = engine.url + encodeURIComponent(query);
    }
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
