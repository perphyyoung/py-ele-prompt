/**
 * Toast提示管理器
 * 负责管理提示消息的显示和隐藏
 */
export class ToastManager {
  /**
   * @param {Object} options - 配置选项
   * @param {number} options.duration - 显示时长(毫秒), 默认3000
   * @param {string} options.containerId - Toast容器ID, 默认'toast'
   * @param {string} options.messageId - 消息元素ID, 默认'toastMessage'
   */
  constructor(options = {}) {
    this.duration = options.duration || 3000;
    this.containerId = options.containerId || 'toast';
    this.messageId = options.messageId || 'toastMessage';

    // 当前显示的定时器
    this.hideTimer = null;

    // 消息队列
    this.messageQueue = [];

    // 是否正在显示
    this.isShowing = false;
  }

  /**
   * 初始化
   */
  init() {
    // 确保DOM元素存在
    this.ensureElements();
  }

  /**
   * 确保必要的DOM元素存在
   * @private
   */
  ensureElements() {
    let container = document.getElementById(this.containerId);

    if (!container) {
      container = document.createElement('div');
      container.id = this.containerId;
      container.className = 'toast';

      const message = document.createElement('span');
      message.id = this.messageId;
      message.className = 'toast-message';

      container.appendChild(message);
      document.body.appendChild(container);
    }
  }

  /**
   * 显示提示消息
   * @param {string} message - 消息内容
   * @param {string} type - 类型 (success, error, info, warning)
   * @param {number} duration - 显示时长(毫秒), 默认使用构造函数设置的时长
   */
  show(message, type = 'info', duration = null) {
    const toast = document.getElementById(this.containerId);
    const toastMessage = document.getElementById(this.messageId);

    if (!toast || !toastMessage) {
      console.warn('Toast elements not found');
      return;
    }

    // 清除之前的定时器
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }

    // 设置样式和消息
    toast.className = `toast toast-${type}`;
    toastMessage.textContent = message;
    toast.classList.add('show');

    this.isShowing = true;

    // 设置自动隐藏
    const hideDuration = duration || this.duration;
    this.hideTimer = setTimeout(() => {
      this.hide();
    }, hideDuration);
  }

  /**
   * 隐藏提示消息
   */
  hide() {
    const toast = document.getElementById(this.containerId);
    if (toast) {
      toast.classList.remove('show');
    }
    this.isShowing = false;

    // 处理队列中的下一条消息
    if (this.messageQueue.length > 0) {
      const next = this.messageQueue.shift();
      setTimeout(() => {
        this.show(next.message, next.type, next.duration);
      }, 300);
    }
  }

  /**
   * 显示成功消息
   * @param {string} message - 消息内容
   * @param {number} duration - 显示时长
   */
  success(message, duration = null) {
    this.show(message, 'success', duration);
  }

  /**
   * 显示错误消息
   * @param {string} message - 消息内容
   * @param {number} duration - 显示时长
   */
  error(message, duration = null) {
    this.show(message, 'error', duration);
  }

  /**
   * 显示信息消息
   * @param {string} message - 消息内容
   * @param {number} duration - 显示时长
   */
  info(message, duration = null) {
    this.show(message, 'info', duration);
  }

  /**
   * 显示警告消息
   * @param {string} message - 消息内容
   * @param {number} duration - 显示时长
   */
  warning(message, duration = null) {
    this.show(message, 'warning', duration);
  }

  /**
   * 将消息添加到队列
   * @param {string} message - 消息内容
   * @param {string} type - 类型
   * @param {number} duration - 显示时长
   */
  queue(message, type = 'info', duration = null) {
    if (this.isShowing) {
      this.messageQueue.push({ message, type, duration });
    } else {
      this.show(message, type, duration);
    }
  }

  /**
   * 清除所有队列中的消息
   */
  clearQueue() {
    this.messageQueue = [];
  }

  /**
   * 立即隐藏并清除队列
   */
  clear() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.clearQueue();
    this.hide();
  }
}
