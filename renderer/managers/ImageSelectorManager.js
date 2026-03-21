import { isSameId } from '../utils/isSameId.js';
import { Constants } from '../constants.js';

/**
 * 图像选择器管理器
 * 负责管理提示词编辑时的图像选择功能
 */
export class ImageSelectorManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;

    // 选择状态
    this.selectedImages = [];

    // 排序状态（独立于主界面的排序设置）
    this.sortBy = localStorage.getItem(Constants.LocalStorageKey.IMAGE_SELECTOR_SORT_BY) || 'updatedAt';
    this.sortOrder = localStorage.getItem(Constants.LocalStorageKey.IMAGE_SELECTOR_SORT_ORDER) || 'desc';
  }

  /**
   * 打开图像选择器
   * @param {Object} options - 选项
   * @param {Function} options.onConfirm - 确认选择后的回调
   */
  async open(options = {}) {
    const modal = document.getElementById('imageSelectorModal');
    modal.classList.add('active');

    // 初始化选择状态
    this.selectedImages = [];
    this.onConfirm = options.onConfirm;
    document.getElementById('confirmImageSelectorBtn').disabled = true;

    // 重置搜索和筛选状态
    const searchInput = document.getElementById('imageSelectorSearchInput');
    const tagFilter = document.getElementById('imageSelectorTagFilter');
    if (searchInput) searchInput.value = '';
    if (tagFilter) tagFilter.value = '';

    // 加载图像列表
    await this.renderGrid();
    await this.renderTagFilters();

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 关闭图像选择器
   */
  close() {
    document.getElementById('imageSelectorModal').classList.remove('active');
    this.selectedImages = [];
    this.onConfirm = null;
  }

  /**
   * 渲染图像选择器网格
   */
  async renderGrid() {
    const grid = document.getElementById('imageSelectorGrid');
    const emptyState = document.getElementById('imageSelectorEmpty');
    const searchInput = document.getElementById('imageSelectorSearchInput');
    const tagFilter = document.getElementById('imageSelectorTagFilter');

    try {
      // 获取所有图像（使用选择图像界面独立的排序设置）
      let images = await window.electronAPI.getImages(this.sortBy, this.sortOrder);

      // 根据 viewMode 过滤（safe 模式只显示安全内容）
      if (this.app.viewMode === 'safe') {
        images = images.filter(img => img.isSafe !== 0);
      }

      // 应用搜索过滤
      const searchTerm = searchInput?.value?.trim().toLowerCase();
      if (searchTerm) {
        images = images.filter(img =>
          img.fileName?.toLowerCase().includes(searchTerm) ||
          img.note?.toLowerCase().includes(searchTerm)
        );
      }

      // 应用标签过滤
      const selectedTag = tagFilter?.value;
      if (selectedTag) {
        images = images.filter(img =>
          img.tags?.includes(selectedTag)
        );
      }

      if (images.length === 0) {
        grid.innerHTML = '';
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
      }

      grid.style.display = 'grid';
      emptyState.style.display = 'none';

      // 获取所有图像的完整路径
      const imageItems = await Promise.all(images.map(async (image) => {
        const imagePath = image.thumbnailPath || image.relativePath;
        const fullPath = imagePath ? await window.electronAPI.getImagePath(imagePath) : '';
        return { ...image, fullPath };
      }));

      grid.innerHTML = imageItems.map(image => `
        <div class="image-selector-item" data-image-id="${image.id}" data-image-path="${this.escapeHtml(image.relativePath || image.path)}">
          <img src="file://${this.escapeHtml(image.fullPath)}" alt="${this.escapeHtml(image.name || image.fileName)}" loading="lazy">
        </div>
      `).join('');

      // 绑定点击事件
      grid.querySelectorAll('.image-selector-item').forEach(item => {
        item.addEventListener('click', () => {
          // 单选模式
          grid.querySelectorAll('.image-selector-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');

          const imageId = item.dataset.imageId;
          const imagePath = item.dataset.imagePath;
          this.selectedImages = [{ id: imageId, path: imagePath }];
          document.getElementById('confirmImageSelectorBtn').disabled = false;
        });
      });
    } catch (error) {
      window.electronAPI.logError('ImageSelectorManager.js', 'Failed to render image selector:', error);
      grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">加载失败</p>';
    }
  }

  /**
   * 渲染图像选择器标签筛选器
   */
  async renderTagFilters() {
    const tagFilter = document.getElementById('imageSelectorTagFilter');
    if (!tagFilter) return;

    try {
      const tags = await window.electronAPI.getImageTags();
      tagFilter.innerHTML = '<option value="">所有标签</option>' +
        tags.map(tag => `<option value="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</option>`).join('');
    } catch (error) {
      window.electronAPI.logError('ImageSelectorManager.js', 'Failed to render image selector tag filters:', error);
    }
  }

  /**
   * 绑定图像选择器事件
   */
  bindEvents() {
    // 关闭按钮
    document.getElementById('closeImageSelectorModal').addEventListener('click', () => this.close());
    document.getElementById('cancelImageSelectorBtn').addEventListener('click', () => this.close());

    // 搜索输入
    const searchInput = document.getElementById('imageSelectorSearchInput');
    const clearImageSelectorSearchBtn = document.getElementById('clearImageSelectorSearchBtn');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.renderGrid();
        // 显示/隐藏清空按钮
        if (clearImageSelectorSearchBtn) {
          clearImageSelectorSearchBtn.style.display = searchInput.value ? 'flex' : 'none';
        }
      });
    }
    // 清空选择图像搜索按钮
    if (clearImageSelectorSearchBtn) {
      clearImageSelectorSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.renderGrid();
        clearImageSelectorSearchBtn.style.display = 'none';
        searchInput.focus();
      });
    }

    // 标签筛选
    const tagFilter = document.getElementById('imageSelectorTagFilter');
    if (tagFilter) {
      tagFilter.addEventListener('change', () => {
        this.renderGrid();
      });
    }

    // 排序选择（使用独立的状态）
    const sortSelect = document.getElementById('imageSelectorSortSelect');
    if (sortSelect) {
      sortSelect.value = `${this.sortBy}-${this.sortOrder}`;
      sortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.sortBy = sortBy;
        this.sortOrder = sortOrder;
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_SELECTOR_SORT_BY, sortBy);
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_SELECTOR_SORT_ORDER, sortOrder);
        this.renderGrid();
      });
    }

    // 排序逆序按钮（使用独立的状态）
    const sortReverseBtn = document.getElementById('imageSelectorSortReverseBtn');
    if (sortReverseBtn) {
      sortReverseBtn.addEventListener('click', () => {
        this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_SELECTOR_SORT_ORDER, this.sortOrder);
        if (sortSelect) {
          sortSelect.value = `${this.sortBy}-${this.sortOrder}`;
        }
        this.renderGrid();
      });
    }

    // 确认选择
    document.getElementById('confirmImageSelectorBtn').addEventListener('click', () => {
      this.confirmSelection();
    });

    // 点击外部关闭
    document.getElementById('imageSelectorModal').addEventListener('click', (e) => {
      if (isSameId(e.target.id, 'imageSelectorModal')) this.close();
    });
  }

  /**
   * 确认图像选择
   */
  async confirmSelection() {
    if (!this.selectedImages || this.selectedImages.length === 0) return;

    const selectedImage = this.selectedImages[0];

    // 调用回调函数
    if (this.onConfirm) {
      await this.onConfirm(selectedImage);
    }

    this.close();
  }

  /**
   * HTML转义
   * @param {string} text - 需要转义的文本
   * @returns {string} - 转义后的HTML
   * @private
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
