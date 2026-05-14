/**
 * 设置面板组件
 * 控制各组件的开关、排序、独立外观设置（颜色/透明度/模糊度）、背景设置、WebDAV备份
 * 所有下拉选择器使用自定义组件，不使用原生select
 * 每个组件可独立设置透明度、背景色、模糊度、文字颜色
 */
class SettingsComponent {
  /**
   * 构造函数
   * @param {Object} config - 组件配置
   * @param {Object} app - 主应用实例引用
   */
  constructor(config, app) {
    this.config = config;
    this.app = app;
    this.panel = null;
    this.overlay = null;
  }

  /**
   * 初始化设置面板（绑定按钮事件）
   */
  init() {
    const settingsBtn = document.getElementById('settings-btn');
    const closeBtn = document.getElementById('settings-close');
    this.panel = document.getElementById('settings-panel');
    this.overlay = document.getElementById('settings-overlay');

    settingsBtn.addEventListener('click', () => this.open());
    closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', () => this.close());

    this._renderSettings();
  }

  /**
   * 打开设置面板
   */
  open() {
    this.panel.classList.add('active');
    this.overlay.classList.add('active');
    this._renderSettings();
  }

  /**
   * 关闭设置面板
   */
  close() {
    this.panel.classList.remove('active');
    this.overlay.classList.remove('active');
  }

  /**
   * 渲染设置面板内容
   * @private
   */
  _renderSettings() {
    const body = document.getElementById('settings-body');
    body.innerHTML = '';

    this._renderComponentToggles(body); // 组件开关
    this._renderActionsToggle(body); // 操作按钮开关
    this._renderComponentOrder(body); // 组件排序
    this._renderComponentAppearance(body); // 各组件独立外观设置
    this._renderBackgroundSettings(body); // 背景设置
    this._renderSearchSettings(body); // 搜索引擎设置
    this._renderWebDAVSettings(body); // WebDAV备份
  }

  /**
   * 渲染组件开关设置
   * @param {HTMLElement} container - 容器
   * @private
   */
  _renderComponentToggles(container) {
    const group = this._createGroup('组件开关');

    const componentNames = this.app.COMPONENT_NAMES;

    Object.keys(componentNames).forEach(key => {
      const row = document.createElement('div');
      row.className = 'settings-row';

      const label = document.createElement('div');
      label.innerHTML = `<div class="settings-label">${componentNames[key]}</div>`;

      const toggle = this._createToggle(
        this.config.components?.enabled?.[key] !== false,
        (checked) => {
          if (!this.config.components) this.config.components = {};
          if (!this.config.components.enabled) this.config.components.enabled = {};
          this.config.components.enabled[key] = checked;
          this.app.saveConfig();
          this.app.renderComponents();
          // 刷新设置面板，使外观/排序区域同步更新
          this._renderSettings();
        }
      );

      row.appendChild(label);
      row.appendChild(toggle);
      group.appendChild(row);
    });

    container.appendChild(group);
  }

  /**
   * 渲染操作按钮开关
   * 控制所有组件上的操作按钮（添加、删除、编辑等）是否显示
   * 关闭后页面更简洁，适合只浏览不需要编辑的场景
   * @param {HTMLElement} container - 容器
   * @private
   */
  _renderActionsToggle(container) {
    const group = this._createGroup('操作按钮');

    const row = document.createElement('div');
    row.className = 'settings-row';

    // 标签和说明
    const label = document.createElement('div');
    label.innerHTML = `
      <div class="settings-label">显示操作按钮</div>
      <div class="settings-desc">关闭后隐藏所有组件上的添加、删除、编辑等按钮</div>
    `;

    // 开关控件
    const toggle = this._createToggle(
      this.config.showActions !== false, // 默认开启
      (checked) => {
        // 更新配置
        this.config.showActions = checked;
        this.app.saveConfig();
        // 实时应用可见性
        this.app.applyActionsVisibility();
      }
    );

    row.appendChild(label);
    row.appendChild(toggle);
    group.appendChild(row);
    container.appendChild(group);
  }

