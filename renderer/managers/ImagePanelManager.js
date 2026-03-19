import { PanelManagerBase } from './PanelManagerBase.js';
import { PanelRenderer, PanelItemRenderer } from './SharedComponents/index.js';
import { Constants } from '../constants.js';

/**
 * 图像面板管理器
 * 负责图像列表的渲染、筛选、标签管理等功能
 */
export class ImagePanelManager extends PanelManagerBase {
  // 图像特殊标签检查函数 Map
  static IMAGE_TAG_CHECKS = new Map([
    [Constants.FAVORITE_TAG, (img) => img.isFavorite],
    [Constants.SAFE_TAG, (img) => img.isSafe !== 0],
    [Constants.UNSAFE_TAG, (img) => img.isSafe === 0],
    [Constants.NO_TAG_TAG, (img) => !img.tags || img.tags.length === 0]
  ]);

  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 主应用引用
   * @param {Object} options.tagManager - 标签管理器
   * @param {Object} options.eventBus - 事件总线
   */
  constructor(options) {
    super({
      app: options.app,
      tagManager: options.tagManager,
      eventBus: options.eventBus,
      storagePrefix: 'image',
      defaultCardSize: 180
    });
    this.filteredImages = [];
  }

  /**
   * 获取图像列表（从 app 读取）
   */
  get images() {
    return this.app.images || [];
  }

  /**
   * 获取项目列表（实现基类抽象方法）
   * @returns {Array}
   */
  getItems() {
    return this.images;
  }

  /**
   * 获取特殊标签检查函数 Map（实现基类抽象方法）
   * @returns {Map}
   */
  getSpecialTagChecks() {
    return ImagePanelManager.IMAGE_TAG_CHECKS;
  }

  /**
   * 获取项目类型标识（实现基类抽象方法）
   * @returns {string}
   */
  getItemType() {
    return 'image';
  }

  /**
   * 加载图像列表（实现基类抽象方法）
   */
  async loadItems() {
    try {
      this.app.images = await window.electronAPI.getImages();
      // 重建图像 ID 索引
      this.app.rebuildImageIndex();
      return this.app.images;
    } catch (error) {
      console.error('Failed to load images:', error);
      this.app.images = [];
      this.app.imagesById.clear();
      throw error;
    }
  }

  /**
   * 初始化
   */
  async init() {
    await this.loadItems();
    await this.render();
    await this.renderTagFilters();
  }

  /**
   * 渲染容器（实现基类抽象方法）
   * @param {Array} filtered - 筛选后的图像列表
   */
  async renderContainer(filtered) {
    this.filteredImages = filtered;

    const container = document.getElementById('imageGrid');
    const listContainer = document.getElementById('imageList');
    const emptyState = document.getElementById('imageEmptyState');

    if (filtered.length === 0) {
      PanelRenderer.showEmptyState('imageGrid', 'imageEmptyState', '暂无图像');
      if (listContainer) listContainer.style.display = 'none';
      return;
    }

    PanelRenderer.hideEmptyState('imageGrid', 'imageEmptyState');

    // 根据视图模式渲染
    if (this.viewModeType === 'grid') {
      container.style.display = 'grid';
      if (listContainer) listContainer.style.display = 'none';

      // 渲染网格视图
      PanelRenderer.renderGrid(filtered, (img) => this.createCard(img), 'imageGrid');
      this.bindCardEvents(filtered);
      this.loadCardBackgrounds();
      this.bindHoverPreview('.image-card');
      this.bindCardDropEvents(container);
    } else {
      // 列表视图
      container.style.display = 'none';
      if (listContainer) {
        listContainer.style.display = 'flex';
        await this.renderListView(filtered);
      }
    }
  }

  /**
   * 创建图像卡片 HTML（实现基类抽象方法）
   * @param {Object} img - 图像对象
   * @returns {string} HTML 字符串
   */
  createCard(img) {
    return PanelItemRenderer.createImageGridItem(img, Constants.ICONS, this.sortBy, this.app);
  }

  /**
   * 绑定图像卡片事件（实现基类抽象方法）
   * @param {Array} filtered - 筛选后的图像列表
   */
  bindCardEvents(filtered) {
    const container = document.getElementById('imageGrid');
    if (!container) return;

    filtered.forEach(img => {
      const card = container.querySelector(`[data-id="${img.id}"]`);
      if (!card) return;

      // 点击卡片
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn')) {
          this.app.openImageDetailModal(img, { filteredList: filtered });
        }
      });

