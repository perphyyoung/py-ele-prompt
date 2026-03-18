import { Constants } from '../constants.js';

/**
 * 可编辑标签列表组件
 * 用于编辑界面，支持删除按钮
 */
export class EditableTagList {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.containerId - 容器元素 ID
   * @param {TagManager} options.tagManager - 标签管理器实例
   * @param {Function} options.onRemove - 删除标签的回调函数 (tagName) => Promise<void>
   * @param {Array<string>} options.filterTags - 需要过滤掉的标签列表
   */
  constructor(options) {
    this.containerId = options.containerId;
    this.tagManager = options.tagManager;
    this.onRemove = options.onRemove;
    this.filterTags = options.filterTags || [];
    this._initialized = false;
  }

  /**
   * 初始化事件委托（只调用一次）
   */
  init() {
    if (this._initialized) return;

    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.addEventListener('click', async (e) => {
      const removeBtn = e.target.closest('.tag-remove-btn');
      if (!removeBtn) return;

      e.stopPropagation();
      const tagElement = removeBtn.closest('.tag-removable');
      if (tagElement && this.onRemove) {
        await this.onRemove(tagElement.dataset.tag);
      }
    });

    this._initialized = true;
  }

  /**
   * 渲染标签列表
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const tags = this.tagManager.getTags().filter(tag =>
      !this.filterTags.includes(tag) && !Constants.ALL_SPECIAL_TAGS.includes(tag)
    );

    if (tags.length > 0) {
      container.innerHTML = tags.map(tag => {
        const escapedTag = this.escapeHtml(tag);
        return `<span class="tag-editable tag-removable" data-tag="${escapedTag}">
          ${escapedTag}
          <span class="tag-remove-btn" title="删除标签">×</span>
        </span>`;
      }).join('');
    } else {
      container.innerHTML = '<span class="no-tags">无标签</span>';
    }
  }

  /**
   * 初始化并渲染（首次调用时自动初始化）
   */
  renderWithInit() {
    this.init();
    this.render();
  }

  /**
   * HTML 转义
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