  /**
   * 渲染组件排序设置（拖拽排序）
   * @param {HTMLElement} container - 容器
   * @private
   */
  _renderComponentOrder(container) {
    const group = this._createGroup('组件排序（拖拽调整）');

    const sortList = document.createElement('div');
    sortList.className = 'sort-list';

    const componentNames = this.app.COMPONENT_NAMES;
    const order = this.config.components?.order || ['clock', 'search', 'links', 'notes', 'bookmarks'];

    order.forEach(key => {
      const item = document.createElement('div');
      item.className = 'sort-item';
      item.dataset.component = key;
      item.draggable = true;

      const drag = document.createElement('span');
      drag.className = 'sort-item-drag';
      drag.textContent = '⠿';

      const name = document.createElement('span');
      name.className = 'sort-item-name';
      name.textContent = componentNames[key] || key;

      item.appendChild(drag);
      item.appendChild(name);
      sortList.appendChild(item);
    });

    this._setupSortDrag(sortList);

    group.appendChild(sortList);
    container.appendChild(group);
  }

  /**
   * 渲染各组件独立外观设置
   * 每个组件一个可折叠区域，包含：背景色、透明度、模糊度、文字颜色
   * @param {HTMLElement} container - 容器
   * @private
   */
  _renderComponentAppearance(container) {
    const group = this._createGroup('组件外观（独立设置）');

    const componentNames = this.app.COMPONENT_NAMES;
    const order = this.config.components?.order || ['clock', 'search', 'links', 'notes', 'bookmarks'];
    const enabled = this.config.components?.enabled || {};

    order.forEach(key => {
      // 跳过已禁用的组件
      if (enabled[key] === false) return;

      const style = this.app.getComponentStyle(key);

      // 可折叠的外观设置区域
      const section = document.createElement('div');
      section.className = 'component-style-section';

      // 区域标题（点击折叠/展开）
      const header = document.createElement('div');
      header.className = 'component-style-header';

      const title = document.createElement('span');
      title.className = 'component-style-title';
      title.textContent = componentNames[key] || key;

      const arrow = document.createElement('span');
      arrow.className = 'component-style-arrow';
      arrow.textContent = '▶';

      header.appendChild(title);
      header.appendChild(arrow);

      // 设置内容区域（默认折叠）
      const content = document.createElement('div');
      content.className = 'component-style-content';

      // ====== 背景设置区 ======
      const bgGroupLabel = document.createElement('div');
      bgGroupLabel.className = 'style-group-label';
      bgGroupLabel.textContent = '背景';
      content.appendChild(bgGroupLabel);

      // 背景色选择器
      const bgColorRow = document.createElement('div');
      bgColorRow.className = 'settings-row';
      bgColorRow.innerHTML = '<div class="settings-label">背景色</div>';
      const bgColorPicker = this._createColorPicker(style.cardBgColor, (color) => {
        this._updateComponentStyle(key, 'cardBgColor', color);
      });
      bgColorRow.appendChild(bgColorPicker);
      content.appendChild(bgColorRow);

      // 透明度滑块
      const opacityControl = document.createElement('div');
      opacityControl.className = 'range-control';
      opacityControl.innerHTML = '<label>透明度 <span class="range-hint">0=无背景</span></label>';
      const opacitySlider = this._createRangeSlider(style.opacity ?? 0, 0, 1, 0.01, (val) => {
        this._updateComponentStyle(key, 'opacity', val);
      });
      opacityControl.appendChild(opacitySlider);
      content.appendChild(opacityControl);

      // 圆角滑块
      const radiusControl = document.createElement('div');
      radiusControl.className = 'range-control';
      radiusControl.innerHTML = '<label>圆角</label>';
      const radiusSlider = this._createRangeSlider(style.borderRadius ?? 12, 0, 40, 1, (val) => {
        this._updateComponentStyle(key, 'borderRadius', val);
      });
      radiusControl.appendChild(radiusSlider);
      content.appendChild(radiusControl);

      // 内边距滑块
      const paddingControl = document.createElement('div');
      paddingControl.className = 'range-control';
      paddingControl.innerHTML = '<label>内边距</label>';
      const paddingSlider = this._createRangeSlider(style.padding ?? 20, 0, 60, 2, (val) => {
        this._updateComponentStyle(key, 'padding', val);
      });
      paddingControl.appendChild(paddingSlider);
      content.appendChild(paddingControl);

      // ====== 文字设置区 ======
      const textGroupLabel = document.createElement('div');
      textGroupLabel.className = 'style-group-label';
      textGroupLabel.textContent = '文字';
      content.appendChild(textGroupLabel);

      // 文字颜色选择器
      const textColorRow = document.createElement('div');
      textColorRow.className = 'settings-row';
      textColorRow.innerHTML = '<div class="settings-label">文字颜色</div>';
      const textColorPicker = this._createColorPicker(style.textColor, (color) => {
        this._updateComponentStyle(key, 'textColor', color);
      });
      textColorRow.appendChild(textColorPicker);
      content.appendChild(textColorRow);

      // 内容字体大小滑块
      const fontSizeControl = document.createElement('div');
      fontSizeControl.className = 'range-control';
      fontSizeControl.innerHTML = '<label>字体大小</label>';
      const fontSizeSlider = this._createRangeSlider(style.fontSize ?? 14, 10, 28, 1, (val) => {
        this._updateComponentStyle(key, 'fontSize', val);
      });
      fontSizeControl.appendChild(fontSizeSlider);
      content.appendChild(fontSizeControl);

      // 内容字体粗细滑块
      const fontWeightControl = document.createElement('div');
      fontWeightControl.className = 'range-control';
      fontWeightControl.innerHTML = '<label>字体粗细</label>';
      const fontWeightSlider = this._createRangeSlider(style.fontWeight ?? 400, 100, 900, 100, (val) => {
        this._updateComponentStyle(key, 'fontWeight', val);
      });
      fontWeightControl.appendChild(fontWeightSlider);
      content.appendChild(fontWeightControl);

      // ====== 标题设置区 ======
      const titleGroupLabel = document.createElement('div');
      titleGroupLabel.className = 'style-group-label';
      titleGroupLabel.textContent = '标题';
      content.appendChild(titleGroupLabel);

      // 标题字体大小滑块
      const titleFontSizeControl = document.createElement('div');
      titleFontSizeControl.className = 'range-control';
      titleFontSizeControl.innerHTML = '<label>标题字体大小</label>';
      const titleFontSizeSlider = this._createRangeSlider(style.titleFontSize ?? 16, 10, 36, 1, (val) => {
        this._updateComponentStyle(key, 'titleFontSize', val);
      });
      titleFontSizeControl.appendChild(titleFontSizeSlider);
      content.appendChild(titleFontSizeControl);

      // 标题字体粗细滑块
      const titleFontWeightControl = document.createElement('div');
      titleFontWeightControl.className = 'range-control';
      titleFontWeightControl.innerHTML = '<label>标题字体粗细</label>';
      const titleFontWeightSlider = this._createRangeSlider(style.titleFontWeight ?? 600, 100, 900, 100, (val) => {
        this._updateComponentStyle(key, 'titleFontWeight', val);
      });
      titleFontWeightControl.appendChild(titleFontWeightSlider);
      content.appendChild(titleFontWeightControl);

      // ====== 时钟组件特有参数 ======
      if (key === 'clock') {
        const clockGroupLabel = document.createElement('div');
        clockGroupLabel.className = 'style-group-label';
        clockGroupLabel.textContent = '时钟数字';
        content.appendChild(clockGroupLabel);

        // 时钟数字大小
        const clockFontSizeControl = document.createElement('div');
        clockFontSizeControl.className = 'range-control';
        clockFontSizeControl.innerHTML = '<label>数字大小</label>';
        const clockFontSizeSlider = this._createRangeSlider(style.clockFontSize ?? 72, 24, 120, 2, (val) => {
          this._updateComponentStyle(key, 'clockFontSize', val);
        });
        clockFontSizeControl.appendChild(clockFontSizeSlider);
        content.appendChild(clockFontSizeControl);

        // 时钟数字粗细
        const clockFontWeightControl = document.createElement('div');
        clockFontWeightControl.className = 'range-control';
        clockFontWeightControl.innerHTML = '<label>数字粗细</label>';
        const clockFontWeightSlider = this._createRangeSlider(style.clockFontWeight ?? 200, 100, 900, 100, (val) => {
          this._updateComponentStyle(key, 'clockFontWeight', val);
        });
        clockFontWeightControl.appendChild(clockFontWeightSlider);
        content.appendChild(clockFontWeightControl);
      }

      // ====== 搜索组件特有参数：下拉框样式 ======
      if (key === 'search') {
        const dropdownGroupLabel = document.createElement('div');
        dropdownGroupLabel.className = 'style-group-label';
        dropdownGroupLabel.textContent = '下拉框';
        content.appendChild(dropdownGroupLabel);

        // 下拉框背景色
        const dropdownBgRow = document.createElement('div');
        dropdownBgRow.className = 'settings-row';
        dropdownBgRow.innerHTML = '<div class="settings-label">下拉框背景色</div>';
        const dropdownBgPicker = this._createColorPicker(style.dropdownBgColor ?? '#1e2032', (color) => {
          this._updateComponentStyle(key, 'dropdownBgColor', color);
        });
        dropdownBgRow.appendChild(dropdownBgPicker);
        content.appendChild(dropdownBgRow);

        // 下拉框文字色
        const dropdownTextRow = document.createElement('div');
        dropdownTextRow.className = 'settings-row';
        dropdownTextRow.innerHTML = '<div class="settings-label">下拉框文字色</div>';
        const dropdownTextPicker = this._createColorPicker(style.dropdownTextColor ?? '#ffffff', (color) => {
          this._updateComponentStyle(key, 'dropdownTextColor', color);
        });
        dropdownTextRow.appendChild(dropdownTextPicker);
        content.appendChild(dropdownTextRow);
      }

      // 重置此组件外观按钮（与上方参数保持间距）
      const resetBtn = document.createElement('button');
      resetBtn.className = 'settings-btn settings-btn-danger style-reset-btn';
      resetBtn.textContent = '重置此组件外观';
      resetBtn.addEventListener('click', () => {
        this._resetComponentStyle(key);
      });
      content.appendChild(resetBtn);

      section.appendChild(header);
      section.appendChild(content);
      group.appendChild(section);

      // 折叠/展开交互
      header.addEventListener('click', () => {
        const isExpanded = content.classList.contains('expanded');
        content.classList.toggle('expanded', !isExpanded);
        arrow.classList.toggle('expanded', !isExpanded);
      });
    });

    // 全部重置按钮
    const resetAllBtn = document.createElement('button');
    resetAllBtn.className = 'settings-btn settings-btn-danger';
    resetAllBtn.textContent = '重置所有组件外观';
    resetAllBtn.style.marginTop = '12px';
    resetAllBtn.addEventListener('click', () => {
      Object.keys(componentNames).forEach(key => {
        this._resetComponentStyle(key);
      });
      this.app.showToast('已重置所有组件外观');
      this._renderSettings();
    });
    group.appendChild(resetAllBtn);

    container.appendChild(group);
  }