      // 删除按钮
      const deleteBtn = card.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await this.app.showConfirmDialog('确认删除', '确定要删除这张图像吗？');
          if (confirmed) {
            await this.deleteItem(img.id);
          }
        });
      }

      // 收藏按钮
      const favoriteBtn = card.querySelector('.favorite-btn');
      if (favoriteBtn) {
        favoriteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.toggleFavorite(img.id, !img.isFavorite);
        });
      }
    });
  }

  /**
   * 异步加载卡片背景图（实现基类抽象方法）
   */
  async loadCardBackgrounds() {
    const container = document.getElementById('imageGrid');
    if (!container) return;

    const cards = container.querySelectorAll('.image-card');
    for (const card of cards) {
      const imageId = card.dataset.id;
      const img = this.images.find(i => String(i.id) === String(imageId));
      if (!img) continue;

      const imagePath = img.thumbnailPath || img.relativePath;
      if (!imagePath) continue;

      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        const bgElement = card.querySelector('.image-card-bg, .card__bg');
        if (bgElement) {
          bgElement.style.backgroundImage = `url('file://${fullPath.replace(/\\/g, '/')}')`;
        }
      } catch (error) {
        console.error('Failed to load card background:', error);
      }
    }
  }

  /**
   * 渲染图像列表视图（实现基类抽象方法）
   * @param {Array} filtered - 筛选后的图像列表
   */
  async renderListView(filtered) {
    const listContainer = document.getElementById('imageList');
    if (!listContainer) return;

    const isCompact = this.viewModeType === 'list-compact';

    // 生成列表项 HTML
    listContainer.innerHTML = filtered.map((img, index) =>
      PanelItemRenderer.createImageListItem({
        img,
        icons: Constants.ICONS,
        isCompact,
        isSelected: this.selectedIds.has(img.id),
        index
      })
    ).join('');

    // 异步加载列表缩略图
    this.loadImageListThumbnails();

    // 绑定事件
    this.bindImageListEvents(filtered);
  }

  /**
   * 异步加载列表视图缩略图
   */
  async loadImageListThumbnails() {
    const listContainer = document.getElementById('imageList');
    if (!listContainer) return;

    const items = listContainer.querySelectorAll('.image-list-item');
    for (const item of items) {
      const imagePath = item.dataset.imagePath;
      if (!imagePath) continue;

      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        const wrapper = item.querySelector('.image-list-thumbnail-wrapper');
        if (wrapper) {
          wrapper.innerHTML = `<img src="file://${fullPath.replace(/\\/g, '/').replace(/"/g, '&quot;')}" alt="" class="image-list-thumbnail">`;
        }
      } catch (error) {
        console.error('Failed to load list thumbnail:', error);
      }
    }
  }

  /**
   * 绑定图像列表事件
   * @param {Array} images - 图像列表
   */
  bindImageListEvents(images) {
    const listContainer = document.getElementById('imageList');
    if (!listContainer) return;

    // 列表项点击事件
    listContainer.querySelectorAll('.image-list-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // 如果点击的是复选框或按钮，不处理
        if (e.target.closest('.image-list-checkbox') ||
            e.target.closest('.favorite-btn') ||
            e.target.closest('.delete-btn')) {
          return;
        }

        const id = item.dataset.id;
        const index = parseInt(item.dataset.index);

        // 多选逻辑
        if (e.ctrlKey || e.metaKey) {
          if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
          } else {
            this.selectedIds.add(id);
            this.lastSelectedIndex = index;
          }
        } else if (e.shiftKey && this.lastSelectedIndex !== -1) {
          // Shift+点击：范围选择
          const start = Math.min(this.lastSelectedIndex, index);
          const end = Math.max(this.lastSelectedIndex, index);
          for (let i = start; i <= end; i++) {
            this.selectedIds.add(images[i].id);
          }
        } else {
          // 普通点击：单选并打开详情
          this.selectedIds.clear();
          this.selectedIds.add(id);
          this.lastSelectedIndex = index;
          const img = images.find(i => i.id === id);
          if (img) {
            this.app.openImageDetailModal(img, { filteredList: images });
          }
        }

        this.render();
      });
    });

    // 复选框事件
    listContainer.querySelectorAll('.image-list-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const index = parseInt(e.target.dataset.index);

        if (e.target.checked) {
          this.selectedIds.add(id);
          this.lastSelectedIndex = index;
        } else {
          this.selectedIds.delete(id);
        }

        this.render();
      });
    });

    // 收藏按钮事件
    listContainer.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const img = this.images.find(i => String(i.id) === String(id));
        if (img) {
          await this.toggleFavorite(id, !img.isFavorite);
        }
      });
    });

    // 删除按钮事件
    listContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const confirmed = await this.app.showConfirmDialog('确认删除', '确定要删除这张图像吗？');
        if (confirmed) {
          await this.deleteItem(id);
        }
      });
    });
  }

  /**
   * 绑定 hover 预览事件（实现基类抽象方法）
   * @param {string} selector - CSS 选择器
   */
  bindHoverPreview(selector) {
    if (!this.app.promptHoverTooltip) return;

    this.app.promptHoverTooltip.bind(selector, {
      getContent: (element) => {
        const imageId = element.dataset.id || element.dataset.imageId;
        const image = this.images.find(img => String(img.id) === String(imageId));
        if (!image || !image.promptRefs || image.promptRefs.length === 0) {
          return '';
        }
        return image.promptRefs[0].promptContent || '';
      },
      getImageId: (element) => {
        const imageId = element.dataset.id || element.dataset.imageId;
        return imageId || null;
      },
      delay: 500
    });
  }

  /**
   * 绑定卡片拖拽事件（实现基类抽象方法）
   * @param {HTMLElement} container - 容器元素
   */
  bindCardDropEvents(container) {
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dragSource = e.dataTransfer.getData('drag-source');
      const tagName = e.dataTransfer.getData('text/plain');

      if (dragSource === 'image-tag' && tagName) {
        const card = e.target.closest('.image-card');
        if (card) {
          const imageId = card.dataset.id || card.dataset.imageId;
          if (imageId) {
            try {
              await this.app.addTagToImage(imageId, tagName);
            } catch (error) {
              this.app.showToast(error.message, 'error');
            }
          }
        }
      }
    });
  }

  /**
   * 获取标签筛选容器 ID（实现基类抽象方法）
   * @returns {string}
   */
  getTagFilterContainerId() {
    return 'imageTagFilterList';
  }

  /**
   * 获取特殊标签容器 ID（实现基类抽象方法）
   * @returns {string}
   */
  getSpecialTagsContainerId() {
    return 'imageTagFilterSpecialTags';
  }

  /**
   * 获取清除筛选按钮 ID（实现基类抽象方法）
   * @returns {string}
   */
  getClearFilterBtnId() {
    return 'clearImageTagFilter';
  }

  /**
   * 获取标签筛选头部容器 ID（实现基类抽象方法）
   * @returns {string}
   */
  getTagFilterHeaderContainerId() {
    return 'imageTagFilterHeaderTags';
  }

  /**
   * 获取标签拖拽类型（实现基类抽象方法）
   * @returns {string}
   */
  getTagDragType() {
    return 'image-tag';
  }

  /**
   * 获取所有标签（实现基类抽象方法）
   * @returns {Promise<Array>}
   */
  async getAllTags() {
    return window.electronAPI.getImageTags();
  }

  /**
   * 获取带分组的标签（实现基类抽象方法）
   * @returns {Promise<Array>}
   */
  async getTagsWithGroup() {
    return window.electronAPI.getImageTagsWithGroup();
  }

  /**
   * 获取标签组（实现基类抽象方法）
   * @returns {Promise<Array>}
   */
  async getTagGroups() {
    return window.electronAPI.getImageTagGroups();
  }

  /**
   * 计算特殊标签计数（实现基类抽象方法）
   * @param {Array} visibleItems - 可见图像列表
   * @returns {Array<{tag: string, count: number}>}
   */
  calculateSpecialTagCounts(visibleItems) {
    const specialTags = [];
    const favoriteCount = visibleItems.filter(img => img.isFavorite).length;
    const noTagCount = visibleItems.filter(img => !img.tags || img.tags.length === 0).length;
    const violatingCount = visibleItems.filter(img => img.tags && img.tags.includes(Constants.VIOLATING_TAG)).length;

    if (favoriteCount > 0) {
      specialTags.push({ tag: Constants.FAVORITE_TAG, count: favoriteCount });
    }
    if (noTagCount > 0) {
      specialTags.push({ tag: Constants.NO_TAG_TAG, count: noTagCount });
    }
    if (violatingCount > 0) {
      specialTags.push({ tag: Constants.VIOLATING_TAG, count: violatingCount });
    }

    // NSFW 模式下显示安全评级标签
    if (this.viewMode === 'nsfw') {
      const safeCount = visibleItems.filter(img => img.isSafe !== 0).length;
      const unsafeCount = visibleItems.filter(img => img.isSafe === 0).length;
      if (safeCount > 0) {
        specialTags.push({ tag: Constants.SAFE_TAG, count: safeCount });
      }
      if (unsafeCount > 0) {
        specialTags.push({ tag: Constants.UNSAFE_TAG, count: unsafeCount });
      }
    }

    return specialTags;
  }

  /**
   * 删除图像（实现基类抽象方法）
   * @param {string} id - 图像 ID
   */
  async deleteItem(id) {
    try {
      await window.electronAPI.deleteImage(id);
      await this.loadItems();
      await this.render();
      this.app.emit('imagesChanged', { images: this.images });

      // 刷新回收站
      if (this.app.trashManager) {
        await this.app.trashManager.loadTrash();
      }

      // 刷新统计界面
      if (this.app.currentPanel === 'statistics') {
        await this.app.renderStatistics();
      }

      this.app.showToast('图像已删除', 'success');
    } catch (error) {
      console.error('Failed to delete image:', error);
      this.app.showToast('删除失败：' + error.message, 'error');
    }
  }

  /**
   * 切换收藏状态（实现基类抽象方法）
   * @param {string} id - 图像 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleFavorite(id, isFavorite) {
    try {
      await window.electronAPI.updateImageFavStatus(id, isFavorite);

      const img = this.images.find(i => String(i.id) === String(id));
      if (img) {
        img.isFavorite = isFavorite;
      }

      this.app.showToast(isFavorite ? '已收藏' : '已取消收藏', 'success');
      this.updateFavoriteUI(id, isFavorite);
      this.renderTagFilters();
    } catch (error) {
      console.error('toggleFavorite error:', error);
      this.app.showToast('操作失败：' + error.message, 'error');
    }
  }

  /**
   * 更新收藏按钮 UI（实现基类抽象方法）
   * @param {string} id - 图像 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  updateFavoriteUI(id, isFavorite) {
    const updateBtn = (btn) => {
      if (!btn) return;
      if (isFavorite) {
        btn.classList.add('active');
        btn.title = '取消收藏';
        btn.innerHTML = Constants.ICONS.favorite.filled;
      } else {
        btn.classList.remove('active');
        btn.title = '收藏';
        btn.innerHTML = Constants.ICONS.favorite.outline;
      }
    };

    const card = document.querySelector(`.image-card[data-id="${id}"]`);
    if (card) {
      const btn = card.querySelector('.favorite-btn');
      updateBtn(btn);
      card.classList.toggle('is-favorite', isFavorite);
    }

    // 更新列表视图
    const listItem = document.querySelector(`.image-list-item[data-id="${id}"]`);
    if (listItem) {
      const btn = listItem.querySelector('.favorite-btn');
      updateBtn(btn);
      listItem.classList.toggle('is-favorite', isFavorite);
    }
  }

  /**
   * 排序图像列表（实现基类抽象方法）
   * @param {Array} items - 图像列表
   * @param {string} sortBy - 排序字段
   * @param {string} sortOrder - 排序顺序
   * @returns {Array}
   */
  sortItems(items, sortBy, sortOrder) {
    const sorted = [...items];
    const order = sortOrder === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let valueA, valueB;

      switch (sortBy) {
        case 'updatedAt':
          valueA = a.updatedAt || 0;
          valueB = b.updatedAt || 0;
          break;
        case 'createdAt':
          valueA = a.createdAt || 0;
          valueB = b.createdAt || 0;
          break;
        case 'fileName':
          valueA = (a.fileName || '').toLowerCase();
          valueB = (b.fileName || '').toLowerCase();
          break;
        case 'width':
          valueA = a.width || 0;
          valueB = b.width || 0;
          break;
        case 'height':
          valueA = a.height || 0;
          valueB = b.height || 0;
          break;
        case 'fileSize':
          valueA = a.fileSize || 0;
          valueB = b.fileSize || 0;
          break;
        default:
          valueA = a.updatedAt || 0;
          valueB = b.updatedAt || 0;
      }

      if (valueA < valueB) return -1 * order;
      if (valueA > valueB) return 1 * order;
      return 0;
    });

    return sorted;
  }

  /**
   * 订阅事件（重写基类方法）
   */
  subscribeToEvents() {
    if (!this.eventBus) return;
    this.eventBus.on('safeRatingChanged', (data) => {
      if (data.targetType === 'image') {
        this.handleImageRatingChange(data);
      }
    });
  }

  /**
   * 处理安全评级变更
   * @param {Object} data - 事件数据
   */
  handleImageRatingChange(data) {
    const img = this.images.find(i => String(i.id) === String(data.targetId));
    if (img) {
      img.isSafe = data.isSafe ? 1 : 0;
      this.render();
    }
  }

  /**
   * 设置卡片大小（重写基类方法）
   * @param {number} size - 卡片宽度/高度（像素），保持1:1方形
   */
  setCardSize(size) {
    super.setCardSize(size);
    const imageGrid = document.getElementById('imageGrid');
    if (imageGrid) {
      // 使用固定列宽，每列大小等于滑杆值
      imageGrid.style.gridTemplateColumns = `repeat(auto-fill, ${size}px)`;
      // 设置行高等于列宽，保持1:1方形
      imageGrid.style.gridAutoRows = `${size}px`;
    }
  }

}

export default ImagePanelManager;
