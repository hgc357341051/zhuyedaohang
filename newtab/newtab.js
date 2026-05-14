/**
 * 新标签页主编排器
 * 负责加载配置、初始化组件、管理网格拖拽排序、保存配置、动态应用外观样式
 * 支持每个组件独立设置透明度、颜色、模糊度
 */
(function () {
  'use strict';

  // ========== 默认配置 ==========
  const DEFAULT_CONFIG = {
    // 背景配置
    background: {
      url: '',
      type: 'image'
    },
    // 组件配置
    components: {
      // 组件显示顺序
      order: ['clock', 'search', 'links', 'notes', 'bookmarks'],
      // 各组件启用状态
      enabled: {
        clock: true,
        search: true,
        links: true,
        notes: true,
        bookmarks: true
      },
      // 各组件独立外观设置
      style: {
        clock: { cardBgColor: '#ffffff', opacity: 0, textColor: '#ffffff', fontSize: 14, fontWeight: 400, titleFontSize: 16, titleFontWeight: 600, borderRadius: 12, padding: 20, clockFontSize: 72, clockFontWeight: 200 },
        search: { cardBgColor: '#ffffff', opacity: 0, textColor: '#ffffff', fontSize: 14, fontWeight: 400, titleFontSize: 16, titleFontWeight: 600, borderRadius: 12, padding: 20, dropdownBgColor: '#1e2032', dropdownTextColor: '#ffffff' },
        links: { cardBgColor: '#ffffff', opacity: 0, textColor: '#ffffff', fontSize: 11, fontWeight: 400, titleFontSize: 16, titleFontWeight: 600, borderRadius: 12, padding: 20, showAddCard: true },
        notes: { cardBgColor: '#ffffff', opacity: 0, textColor: '#ffffff', fontSize: 14, fontWeight: 400, titleFontSize: 16, titleFontWeight: 600, borderRadius: 12, padding: 20 },
        bookmarks: { cardBgColor: '#ffffff', opacity: 0, textColor: '#ffffff', fontSize: 14, fontWeight: 400, titleFontSize: 16, titleFontWeight: 600, borderRadius: 12, padding: 20, showSearch: true }
      }
    },
    // 搜索配置
    search: {
      default: 'baidu'
    },
    // 是否显示组件操作按钮（删除、编辑、添加等）
    // 默认关闭，用户可在设置面板中开启
    showActions: false,
    // 快捷链接列表
    links: [],
    // 备忘笔记列表
    notes: []
  };

  // ========== 组件名称映射 ==========
  const COMPONENT_NAMES = {
    clock: '🕐 时钟',
    search: '🔍 搜索',
    links: '🔗 快捷链接',
    notes: '📝 备忘笔记',
    bookmarks: '⭐ 书签'
  };

  // ========== 组件类映射 ==========
  const COMPONENT_CLASSES = {
    clock: ClockComponent,
    search: SearchComponent,
    links: LinksComponent,
    notes: NotesComponent,
    bookmarks: BookmarksComponent
  };

  // ========== 应用状态 ==========
  let config = null; // 当前配置
  let components = {}; // 已创建的组件实例
  let backgroundComponent = null; // 背景组件实例
  let settingsComponent = null; // 设置组件实例

  // ========== favicon缓存，避免重复生成URL ==========
  const faviconCache = new Map();

  // ========== 全局API（供组件调用） ==========
  window.NewTabApp = {
    saveConfig,
    renderComponents,
    reloadComponent,
    showToast,
    showConfirm,
    applyComponentStyle,
    getComponentStyle,
    getDefaultComponentStyle,
    getFaviconUrl,
    applyActionsVisibility,
    get backgroundComponent() { return backgroundComponent; },
    get COMPONENT_NAMES() { return COMPONENT_NAMES; },
    get showActions() { return config?.showActions !== false; }
  };

  // ========== 初始化入口 ==========
  document.addEventListener('DOMContentLoaded', async () => {
    // 检查主页导航是否启用
    const newtabEnabled = await checkNewtabEnabled();
    if (!newtabEnabled) {
      // 已关闭：显示极简提示页，不加载任何组件
      renderDisabledPage();
      return;
    }

    // 加载配置
    config = await loadConfig();
    // 初始化背景（优先渲染，用户最先看到）
    backgroundComponent = new BackgroundComponent(config);
    backgroundComponent.init();
    // 渲染组件（内部会应用各组件样式）
    renderComponents();
    // 延迟初始化设置面板：非首屏关键功能，在空闲时初始化
    // 减少首屏加载时间，提升页面打开速度
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => {
        settingsComponent = new SettingsComponent(config, window.NewTabApp);
        settingsComponent.init();
      }, { timeout: 2000 });
    } else {
      setTimeout(() => {
        settingsComponent = new SettingsComponent(config, window.NewTabApp);
        settingsComponent.init();
      }, 300);
    }
  });

  /**
   * 检查主页导航是否启用
   * 从chrome.storage读取newtab_enabled标志
   * @returns {Promise<boolean>} 是否启用
   */
  function checkNewtabEnabled() {
    return new Promise((resolve) => {
      chrome.storage.local.get('newtab_enabled', (result) => {
        // 默认启用（undefined时视为true）
        resolve(result.newtab_enabled !== false);
      });
    });
  }

  /**
   * 渲染已关闭状态的极简提示页
   * 只显示一个提示和重新开启按钮，不加载任何组件
   */
  function renderDisabledPage() {
    // 隐藏设置按钮
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) settingsBtn.style.display = 'none';

    const main = document.getElementById('main-content');
    main.innerHTML = '';

    // 居中容器
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;gap:20px;';

    // 提示图标
    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:64px;opacity:0.3;';
    icon.textContent = '🏠';

    // 提示文字
    const text = document.createElement('div');
    text.style.cssText = 'font-size:18px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.6;';
    text.textContent = '主页导航已关闭';

    // 重新开启按钮
    const enableBtn = document.createElement('button');
    enableBtn.textContent = '重新开启主页导航';
    enableBtn.style.cssText = 'padding:10px 24px;border:1px solid rgba(255,255,255,0.2);border-radius:12px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);font-size:14px;cursor:pointer;transition:all 0.2s ease;';
    enableBtn.addEventListener('mouseenter', () => {
      enableBtn.style.background = 'rgba(255,255,255,0.15)';
      enableBtn.style.color = 'rgba(255,255,255,0.9)';
    });
    enableBtn.addEventListener('mouseleave', () => {
      enableBtn.style.background = 'rgba(255,255,255,0.08)';
      enableBtn.style.color = 'rgba(255,255,255,0.7)';
    });
    enableBtn.addEventListener('click', async () => {
      // 重新开启主页导航
      await new Promise((resolve) => {
        chrome.storage.local.set({ newtab_enabled: true }, resolve);
      });
      // 刷新页面以加载完整主页
      window.location.reload();
    });

    // 提示：也可通过右键菜单开启
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.25);';
    hint.textContent = '也可通过右键菜单「我的书签同步 → 主页导航开关」开启';

    container.appendChild(icon);
    container.appendChild(text);
    container.appendChild(enableBtn);
    container.appendChild(hint);
    main.appendChild(container);
  }

  /**
   * 从chrome.storage加载配置
   * 合并默认配置，确保所有字段都有值
   * @returns {Promise<Object>} 合并后的配置
   */
  async function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get('newtab_config', (result) => {
        const saved = result.newtab_config || {};
        const merged = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), saved);
        // 确保每个组件都有style配置（兼容旧配置迁移）
        ensureComponentStyles(merged);
        resolve(merged);
      });
    });
  }

  /**
   * 确保配置完整性
   * 补全 enabled、order、style 中缺失的组件条目
   * 兼容从旧版全局glass配置迁移到按组件配置
   * @param {Object} cfg - 配置对象
   */
  function ensureComponentStyles(cfg) {
    if (!cfg.components) cfg.components = {};
    if (!cfg.components.style) cfg.components.style = {};
    if (!cfg.components.enabled) cfg.components.enabled = {};

    // 如果旧配置有全局glass设置，迁移到各组件
    const globalGlass = cfg.glass;

    // 使用统一的默认值函数获取各组件默认样式
    // 如果存在旧的全局glass配置，作为迁移基础覆盖默认值
    const migrationBase = {};
    if (globalGlass) {
      if (globalGlass.cardBgColor) migrationBase.cardBgColor = globalGlass.cardBgColor;
      if (globalGlass.opacity !== undefined) migrationBase.opacity = globalGlass.opacity;
      if (globalGlass.textColor) migrationBase.textColor = globalGlass.textColor;
    }

    // 为每个组件确保有完整的 enabled、style 配置
    Object.keys(COMPONENT_CLASSES).forEach(key => {
      // 补全enabled（缺失时默认启用）
      if (cfg.components.enabled[key] === undefined) {
        cfg.components.enabled[key] = true;
      }

      // 合并纯默认值和旧配置迁移值
      const compDefaults = { ...getDefaultComponentStyle(key), ...migrationBase };

      // 补全style
      if (!cfg.components.style[key]) {
        cfg.components.style[key] = { ...compDefaults };
      } else {
        const s = cfg.components.style[key];
        // 逐项补全缺失的样式属性
        Object.keys(compDefaults).forEach(prop => {
          if (s[prop] === undefined) s[prop] = compDefaults[prop];
        });
        // 清理已废弃的blur属性
        delete s.blur;
      }
    });

    // 确保order包含所有组件（缺失的追加到末尾）
    if (!cfg.components.order) {
      cfg.components.order = [...DEFAULT_CONFIG.components.order];
    } else {
      const existingKeys = new Set(cfg.components.order);
      Object.keys(COMPONENT_CLASSES).forEach(key => {
        if (!existingKeys.has(key)) {
          cfg.components.order.push(key);
        }
      });
    }
  }

  /**
   * 保存配置到chrome.storage
   */
  function saveConfig() {
    chrome.storage.local.set({ newtab_config: config });
  }

  /**
   * 深度合并两个对象
   * @param {Object} target - 目标对象
   * @param {Object} source - 源对象
   * @returns {Object} 合并后的对象
   */
  function deepMerge(target, source) {
    Object.keys(source).forEach(key => {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    });
    return target;
  }

  /**
   * 获取指定组件的纯默认外观配置（不读取用户已保存的配置）
   * 用于重置功能，确保恢复到初始默认值
   * @param {string} componentKey - 组件键名
   * @returns {Object} 纯默认外观配置
   */
  function getDefaultComponentStyle(componentKey) {
    const base = {
      cardBgColor: '#ffffff',
      opacity: 0,
      textColor: '#ffffff',
      fontSize: 14,
      fontWeight: 400,
      titleFontSize: 16,
      titleFontWeight: 600,
      borderRadius: 12,
      padding: 20
    };
    const componentDefaults = {
      clock: { fontSize: 14, clockFontSize: 72, clockFontWeight: 200 },
      search: { fontSize: 14, dropdownBgColor: '#1e2032', dropdownTextColor: '#ffffff' },
      links: { fontSize: 11, showAddCard: true },
      bookmarks: { fontSize: 14, showSearch: true }
    };
    return { ...base, ...(componentDefaults[componentKey] || {}) };
  }

  /**
   * 获取指定组件的外观配置
   * @param {string} componentKey - 组件键名
   * @returns {Object} 外观配置
   */
  function getComponentStyle(componentKey) {
    const style = config.components?.style?.[componentKey];
    const defaults = getDefaultComponentStyle(componentKey);
    return style ? { ...defaults, ...style } : defaults;
  }

  /**
   * 将样式应用到指定组件的DOM元素上
   * 通过CSS自定义属性（--comp-*）设置在组件wrapper上
   * 默认无卡片背景（opacity=0），用户设置透明度后才显示背景
   * @param {HTMLElement} wrapperEl - 组件wrapper元素
   * @param {string} componentKey - 组件键名
   */
  function applyComponentStyle(wrapperEl, componentKey) {
    const style = getComponentStyle(componentKey);
    const rgb = hexToRgb(style.cardBgColor);
    const textRgb = hexToRgb(style.textColor);
    const opacity = style.opacity ?? 0;
    const fontSize = style.fontSize ?? 14;
    const fontWeight = style.fontWeight ?? 400;
    const titleFontSize = style.titleFontSize ?? 16;
    const titleFontWeight = style.titleFontWeight ?? 600;
    const borderRadius = style.borderRadius ?? 12;
    const padding = style.padding ?? 20;

    // 只有透明度大于0时才设置背景效果
    if (opacity > 0) {
      // 根据透明度动态计算边框和输入框的透明度
      const borderOpacity = Math.min(opacity + 0.07, 0.35);
      const borderHoverOpacity = Math.min(opacity + 0.15, 0.5);

      // 计算卡片背景的亮度
      const bgBrightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
      const isLightBg = bgBrightness > 128 && opacity > 0.3;

      let innerBgR, innerBgG, innerBgB, innerBgOpacity;
      let innerBorderR, innerBorderG, innerBorderB, innerBorderOpacity;
      let innerTextR, innerTextG, innerTextB;

      if (isLightBg) {
        innerBgR = 0; innerBgG = 0; innerBgB = 0;
        innerBgOpacity = Math.max(0.05, 0.15 - opacity * 0.1);
        innerBorderR = 0; innerBorderG = 0; innerBorderB = 0;
        innerBorderOpacity = Math.max(0.08, 0.2 - opacity * 0.1);
        innerTextR = 30; innerTextG = 30; innerTextB = 30;
      } else {
        innerBgR = 255; innerBgG = 255; innerBgB = 255;
        innerBgOpacity = Math.min(opacity + 0.05, 0.2);
        innerBorderR = 255; innerBorderG = 255; innerBorderB = 255;
        innerBorderOpacity = Math.min(opacity + 0.12, 0.35);
        innerTextR = textRgb.r; innerTextG = textRgb.g; innerTextB = textRgb.b;
      }

      wrapperEl.style.setProperty('--comp-glass-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`);
      wrapperEl.style.setProperty('--comp-glass-bg-hover', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(opacity + 0.06, 1)})`);
      wrapperEl.style.setProperty('--comp-glass-border', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${borderOpacity})`);
      wrapperEl.style.setProperty('--comp-glass-border-hover', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${borderHoverOpacity})`);
      wrapperEl.style.setProperty('--comp-glass-blur-val', `blur(20px) saturate(180%)`);
      wrapperEl.style.setProperty('--comp-glass-blur', '20px');
      wrapperEl.style.setProperty('--comp-input-bg', `rgba(${innerBgR}, ${innerBgG}, ${innerBgB}, ${innerBgOpacity})`);
      wrapperEl.style.setProperty('--comp-input-border', `rgba(${innerBorderR}, ${innerBorderG}, ${innerBorderB}, ${innerBorderOpacity})`);
      wrapperEl.style.setProperty('--comp-inner-text', `rgba(${innerTextR}, ${innerTextG}, ${innerTextB}, 0.9)`);
    } else {
      wrapperEl.style.setProperty('--comp-glass-bg', 'transparent');
      wrapperEl.style.setProperty('--comp-glass-bg-hover', 'transparent');
      wrapperEl.style.setProperty('--comp-glass-border', 'transparent');
      wrapperEl.style.setProperty('--comp-glass-border-hover', 'transparent');
      wrapperEl.style.setProperty('--comp-glass-blur-val', 'none');
      wrapperEl.style.setProperty('--comp-glass-blur', '0px');
      wrapperEl.style.setProperty('--comp-input-bg', 'rgba(255, 255, 255, 0.1)');
      wrapperEl.style.setProperty('--comp-input-border', 'rgba(255, 255, 255, 0.2)');
      wrapperEl.style.setProperty('--comp-inner-text', `rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, 0.9)`);
    }

    // 文字颜色
    wrapperEl.style.setProperty('--comp-text-primary', `rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, 0.95)`);
    wrapperEl.style.setProperty('--comp-text-secondary', `rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, 0.65)`);
    wrapperEl.style.setProperty('--comp-text-muted', `rgba(${textRgb.r}, ${textRgb.g}, ${textRgb.b}, 0.4)`);

    // 字体大小和粗细
    wrapperEl.style.setProperty('--comp-font-size', `${fontSize}px`);
    wrapperEl.style.setProperty('--comp-font-weight', String(fontWeight));
    wrapperEl.style.setProperty('--comp-title-font-size', `${titleFontSize}px`);
    wrapperEl.style.setProperty('--comp-title-font-weight', String(titleFontWeight));

    // 圆角和内边距
    wrapperEl.style.setProperty('--comp-glass-radius', `${borderRadius}px`);
    wrapperEl.style.setProperty('--comp-padding', `${padding}px`);

    // 时钟组件特有参数
    if (componentKey === 'clock') {
      const clockFontSize = style.clockFontSize ?? 72;
      const clockFontWeight = style.clockFontWeight ?? 200;
      wrapperEl.style.setProperty('--comp-clock-font-size', `${clockFontSize}px`);
      wrapperEl.style.setProperty('--comp-clock-font-weight', String(clockFontWeight));
    }

    // 搜索组件特有参数：下拉框样式
    if (componentKey === 'search') {
      const dropdownBgColor = style.dropdownBgColor ?? '#1e2032';
      const dropdownTextColor = style.dropdownTextColor ?? '#ffffff';
      const ddRgb = hexToRgb(dropdownBgColor);
      const ddTextRgb = hexToRgb(dropdownTextColor);
      wrapperEl.style.setProperty('--comp-dropdown-bg', `rgba(${ddRgb.r}, ${ddRgb.g}, ${ddRgb.b}, 0.95)`);
      wrapperEl.style.setProperty('--comp-dropdown-text', `rgba(${ddTextRgb.r}, ${ddTextRgb.g}, ${ddTextRgb.b}, 0.95)`);
      wrapperEl.style.setProperty('--comp-dropdown-text-secondary', `rgba(${ddTextRgb.r}, ${ddTextRgb.g}, ${ddTextRgb.b}, 0.65)`);
    }

    // 标记已应用自定义样式
    wrapperEl.classList.add('custom-styled');
  }

  /**
   * 将十六进制颜色转为RGB对象
   * @param {string} hex - 十六进制颜色值
   * @returns {Object} RGB对象 {r, g, b}
   */
  function hexToRgb(hex) {
    const cleanHex = hex.replace('#', '');
    const fullHex = cleanHex.length === 3
      ? cleanHex.split('').map(c => c + c).join('')
      : cleanHex;
    const num = parseInt(fullHex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  /**
   * 渲染所有启用的组件
   * 使用DocumentFragment批量插入DOM，减少重排次数提升性能
   */
  function renderComponents() {
    const grid = document.getElementById('components-grid');

    // 销毁旧组件实例，防止内存泄漏
    Object.values(components).forEach(comp => {
      if (comp && typeof comp.destroy === 'function') comp.destroy();
    });
    components = {};

    const order = config.components?.order || DEFAULT_CONFIG.components.order;
    const enabled = config.components?.enabled || DEFAULT_CONFIG.components.enabled;

    // 使用DocumentFragment批量构建DOM，避免多次重排
    const fragment = document.createDocumentFragment();
    // 临时存储wrapper引用，用于后续应用样式
    const wrapperRefs = [];

    order.forEach(key => {
      if (!enabled[key]) return;

      const CompClass = COMPONENT_CLASSES[key];
      if (!CompClass) return;

      const instance = new CompClass(config);
      // 渲染到fragment而非直接到grid，减少DOM重排
      instance.render(fragment);
      components[key] = instance;

      // 获取刚渲染的wrapper引用
      const wrapper = fragment.querySelector(`[data-component="${key}"]`);
      if (wrapper) {
        wrapperRefs.push({ wrapper, key });
      }
    });

    // 一次性清空并插入所有组件，只触发一次重排
    grid.innerHTML = '';
    grid.appendChild(fragment);

    // 批量应用各组件的独立外观样式
    wrapperRefs.forEach(({ wrapper, key }) => {
      applyComponentStyle(wrapper, key);
    });

    // 根据配置决定是否显示组件操作按钮
    applyActionsVisibility();
  }

  /**
   * 根据配置控制所有组件操作按钮的可见性
   * showActions为false时，给body添加hide-actions类，CSS中隐藏所有操作按钮
   */
  function applyActionsVisibility() {
    // showActions默认为true（undefined时视为true）
    const show = config?.showActions !== false;
    if (show) {
      // 显示操作按钮：移除隐藏类
      document.body.classList.remove('hide-actions');
    } else {
      // 隐藏操作按钮：添加隐藏类
      document.body.classList.add('hide-actions');
    }
  }

  /**
   * 重新渲染指定组件（保留其他组件不动）
   * 用于功能性配置变更后需要重新构建DOM的场景
   * @param {string} componentKey - 组件键名（如 'links'）
   */
  function reloadComponent(componentKey) {
    const grid = document.getElementById('components-grid');
    const CompClass = COMPONENT_CLASSES[componentKey];
    if (!CompClass || !grid) return;

    // 销毁旧实例
    if (components[componentKey] && typeof components[componentKey].destroy === 'function') {
      components[componentKey].destroy();
    }

    // 移除旧DOM
    const oldWrapper = grid.querySelector(`[data-component="${componentKey}"]`);
    if (oldWrapper) {
      oldWrapper.remove();
    }

    // 创建新实例
    const instance = new CompClass(config);
    const fragment = document.createDocumentFragment();
    instance.render(fragment);

    // 找到正确的插入位置（按组件排序顺序）
    const order = config.components?.order || DEFAULT_CONFIG.components.order;
    const enabled = config.components?.enabled || DEFAULT_CONFIG.components.enabled;
    let insertBefore = null;
    let foundSelf = false;

    for (const key of order) {
      if (key === componentKey) {
        foundSelf = true;
        continue;
      }
      // 找到当前组件之后、第一个已启用且存在的组件
      if (foundSelf && enabled[key]) {
        insertBefore = grid.querySelector(`[data-component="${key}"]`);
        break;
      }
    }

    // 插入到正确位置
    if (insertBefore) {
      grid.insertBefore(fragment, insertBefore);
    } else {
      grid.appendChild(fragment);
    }

    // 保存新实例并应用样式
    components[componentKey] = instance;
    const newWrapper = grid.querySelector(`[data-component="${componentKey}"]`);
    if (newWrapper) {
      applyComponentStyle(newWrapper, componentKey);
    }

    // 应用操作按钮可见性
    applyActionsVisibility();
  }

  /**
   * 获取网站favicon图标的URL
   * 使用Chrome MV3内置的_favicon API，无需外部网络请求，加载速度快
   * 带缓存机制，同一URL只生成一次
   * @param {string} pageUrl - 网页完整URL
   * @param {number} size - 图标尺寸（16/32/64），默认32
   * @returns {string|null} favicon的URL，失败返回null
   */
  function getFaviconUrl(pageUrl, size = 32) {
    // 参数校验
    if (!pageUrl) return null;

    // 构建缓存键
    const cacheKey = `${pageUrl}_${size}`;

    // 命中缓存则直接返回
    if (faviconCache.has(cacheKey)) {
      return faviconCache.get(cacheKey);
    }

    try {
      // 使用Chrome MV3内置的_favicon API
      // 格式：chrome-extension://<id>/_favicon/?pageUrl=<url>&size=<size>
      // 此API从浏览器本地缓存获取favicon，无需网络请求
      const url = new URL(chrome.runtime.getURL('/_favicon/'));
      url.searchParams.set('pageUrl', pageUrl);
      url.searchParams.set('size', String(size));
      const faviconUrl = url.toString();

      // 写入缓存
      faviconCache.set(cacheKey, faviconUrl);

      return faviconUrl;
    } catch (error) {
      // API不可用时返回null，调用方应使用首字母后备方案
      console.warn('获取favicon URL失败:', error);
      return null;
    }
  }

  /**
   * 显示提示消息
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型 success/error
   */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  /**
   * 显示自定义确认弹窗（替代原生confirm）
   * 返回Promise，用户点击确认resolve(true)，取消resolve(false)
   * @param {string} message - 确认提示信息
   * @param {Object} options - 可选配置
   * @param {string} [options.title='确认操作'] - 弹窗标题
   * @param {string} [options.confirmText='确认'] - 确认按钮文字
   * @param {string} [options.cancelText='取消'] - 取消按钮文字
   * @param {string} [options.type='warning'] - 弹窗类型 warning/danger/info
   * @returns {Promise<boolean>} 用户是否确认
   */
  function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
      // 合并默认配置
      const {
        title = '确认操作', // 默认标题
        confirmText = '确认', // 默认确认按钮文字
        cancelText = '取消', // 默认取消按钮文字
        type = 'warning' // 默认类型为警告
      } = options;

      // 创建遮罩层
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';

      // 创建弹窗容器
      const dialog = document.createElement('div');
      dialog.className = `confirm-dialog confirm-type-${type}`;

      // 类型图标映射
      const iconMap = {
        warning: '⚠️', // 警告图标
        danger: '🗑️', // 危险/删除图标
        info: 'ℹ️' // 信息图标
      };

      // 构建弹窗内容
      dialog.innerHTML = `
        <div class="confirm-icon">${iconMap[type] || iconMap.warning}</div>
        <div class="confirm-title">${title}</div>
        <div class="confirm-message">${message}</div>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn-cancel">${cancelText}</button>
          <button class="confirm-btn confirm-btn-ok">${confirmText}</button>
        </div>
      `;

      // 将弹窗添加到遮罩层
      overlay.appendChild(dialog);
      // 添加到页面
      document.body.appendChild(overlay);

      // 触发入场动画（下一帧添加active类）
      requestAnimationFrame(() => {
        overlay.classList.add('active');
      });

      /**
       * 关闭弹窗并返回结果
       * @param {boolean} result - 用户选择结果
       */
      function closeDialog(result) {
        // 移除active类触发退场动画
        overlay.classList.remove('active');
        // 等待动画完成后移除DOM
        setTimeout(() => {
          overlay.remove();
          resolve(result); // 返回用户选择
        }, 300);
      }

      // 取消按钮点击事件
      dialog.querySelector('.confirm-btn-cancel').addEventListener('click', () => {
        closeDialog(false); // 用户取消
      });

      // 确认按钮点击事件
      dialog.querySelector('.confirm-btn-ok').addEventListener('click', () => {
        closeDialog(true); // 用户确认
      });

      // 点击遮罩层关闭（等同于取消）
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeDialog(false); // 点击遮罩等同于取消
        }
      });

      // ESC键关闭弹窗
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          closeDialog(false); // ESC等同于取消
          document.removeEventListener('keydown', escHandler); // 移除监听
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  }
})();