  /**
   * 更新指定组件的外观配置并实时应用
   * @param {string} componentKey - 组件键名
   * @param {string} styleKey - 样式键名
   * @param {*} value - 新值
   * @private
   */
  _updateComponentStyle(componentKey, styleKey, value) {
    if (!this.config.components) this.config.components = {};
    if (!this.config.components.style) this.config.components.style = {};
    if (!this.config.components.style[componentKey]) {
      // 使用纯默认值初始化（不读取用户已保存的配置）
      const defaults = this.app.getDefaultComponentStyle(componentKey);
      this.config.components.style[componentKey] = { ...defaults };
    }
    this.config.components.style[componentKey][styleKey] = value;
    this.app.saveConfig();

    // 实时应用样式到对应组件DOM
    const wrapper = document.querySelector(`[data-component="${componentKey}"]`);
    if (wrapper) {
      this.app.applyComponentStyle(wrapper, componentKey);
    }
  }

  /**
   * 重置指定组件的外观为默认值
   * @param {string} componentKey - 组件键名
   * @private
   */
  _resetComponentStyle(componentKey) {
    if (!this.config.components?.style) return;
    // 使用纯默认值重置（不读取用户已保存的配置）
    const defaults = this.app.getDefaultComponentStyle(componentKey);
    this.config.components.style[componentKey] = { ...defaults };
    this.app.saveConfig();

    // 实时应用
    const wrapper = document.querySelector(`[data-component="${componentKey}"]`);
    if (wrapper) {
      this.app.applyComponentStyle(wrapper, componentKey);
    }
  }

