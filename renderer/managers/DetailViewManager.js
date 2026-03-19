import { Constants } from '../constants.js';
import { ListNavigator } from '../utils/index.js';

/**
 * 详情视图管理器基类
 * 提供详情模态框的通用功能
 */
export class DetailViewManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   * @param {string} options.modalId - 模态框元素ID
   * @param {string} options.closeBtnId - 关闭按钮元素ID
   */
  constructor(options) {
    this.app = options.app;
    this.modalId = options.modalId;
    this.closeBtnId = options.closeBtnId;

    // 状态
    this.currentItem = null;
    this.itemsSnapshot = [];
    this.currentIndex = -1;

    // 导航器
    this.navigator = null;

    // 保存管理
    this.saveManager = null;
    this.changeTracker = null;

    // 绑定关闭事件
    this.bindCloseEvent();
  }

  /**
   * 绑定关闭事件
   */
  bindCloseEvent() {
    const closeBtn = document.getElementById(this.closeBtnId);
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }

  /**
   * 打开详情模态框
   * @param {Object} item - 数据项
   * @param {Object} options - 选项
   * @abstract
   */
  async open(item, options = {}) {
    throw new Error('open() method must be implemented by subclass');
  }

  /**
   * 关闭详情模态框
   */
  async close() {
    // 保存所有变更
    if (this.saveManager && this.changeTracker?.hasChanges()) {
      await this.saveManager.saveAll();
    }

    const modal = document.getElementById(this.modalId);
    if (modal) {
      modal.classList.remove('active');
    }

    // 清理
    this.cleanup();
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.saveManager) {
      this.saveManager.destroy();
      this.saveManager = null;
    }
    if (this.changeTracker) {
      this.changeTracker.destroy();
      this.changeTracker = null;
    }
    if (this.navigator) {
      this.navigator.destroy();
      this.navigator = null;
    }
    this.currentItem = null;
  }

  /**
   * 初始化导航器
   * @param {Object} item - 当前项
   * @param {Array} items - 所有项列表
   * @param {Object} navButtons - 导航按钮配置
   * @param {Function} onNavigate - 导航回调
   * @protected
   */
  initNavigator(item, items, navButtons, onNavigate) {
    // 记录快照
    this.itemsSnapshot = [...items];
    this.currentIndex = this.itemsSnapshot.findIndex(i =>
      this.app.constructor.isSameId ? this.app.constructor.isSameId(i.id, item.id) : String(i.id) === String(item.id)
    );

    // 填充导航按钮 SVGs
    this.fillNavButtonSVGs();

    // 初始化导航器
    if (ListNavigator) {
      this.navigator = new ListNavigator({
        items: this.itemsSnapshot,
        currentIndex: this.currentIndex,
        onSave: () => this.saveWithoutClosing(),
        onNavigate: async (targetItem, currentIndex) => {
          this.currentIndex = currentIndex;
          await onNavigate(targetItem);
        },
        navButtons
      });
    }
  }

  /**
   * 填充导航按钮 SVGs
   * @protected
   */
  fillNavButtonSVGs() {
    const prefix = this.getNavButtonPrefix();
    ['first', 'prev', 'next', 'last'].forEach(type => {
      const btn = document.getElementById(`${prefix}${type.charAt(0).toUpperCase() + type.slice(1)}NavBtn`);
      if (btn) {
        btn.innerHTML = Constants.ICONS.nav[type];
      }
    });
  }

  /**
   * 获取导航按钮前缀
   * @returns {string} 前缀
   * @abstract
   * @protected
   */
  getNavButtonPrefix() {
    throw new Error('getNavButtonPrefix() method must be implemented by subclass');
  }

  /**
   * 保存但不关闭
   * @protected
   */
  async saveWithoutClosing() {
    if (this.saveManager) {
      await this.saveManager.saveAll();
    }
  }

  /**
   * 更新视图
   * @param {Object} item - 数据项
   * @abstract
   * @protected
   */
  async updateView(item) {
    throw new Error('updateView() method must be implemented by subclass');
  }

  /**
   * 显示模态框
   * @protected
   */
  showModal() {
    const modal = document.getElementById(this.modalId);
    if (modal) {
      modal.style.display = '';
      modal.classList.add('active');
    }
  }

  /**
   * 自动调整文本框高度
   * @param {HTMLTextAreaElement} textarea - 文本框元素
   * @protected
   */
  autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }
}
