/**
 * 背景组件
 * 管理自定义背景图片/视频
 */
class BackgroundComponent {
  /**
   * 构造函数
   * @param {Object} config - 组件配置
   */
  constructor(config) {
    this.config = config;
    this.bgLayer = null;
    this.videoEl = null;
  }

  /**
   * 初始化背景（不渲染到组件网格，而是操作全局背景层）
   */
  init() {
    // 获取背景层DOM
    this.bgLayer = document.getElementById('background-layer');
    // 应用配置中的背景
    this._applyBackground();
  }

  /**
   * 应用背景配置
   * 优先使用配置中指定的类型，否则自动判断
   * @private
   */
  _applyBackground() {
    const bg = this.config.background;
    // 无配置则使用默认渐变
    if (!bg || !bg.url) return;

    // 清除之前的视频元素
    if (this.videoEl) {
      this.videoEl.remove();
      this.videoEl = null;
    }

    // 判断背景类型：优先使用配置中手动指定的类型，否则自动判断
    // 因为很多URL没有文件名后缀，自动判断不准确
    const isVideo = bg.type === 'video' || (!bg.type && this._isVideoUrl(bg.url));

    if (isVideo) {
      // 创建视频背景
      this._applyVideoBackground(bg.url);
    } else {
      // 创建图片背景
      this._applyImageBackground(bg.url);
    }
  }

  /**
   * 判断URL是否为视频
   * @param {string} url - 资源URL
   * @returns {boolean} 是否为视频
   * @private
   */
  _isVideoUrl(url) {
    // 通过文件扩展名判断
    const lower = url.toLowerCase();
    return lower.endsWith('.mp4') ||
           lower.endsWith('.webm') ||
           lower.endsWith('.ogg') ||
           lower.includes('.mp4?') ||
           lower.includes('.webm?');
  }

  /**
   * 应用视频背景
   * @param {string} url - 视频URL
   * @private
   */
  _applyVideoBackground(url) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true; // 静音播放（浏览器要求自动播放必须静音）
    video.loop = true; // 循环播放
    video.playsInline = true; // 移动端内联播放
    video.src = url;

    // 视频加载失败时回退到默认背景（使用addEventListener避免CSP问题）
    video.addEventListener('error', () => {
      video.remove();
      this._showToast('背景视频加载失败', 'error');
    });

    this.bgLayer.appendChild(video);
    this.videoEl = video;
  }

  /**
   * 应用图片背景
   * @param {string} url - 图片URL
   * @private
   */
  _applyImageBackground(url) {
    // 使用CSS background-image设置背景
    this.bgLayer.style.backgroundImage = `url("${url}")`;
    this.bgLayer.style.backgroundSize = 'cover';
    this.bgLayer.style.backgroundPosition = 'center';

    // 预加载图片检测是否有效（使用addEventListener避免CSP问题）
    const img = new Image();
    img.addEventListener('error', () => {
      // 图片加载失败，恢复默认背景
      this.bgLayer.style.backgroundImage = '';
      this._showToast('背景图片加载失败', 'error');
    });
    img.src = url;
  }

  /**
   * 显示提示消息
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型 success/error
   * @private
   */
  _showToast(message, type = 'success') {
    // 复用全局toast函数（如果存在）
    if (window.NewTabApp && window.NewTabApp.showToast) {
      window.NewTabApp.showToast(message, type);
    }
  }

  /**
   * 更新背景配置
   * @param {string} url - 新的背景URL
   * @param {string} type - 背景类型 image/video
   */
  updateBackground(url, type) {
    if (!this.config.background) this.config.background = {};
    this.config.background.url = url;
    this.config.background.type = type || (this._isVideoUrl(url) ? 'video' : 'image');
    this._applyBackground();
    // 保存配置
    if (window.NewTabApp) {
      window.NewTabApp.saveConfig();
    }
  }

  /**
   * 销毁组件
   */
  destroy() {
    if (this.videoEl) {
      this.videoEl.remove();
      this.videoEl = null;
    }
  }
}