  /**
   * 创建颜色选择器
   * @param {string} initialColor - 初始颜色值
   * @param {Function} onChange - 颜色变化回调
   * @returns {HTMLElement} 颜色选择器DOM
   * @private
   */
  _createColorPicker(initialColor, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'color-picker-wrapper';

    const input = document.createElement('input');
    input.type = 'color';
    input.value = initialColor;
    input.addEventListener('input', () => onChange(input.value));

    wrapper.appendChild(input);
    return wrapper;
  }

  /**
   * 创建范围滑块
   * @param {number} initialValue - 初始值
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @param {number} step - 步长
   * @param {Function} onChange - 值变化回调
   * @returns {HTMLElement} 包含滑块和数值显示的容器
   * @private
   */
  _createRangeSlider(initialValue, min, max, step, onChange) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '8px';
    container.style.flex = '1';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = initialValue;
    slider.style.flex = '1';

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'range-value';
    valueDisplay.textContent = initialValue;

    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      valueDisplay.textContent = val;
      onChange(val);
    });

    container.appendChild(slider);
    container.appendChild(valueDisplay);
    return container;
  }

  /**
   * 渲染背景设置
   * 包含背景URL输入、图片/视频类型切换按钮、应用和恢复默认按钮
   * @param {HTMLElement} container - 容器
   * @private
   */
  _renderBackgroundSettings(container) {
    const group = this._createGroup('背景设置');

    // 背景URL输入区域
    const urlField = document.createElement('div');
    urlField.style.marginBottom = '12px';

    const urlLabel = document.createElement('div');
    urlLabel.className = 'settings-label';
    urlLabel.style.marginBottom = '8px';
    urlLabel.textContent = '背景地址（支持图片和视频URL）';

    const urlInput = document.createElement('input');
    urlInput.className = 'settings-input';
    urlInput.type = 'url';
    urlInput.placeholder = 'https://example.com/bg.jpg 或 .mp4';
    urlInput.value = this.config.background?.url || '';

    urlField.appendChild(urlLabel);
    urlField.appendChild(urlInput);

    // 图片/视频类型切换按钮
    // 因为很多URL没有文件名后缀，自动判断不准确，需要手动切换
    const typeToggleRow = document.createElement('div');
    typeToggleRow.className = 'settings-row';
    typeToggleRow.innerHTML = '<div class="settings-label">背景类型</div>';

    // 当前背景类型（从配置读取，默认image）
    const currentType = this.config.background?.type || 'image';

    // 创建类型切换按钮组
    const typeToggle = document.createElement('div');
    typeToggle.className = 'bg-type-toggle';

    // 图片类型按钮
    const imageBtn = document.createElement('button');
    imageBtn.className = 'bg-type-btn' + (currentType === 'image' ? ' active' : '');
    imageBtn.textContent = '🖼️ 图片';
    imageBtn.addEventListener('click', () => {
      // 切换为图片类型
      imageBtn.classList.add('active');
      videoBtn.classList.remove('active');
      // 更新配置中的类型
      if (!this.config.background) this.config.background = {};
      this.config.background.type = 'image';
    });

    // 视频类型按钮
    const videoBtn = document.createElement('button');
    videoBtn.className = 'bg-type-btn' + (currentType === 'video' ? ' active' : '');
    videoBtn.textContent = '🎬 视频';
    videoBtn.addEventListener('click', () => {
      // 切换为视频类型
      videoBtn.classList.add('active');
      imageBtn.classList.remove('active');
      // 更新配置中的类型
      if (!this.config.background) this.config.background = {};
      this.config.background.type = 'video';
    });

    typeToggle.appendChild(imageBtn);
    typeToggle.appendChild(videoBtn);
    typeToggleRow.appendChild(typeToggle);

    // 应用背景按钮
    const applyBtn = document.createElement('button');
    applyBtn.className = 'settings-btn settings-btn-primary';
    applyBtn.textContent = '应用背景';
    applyBtn.style.marginTop = '8px';
    applyBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      // 获取当前选择的类型（从按钮active状态读取）
      const selectedType = videoBtn.classList.contains('active') ? 'video' : 'image';
      if (this.app.backgroundComponent) {
        // 传递类型参数，让背景组件按指定类型处理
        this.app.backgroundComponent.updateBackground(url, selectedType);
      }
    });

    // 恢复默认背景按钮
    const resetBtn = document.createElement('button');
    resetBtn.className = 'settings-btn settings-btn-danger';
    resetBtn.textContent = '恢复默认背景';
    resetBtn.addEventListener('click', () => {
      urlInput.value = '';
      // 重置类型为图片
      imageBtn.classList.add('active');
      videoBtn.classList.remove('active');
      if (this.app.backgroundComponent) {
        this.app.backgroundComponent.updateBackground('');
      }
    });

    group.appendChild(urlField);
    group.appendChild(typeToggleRow);
    group.appendChild(applyBtn);
    group.appendChild(resetBtn);
    container.appendChild(group);
  }

  /**
   * 渲染搜索引擎设置（自定义下拉选择器）
   * @param {HTMLElement} container - 容器
   * @private
   */
  _renderSearchSettings(container) {
    const group = this._createGroup('搜索引擎');

    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('div');
    label.innerHTML = '<div class="settings-label">默认搜索引擎</div>';

    const engines = [
      { id: 'baidu', name: '百度', icon: '🔍' },
      { id: 'google', name: 'Google', icon: '🌐' },
      { id: 'bing', name: '必应', icon: '🅱️' },
      { id: 'bilibili', name: 'B站', icon: '📺' },
      { id: 'douyin', name: '抖音', icon: '🎵' },
      { id: 'github', name: 'GitHub', icon: '💻' },
      { id: 'zhihu', name: '知乎', icon: '💡' },
      { id: 'taobao', name: '淘宝', icon: '🛒' }
    ];

    const defaultEngine = this.config.search?.default || 'baidu';
    const selector = this._createSelector(engines, defaultEngine, (engineId) => {
      if (!this.config.search) this.config.search = {};
      this.config.search.default = engineId;
      this.app.saveConfig();
    });

    row.appendChild(label);
    row.appendChild(selector);
    group.appendChild(row);
    container.appendChild(group);
  }

  /**
   * 创建自定义下拉选择器（替代原生select）
   * @param {Array} options - 选项列表 [{id, name, icon?}]
   * @param {string} selectedId - 当前选中项ID
   * @param {Function} onChange - 选择变化回调
   * @returns {HTMLElement} 选择器DOM
   * @private
   */
  _createSelector(options, selectedId, onChange) {
    const selector = document.createElement('div');
    selector.className = 'settings-selector';

    const current = options.find(o => o.id === selectedId) || options[0];

    const btn = document.createElement('div');
    btn.className = 'settings-selector-btn';
    btn.innerHTML = `<span>${current.icon ? current.icon + ' ' : ''}${current.name}</span><span class="arrow">▼</span>`;

    const dropdown = document.createElement('div');
    dropdown.className = 'settings-selector-dropdown';

    options.forEach(opt => {
      const optionEl = document.createElement('div');
      optionEl.className = 'settings-selector-option' + (opt.id === selectedId ? ' active' : '');
      optionEl.textContent = (opt.icon ? opt.icon + ' ' : '') + opt.name;

      optionEl.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.innerHTML = `<span>${opt.icon ? opt.icon + ' ' : ''}${opt.name}</span><span class="arrow">▼</span>`;
        dropdown.querySelectorAll('.settings-selector-option').forEach(el => el.classList.remove('active'));
        optionEl.classList.add('active');
        dropdown.classList.remove('show');
        btn.classList.remove('open');
        onChange(opt.id);
      });

      dropdown.appendChild(optionEl);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('show');
      dropdown.classList.toggle('show', !isOpen);
      btn.classList.toggle('open', !isOpen);
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
      btn.classList.remove('open');
    });

    selector.appendChild(btn);
    selector.appendChild(dropdown);
    return selector;
  }

  /**
   * 渲染WebDAV备份设置
   * @param {HTMLElement} container - 容器
   * @private
   */
  _renderWebDAVSettings(container) {
    const group = this._createGroup('主页配置备份');

    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.6;';
    desc.textContent = '将主页配置（快捷链接、笔记、背景、组件设置等）备份到WebDAV，可在不同设备间同步。';

    const backupBtn = document.createElement('button');
    backupBtn.className = 'settings-btn settings-btn-primary';
    backupBtn.textContent = '⬆️ 备份主页配置到WebDAV';
    backupBtn.addEventListener('click', () => this._backupConfig());

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'settings-btn settings-btn-primary';
    restoreBtn.textContent = '⬇️ 从WebDAV恢复主页配置';
    restoreBtn.addEventListener('click', () => this._restoreConfig());

    group.appendChild(desc);
    group.appendChild(backupBtn);
    group.appendChild(restoreBtn);
    container.appendChild(group);
  }

  /**
   * 备份主页配置到WebDAV
   * @private
   */
  async _backupConfig() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'BACKUP_NEWTAB' });
      if (response?.success) {
        this.app.showToast('主页配置备份成功！');
      } else {
        this.app.showToast(response?.error || '备份失败', 'error');
      }
    } catch (error) {
      this.app.showToast('备份失败: ' + error.message, 'error');
    }
  }

  /**
   * 从WebDAV恢复主页配置
   * 使用自定义确认弹窗替代原生confirm
   * @private
   */
  async _restoreConfig() {
    try {
      // 使用自定义确认弹窗替代原生confirm
      const confirmed = await this.app.showConfirm(
        '恢复将覆盖当前主页配置，确定继续？',
        { title: '恢复配置', confirmText: '确定恢复', type: 'warning' }
      );
      if (!confirmed) return; // 用户取消

      const response = await chrome.runtime.sendMessage({ type: 'RESTORE_NEWTAB' });
      if (response?.success) {
        this.app.showToast('主页配置恢复成功！页面将刷新');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        this.app.showToast(response?.error || '恢复失败', 'error');
      }
    } catch (error) {
      this.app.showToast('恢复失败: ' + error.message, 'error');
    }
  }

  /**
   * 设置排序列表拖拽
   * @param {HTMLElement} sortList - 排序列表DOM
   * @private
   */
  _setupSortDrag(sortList) {
    let draggedItem = null;

    sortList.addEventListener('dragstart', (e) => {
      draggedItem = e.target.closest('.sort-item');
      if (draggedItem) {
        draggedItem.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    sortList.addEventListener('dragend', () => {
      if (draggedItem) {
        draggedItem.style.opacity = '';
        draggedItem = null;
      }
      const items = sortList.querySelectorAll('.sort-item');
      const newOrder = Array.from(items).map(item => item.dataset.component);
      if (!this.config.components) this.config.components = {};
      this.config.components.order = newOrder;
      this.app.saveConfig();
      this.app.renderComponents();
    });

    sortList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('.sort-item');
      if (target && target !== draggedItem) {
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          sortList.insertBefore(draggedItem, target);
        } else {
          sortList.insertBefore(draggedItem, target.nextSibling);
        }
      }
    });
  }

  /**
   * 创建设置分组
   * @param {string} title - 分组标题
   * @returns {HTMLElement} 分组DOM
   * @private
   */
  _createGroup(title) {
    const group = document.createElement('div');
    group.className = 'settings-group';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'settings-group-title';
    groupTitle.textContent = title;

    group.appendChild(groupTitle);
    return group;
  }

  /**
   * 创建开关组件
   * @param {boolean} checked - 初始状态
   * @param {Function} onChange - 状态变化回调
   * @returns {HTMLElement} 开关DOM
   * @private
   */
  _createToggle(checked, onChange) {
    const label = document.createElement('label');
    label.className = 'toggle-switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    input.addEventListener('change', () => onChange(input.checked));

    label.appendChild(input);
    label.appendChild(slider);
    return label;
  }

  /**
   * 销毁组件
   */
  destroy() {
    this.close();
  }
}
