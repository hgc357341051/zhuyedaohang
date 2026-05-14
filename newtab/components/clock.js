/**
 * 时钟组件
 * 显示当前时间、日期和问候语
 */
class ClockComponent {
  /**
   * 构造函数
   * @param {Object} config - 组件配置
   */
  constructor(config) {
    // 保存配置引用
    this.config = config;
    // 定时器ID，用于销毁时清除
    this.timerId = null;
    // 组件根DOM元素
    this.el = null;
  }

  /**
   * 渲染组件到指定容器
   * @param {HTMLElement} container - 父容器
   */
  render(container) {
    // 创建组件包装器
    const wrapper = document.createElement('div');
    wrapper.className = 'component-wrapper';
    wrapper.dataset.component = 'clock';

    // 创建玻璃卡片
    const card = document.createElement('div');
    card.className = 'glass-card clock-component';

    // 时间显示
    const timeEl = document.createElement('div');
    timeEl.className = 'clock-time';
    timeEl.id = 'clock-time';

    // 日期显示
    const dateEl = document.createElement('div');
    dateEl.className = 'clock-date';
    dateEl.id = 'clock-date';

    // 问候语
    const greetEl = document.createElement('div');
    greetEl.className = 'clock-greeting';
    greetEl.id = 'clock-greeting';

    // 组装DOM
    card.appendChild(timeEl);
    card.appendChild(dateEl);
    card.appendChild(greetEl);
    wrapper.appendChild(card);
    container.appendChild(wrapper);

    // 保存引用
    this.el = wrapper;
    this.timeEl = timeEl;
    this.dateEl = dateEl;
    this.greetEl = greetEl;

    // 立即更新一次时间
    this._updateTime();
    // 每秒更新时间
    this.timerId = setInterval(() => this._updateTime(), 1000);
  }

  /**
   * 更新时间显示
   * @private
   */
  _updateTime() {
    const now = new Date();
    // 格式化时间：HH:MM:SS
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    this.timeEl.textContent = `${hours}:${minutes}:${seconds}`;

    // 格式化日期：YYYY年MM月DD日 星期X
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekDay = weekDays[now.getDay()];
    this.dateEl.textContent = `${year}年${month}月${day}日 星期${weekDay}`;

    // 根据时段生成问候语
    const hour = now.getHours();
    let greeting = '';
    if (hour < 6) greeting = '夜深了，注意休息 🌙';
    else if (hour < 9) greeting = '早上好 ☀️';
    else if (hour < 12) greeting = '上午好 🌤️';
    else if (hour < 14) greeting = '中午好 🌞';
    else if (hour < 18) greeting = '下午好 🌅';
    else if (hour < 22) greeting = '晚上好 🌆';
    else greeting = '夜深了，注意休息 🌙';
    this.greetEl.textContent = greeting;
  }

  /**
   * 销毁组件，清除定时器
   */
  destroy() {
    // 清除定时器防止内存泄漏
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    // 移除DOM元素
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
