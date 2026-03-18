/**
 * 列表导航器
 * 用于在编辑界面中导航列表项（上一个/下一个）
 */
export class ListNavigator {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Array} options.items - 项目列表
   * @param {number} options.currentIndex - 当前索引
   * @param {Function} options.onSave - 保存回调
   * @param {Function} options.onNavigate - 导航回调
   * @param {Object} options.navButtons - 导航按钮
   * @param {HTMLElement} options.navButtons.first - 第一个按钮
   * @param {HTMLElement} options.navButtons.prev - 上一个按钮
   * @param {HTMLElement} options.navButtons.next - 下一个按钮
   * @param {HTMLElement} options.navButtons.last - 最后一个按钮
   */
  constructor(options) {
    this.items = options.items || [];
    this.currentIndex = options.currentIndex || 0;
    this.onSave = options.onSave;
    this.onNavigate = options.onNavigate;
    this.navButtons = options.navButtons;
    
    // 保存事件处理函数的引用，以便后续移除
    this.eventHandlers = {};

    // 绑定导航按钮事件
    this.bindNavButtons();
    
    // 更新按钮状态
    this.updateNavButtons();
  }

  /**
   * 绑定导航按钮事件
   */
  bindNavButtons() {
    if (!this.navButtons) return;

    const { first, prev, next, last } = this.navButtons;

    // 创建事件处理函数并保存引用
    this.eventHandlers.first = () => this.navigateTo('first');
    this.eventHandlers.prev = () => this.navigateTo('prev');
    this.eventHandlers.next = () => this.navigateTo('next');
    this.eventHandlers.last = () => this.navigateTo('last');
    this.eventHandlers.keydown = (e) => this.handleKeydown(e);

    if (first) {
      first.addEventListener('click', this.eventHandlers.first);
    }
    if (prev) {
      prev.addEventListener('click', this.eventHandlers.prev);
    }
    if (next) {
      next.addEventListener('click', this.eventHandlers.next);
    }
    if (last) {
      last.addEventListener('click', this.eventHandlers.last);
    }

    // 键盘快捷键
    document.addEventListener('keydown', this.eventHandlers.keydown);
  }
  
  /**
   * 处理键盘事件
   * @param {KeyboardEvent} e - 键盘事件
   */
  handleKeydown(e) {
    // 只在模态框打开时响应
    const modal = document.querySelector('.modal.active');
    if (!modal) return;

    // Ctrl/Cmd + 方向键
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigateTo('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigateTo('next');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.navigateTo('first');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.navigateTo('last');
      }
    }
  }

  /**
   * 销毁导航器，移除所有事件监听器
   */
  destroy() {
    if (!this.navButtons) return;

    const { first, prev, next, last } = this.navButtons;

    if (first && this.eventHandlers.first) {
      first.removeEventListener('click', this.eventHandlers.first);
    }
    if (prev && this.eventHandlers.prev) {
      prev.removeEventListener('click', this.eventHandlers.prev);
    }
    if (next && this.eventHandlers.next) {
      next.removeEventListener('click', this.eventHandlers.next);
    }
    if (last && this.eventHandlers.last) {
      last.removeEventListener('click', this.eventHandlers.last);
    }

    if (this.eventHandlers.keydown) {
      document.removeEventListener('keydown', this.eventHandlers.keydown);
    }
    
    // 清空引用
    this.eventHandlers = {};
  }

  /**
   * 导航到指定位置
   * @param {string} direction - 方向 (first, prev, next, last)
   */
  async navigateTo(direction) {
    // 先保存当前数据
    if (this.onSave) {
      await this.onSave();
    }

    let newIndex = this.currentIndex;

    switch (direction) {
      case 'first':
        newIndex = 0;
        break;
      case 'prev':
        newIndex = Math.max(0, this.currentIndex - 1);
        break;
      case 'next':
        newIndex = Math.min(this.items.length - 1, this.currentIndex + 1);
        break;
      case 'last':
        newIndex = this.items.length - 1;
        break;
    }

    // 如果索引没有变化，不执行导航
    if (newIndex === this.currentIndex) {
      return;
    }

    // 更新索引
    this.currentIndex = newIndex;

    // 执行导航回调
    if (this.onNavigate) {
      const targetItem = this.items[this.currentIndex];
      await this.onNavigate(targetItem, this.currentIndex);
    }

    // 更新按钮状态
    this.updateNavButtons();
  }

  /**
   * 更新导航按钮状态
   */
  updateNavButtons() {
    if (!this.navButtons) return;

    const { first, prev, next, last } = this.navButtons;
    const isFirst = this.currentIndex === 0;
    const isLast = this.currentIndex === this.items.length - 1;
    const isEmpty = this.items.length === 0;

    // 更新按钮禁用状态
    if (first) {
      first.disabled = isFirst || isEmpty;
    }
    if (prev) {
      prev.disabled = isFirst || isEmpty;
    }
    if (next) {
      next.disabled = isLast || isEmpty;
    }
    if (last) {
      last.disabled = isLast || isEmpty;
    }
  }
}

export default ListNavigator;
