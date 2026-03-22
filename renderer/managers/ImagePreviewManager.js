/**
 * 图像预览管理器
 * 负责所有图像预览的渲染和交互管理
 * 遵循单一职责原则：只处理 UI 渲染，不涉及上传逻辑
 */
export class ImagePreviewManager {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.containerId - 预览容器 ID
   * @param {Function} options.onRemove - 删除图像回调 (index) => void
   */
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.onRemove = options.onRemove || (() => {});
    this.filePaths = [];
    this.savedImages = [];
    this.clickHandler = null;
  }

  /**
   * 获取容器元素
   * @returns {HTMLElement|null}
   */
  getContainer() {
    return document.getElementById(this.containerId);
  }

  /**
   * 渲染预览列表（用于上传前预览）
   * @param {string[]} filePaths - 文件路径数组
   */
  render(filePaths) {
    this.filePaths = filePaths || [];
    const container = this.getContainer();
    if (!container) return;

    if (this.filePaths.length === 0) {
      container.innerHTML = '';
      return;
    }

    const previews = this.filePaths.map((filePath, index) => {
      const fileName = this.extractFileName(filePath);
      const fileUrl = this.toFileUrl(filePath);
      return this.createPreviewHTML(fileUrl, fileName, index, false);
    });

    container.innerHTML = previews.join('');
  }

  /**
   * 渲染已保存的图像列表（用于预填充）
   * @param {Object[]} images - 图像对象数组（包含 id, fileName, relativePath）
   */
  async renderSavedImages(images) {
    this.savedImages = images || [];
    const container = this.getContainer();
    if (!container) return;

    if (this.savedImages.length === 0) {
      container.innerHTML = '';
      return;
    }

    // 异步获取所有图像的完整路径
    const previews = await Promise.all(
      this.savedImages.map(async (image, index) => {
        const fileName = image.fileName || 'unknown';
        let fileUrl = '';
        if (image.relativePath) {
          try {
            const fullPath = await window.electronAPI.getImagePath(image.relativePath);
            fileUrl = `file:///${fullPath.replace(/\\/g, '/').replace(/"/g, '%22')}`;
          } catch (error) {
            console.error('Failed to get image path:', error);
          }
        }
        return this.createPreviewHTML(fileUrl, fileName, index, true);
      })
    );

    container.innerHTML = previews.join('');
  }

  /**
   * 创建预览项 HTML
   * @param {string} fileUrl - 文件 URL
   * @param {string} fileName - 文件名
   * @param {number} index - 索引
   * @param {boolean} isSaved - 是否是已保存图像
   * @returns {string} HTML 字符串
   */
  createPreviewHTML(fileUrl, fileName, index, isSaved = false) {
    const dataAttr = isSaved ? 'data-saved="true"' : '';
    return `
      <div class="image-preview-item" data-index="${index}" ${dataAttr}>
        <img src="${fileUrl}" alt="${fileName}">
        <div class="image-preview-overlay">
          <button type="button" class="btn-icon remove-image" data-index="${index}" title="删除">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 绑定事件（事件委托）
   * 只需在容器上绑定一次，利用事件冒泡处理所有按钮点击
   */
  bindEvents() {
    const container = this.getContainer();
    if (!container || this.clickHandler) return;

    this.clickHandler = (e) => {
      const btn = e.target.closest('.btn-icon');
      if (!btn) return;

      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);

      if (btn.classList.contains('remove-image')) {
        this.onRemove(index);
      }
    };

    container.addEventListener('click', this.clickHandler);
  }

  /**
   * 解绑事件
   */
  unbindEvents() {
    const container = this.getContainer();
    if (container && this.clickHandler) {
      container.removeEventListener('click', this.clickHandler);
      this.clickHandler = null;
    }
  }

  /**
   * 清除所有预览
   */
  clear() {
    const container = this.getContainer();
    if (!container) return;

    // 释放图片资源
    container.querySelectorAll('img').forEach(img => {
      img.src = '';
    });
    container.innerHTML = '';
    this.filePaths = [];
    this.savedImages = [];
  }

  /**
   * 获取当前文件路径列表
   * @returns {string[]}
   */
  getFilePaths() {
    return [...this.filePaths];
  }

  /**
   * 获取已保存图像列表
   * @returns {Object[]}
   */
  getSavedImages() {
    return [...this.savedImages];
  }

  /**
   * 从文件路径提取文件名
   * @param {string} filePath - 文件路径
   * @returns {string}
   */
  extractFileName(filePath) {
    return filePath.split(/[\\/]/).pop() || '';
  }

  /**
   * 转换为 file:// URL
   * @param {string} filePath - 文件路径
   * @returns {string}
   */
  toFileUrl(filePath) {
    return 'file:///' + filePath.replace(/\\/g, '/');
  }
}
