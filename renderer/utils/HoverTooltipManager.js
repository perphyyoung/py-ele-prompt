import { isSameId } from '../utils/isSameId.js';
import { cacheManager } from './CacheManager.js';

/**
 * Hover Tooltip 管理器
 * 通用 hover 预览组件，支持渐进式图像加载
 */
export class HoverTooltipManager {
  /**
   * @param {string} tooltipId - tooltip 元素 ID
   * @param {string} contentId - 内容元素 ID
   * @param {string} imageId - 图像元素 ID
   */
  constructor(tooltipId, contentId, imageId) {
    this.tooltip = document.getElementById(tooltipId);
    this.contentEl = document.getElementById(contentId);
    this.imageEl = document.getElementById(imageId);
    this.hoverTimer = null;
    this.currentElement = null;

    if (!this.tooltip || !this.contentEl || !this.imageEl) {
      console.error('HoverTooltipManager: Required elements not found');
    }
  }

  /**
   * 加载图像路径（带缓存）
   * 使用全局 CacheManager 替代局部 Map
   * @param {string} imageId - 图像 ID
   * @returns {Promise<{thumbnailPath: string|null, originalPath: string|null}>}
   */
  async loadImagePaths(imageId) {
    // 优先从全局缓存获取
    let thumbnailPath = cacheManager.getImagePath(imageId, 'thumbnail');
    let originalPath = cacheManager.getImagePath(imageId, 'original');

    // 如果缓存中没有，异步获取并缓存
    if (!thumbnailPath && !originalPath) {
      const allImages = await window.electronAPI.getImages();
      const img = allImages.find(i => isSameId(i.id, imageId));
      if (img) {
        if (img.thumbnailPath) {
          thumbnailPath = await window.electronAPI.getImagePath(img.thumbnailPath);
          cacheManager.setImagePath(imageId, 'thumbnail', thumbnailPath);
        }
        if (img.relativePath) {
          originalPath = await window.electronAPI.getImagePath(img.relativePath);
          cacheManager.setImagePath(imageId, 'original', originalPath);
        }
      }
    }

    return { thumbnailPath, originalPath };
  }

  /**
   * 绑定 hover 事件
   * @param {string} selector - CSS 选择器
   * @param {Object} options - 配置选项
   * @param {Function} options.getContent - 获取内容文本的函数 (element) => string
   * @param {Function} options.getImageId - 获取图像 ID 的函数 (element) => string|null
   * @param {number} options.delay - 延迟时间（默认 500ms）
   */
  bind(selector, options) {
    if (!this.tooltip || !this.contentEl || !this.imageEl) return;

    const { getContent, getImageId, delay = 500 } = options;

    document.querySelectorAll(selector).forEach(element => {
      element.addEventListener('mouseenter', async (e) => {
        const content = getContent ? getContent(element) : '';
        if (content === null) return;

        this.currentElement = element;
        clearTimeout(this.hoverTimer);

        // 显示内容
        this.contentEl.textContent = content || '';
        this.tooltip.classList.remove('no-image');

        // 设置初始位置
        let left = e.clientX + 16;
        let top = e.clientY + 16;
        this.tooltip.style.left = left + 'px';
        this.tooltip.style.top = top + 'px';

        const imageId = getImageId ? getImageId(element) : null;
        if (!imageId) {
          this.tooltip.classList.add('no-image');
          this.imageEl.src = '';
          this.tooltip.classList.add('show');
          return;
        }

        // 延迟加载原图
        this.hoverTimer = setTimeout(async () => {
          if (this.currentElement !== element) return;

          const { originalPath } = await this.loadImagePaths(imageId);

          if (this.currentElement !== element) return;

          if (originalPath) {
            this.imageEl.src = `file://${originalPath}`;
          }
        }, delay);

        this.tooltip.classList.add('show');
      });

      element.addEventListener('mousemove', (e) => {
        if (this.tooltip.classList.contains('show')) {
          let left = e.clientX + 16;
          let top = e.clientY + 16;

          const tooltipRect = this.tooltip.getBoundingClientRect();
          if (left + tooltipRect.width > window.innerWidth - 16) {
            left = e.clientX - tooltipRect.width - 16;
          }
          if (top + tooltipRect.height > window.innerHeight - 16) {
            top = e.clientY - tooltipRect.height - 16;
          }

          this.tooltip.style.left = left + 'px';
          this.tooltip.style.top = top + 'px';
        }
      });

      element.addEventListener('mouseleave', () => {
        clearTimeout(this.hoverTimer);
        this.tooltip.classList.remove('show');
        this.imageEl.src = '';
        this.currentElement = null;
      });
    });
  }
}

export default HoverTooltipManager;
