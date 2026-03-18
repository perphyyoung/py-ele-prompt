import { TagRenderer } from './SharedComponents/TagRenderer.js';
import { ListRenderer } from './SharedComponents/ListRenderer.js';
import { Constants } from '../constants.js';

/**
 * 图像面板管理器
 * 负责图像列表的渲染、筛选、标签管理等功能
 */
export class ImagePanelManager {
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
    this.app = options.app;
    this.tagManager = options.tagManager;
    this.eventBus = options.eventBus;
    
    this.filteredImages = [];
    this.selectedImageTags = [];
    this.viewMode = options.app.viewMode || 'safe';
    // 从 localStorage 加载视图模式和排序设置
    this.viewModeType = localStorage.getItem('imageViewMode') || 'grid';
    this.sortBy = localStorage.getItem('imageSortBy') || 'updatedAt';
    this.sortOrder = localStorage.getItem('imageSortOrder') || 'desc';
    // 标签筛选排序设置
    this.tagFilterSortBy = localStorage.getItem('imageTagFilterSortBy') || 'count';
    this.tagFilterSortOrder = localStorage.getItem('imageTagFilterSortOrder') || 'desc';
    // 卡片大小设置
    this.cardSize = parseInt(localStorage.getItem('imageCardSize')) || 180;
    this.selectedImageIds = new Set();
    this.lastSelectedIndex = -1;

    // 绑定事件
    this.subscribeToEvents();
  }

  /**
   * 获取图像列表（从 app 读取）
   */
  get images() {
    return this.app.images || [];
  }

  /**
   * 初始化
   */
  async init() {
    await this.loadImages();
    await this.renderGrid();
    await this.renderTagFilters();
  }

  /**
   * 加载图像列表（加载到 app）
   */
  async loadImages() {
    try {
      this.app.images = await window.electronAPI.getImages();
      return this.app.images;
    } catch (error) {
      console.error('Failed to load images:', error);
      throw error;
    }
  }

  /**
   * 渲染图像网格
   */
  async renderGrid() {
    try {
      // 过滤图像
      let filtered = this.images;

      // 过滤已删除的图像
      filtered = filtered.filter(img => !img.isDeleted);

      // 根据 viewMode 过滤
      if (this.viewMode === 'safe') {
        filtered = filtered.filter(img => img.isSafe !== 0);
      }

      // 标签筛选
      if (this.selectedImageTags.length > 0) {
        filtered = filtered.filter(img => {
          return this.selectedImageTags.every(tag => {
            const checkFn = ImagePanelManager.IMAGE_TAG_CHECKS.get(tag);
            if (checkFn) {
              return checkFn(img);
            }
            // 普通标签
            return img.tags && img.tags.includes(tag);
          });
        });
      }

      // 排序
      filtered = this.sortImages(filtered, this.sortBy, this.sortOrder);

      this.filteredImages = filtered;

      const container = document.getElementById('imageGrid');
      const listContainer = document.getElementById('imageList');
      const emptyState = document.getElementById('imageEmptyState');

      if (filtered.length === 0) {
        ListRenderer.showEmptyState('imageGrid', 'imageEmptyState', '暂无图像');
        if (listContainer) listContainer.style.display = 'none';
        return;
      }

      ListRenderer.hideEmptyState('imageGrid', 'imageEmptyState');

      // 根据视图模式渲染
      if (this.viewModeType === 'grid') {
        container.style.display = 'grid';
        if (listContainer) listContainer.style.display = 'none';

        // 渲染网格视图
        ListRenderer.renderGrid(filtered, (img) => this.createImageCard(img), 'imageGrid');
        this.bindImageCardEvents(filtered);
        this.loadCardBackgrounds();
        this.bindImageHoverPreview('.image-card');
        this.bindImageCardDropEvents(container);
      } else {
        // 列表视图
        container.style.display = 'none';
        if (listContainer) {
          listContainer.style.display = 'flex';
          await this.renderImageListView(filtered);
        }
      }
    } catch (error) {
      console.error('Failed to render image grid:', error);
      this.app.showToast('加载图像失败', 'error');
    }
  }

  /**
   * 创建图像卡片 HTML
   * @param {Object} img - 图像对象
   * @returns {string} HTML 字符串
   */
  createImageCard(img) {
    const favoriteIcon = img.isFavorite ? this.app.ICONS.favorite.filled : this.app.ICONS.favorite.outline;
    const tagsHtml = TagRenderer.generateTagsHtml(img.tags, 'tag-display', 'tag-display-empty');
    
    // 动态信息
    let dynamicInfo = '';
    if (this.sortBy === 'updatedAt' && img.updatedAt) {
      const date = new Date(img.updatedAt);
      dynamicInfo = `<div class="image-card-dynamic-info">更新于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else if (this.sortBy === 'createdAt' && img.createdAt) {
      const date = new Date(img.createdAt);
      dynamicInfo = `<div class="image-card-dynamic-info">创建于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else if (this.sortBy === 'fileName') {
      dynamicInfo = `<div class="image-card-file-name">${TagRenderer.escapeHtml(img.fileName)}</div>`;
    } else {
      dynamicInfo = `<div class="image-card-file-name">${TagRenderer.escapeHtml(img.fileName)}</div>`;
    }

    return `
      <div class="image-card ${img.isFavorite ? 'is-favorite' : ''}" 
           data-id="${img.id}" 
           data-image-id="${img.id}"
           data-drop-target="image">
        <div class="image-card-bg card__bg"></div>
        <div class="image-card-overlay card__overlay">
          <div class="image-card-header card__header">
            <div class="image-card-actions-left">
              <button type="button" class="favorite-btn ${img.isFavorite ? 'active' : ''}" data-id="${img.id}" title="${img.isFavorite ? '取消收藏' : '收藏'}">
                ${favoriteIcon}
              </button>
            </div>
            <div class="image-card-actions-right">
              <button type="button" class="delete-btn" data-id="${img.id}" title="删除">
                ${this.app.ICONS.delete}
              </button>
            </div>
          </div>
          <div class="image-card-footer card__footer">
            <div class="image-card-tags">${tagsHtml}</div>
            ${dynamicInfo}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定图像卡片事件
   * @param {Array} filtered - 筛选后的图像列表
   */
  bindImageCardEvents(filtered) {
    const container = document.getElementById('imageGrid');
    if (!container) return;

    filtered.forEach(img => {
      const card = container.querySelector(`[data-id="${img.id}"]`);
      if (!card) return;

      // 点击卡片
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn')) {
          this.app.openImageDetailModal(img);
        }
      });

      // 删除按钮
      const deleteBtn = card.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await this.app.showConfirmDialog('确认删除', '确定要删除这张图像吗？');
          if (confirmed) {
            await this.deleteImage(img.id);
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
   * 异步加载卡片背景图
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
   * 渲染标签筛选器
   */
  async renderTagFilters() {
    try {
      const container = document.getElementById('imageTagFilterList');
      const specialTagsContainer = document.getElementById('imageTagFilterSpecialTags');
      const clearBtn = document.getElementById('clearImageTagFilter');

      // 更新清除按钮显示状态
      if (clearBtn) {
        clearBtn.style.display = this.selectedImageTags.length > 0 ? 'block' : 'none';
      }

      // 获取所有标签
      const tags = await window.electronAPI.getImageTags();
      const tagsWithGroup = await window.electronAPI.getImageTagsWithGroup();
      const groups = await window.electronAPI.getImageTagGroups();

      // 计算标签计数（只计算未删除的图像）
      const tagCounts = {};
      let visibleImages = this.images.filter(img => !img.isDeleted);

      // 根据 viewMode 过滤
      if (this.viewMode === 'safe') {
        visibleImages = visibleImages.filter(img => img.isSafe !== 0);
      }

      visibleImages.forEach(img => {
        if (img.tags && img.tags.length > 0) {
          img.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      // 特殊标签
      const specialTags = [];
      const favoriteCount = visibleImages.filter(img => img.isFavorite).length;
      const noTagCount = visibleImages.filter(img => !img.tags || img.tags.length === 0).length;
      const violatingCount = visibleImages.filter(img => img.tags && img.tags.includes(Constants.VIOLATING_TAG)).length;

      if (favoriteCount > 0) {
        specialTags.push({ tag: Constants.FAVORITE_TAG, count: favoriteCount });
      }
      if (noTagCount > 0) {
        specialTags.push({ tag: Constants.NO_TAG_TAG, count: noTagCount });
      }
      if (violatingCount > 0) {
        specialTags.push({ tag: Constants.VIOLATING_TAG, count: violatingCount });
      }

      // NSFW 模式下显示安全评级标签（始终显示全部数据的计数）
      if (this.viewMode === 'nsfw') {
        const safeCount = this.images.filter(img => img.isSafe !== 0).length;
        const unsafeCount = this.images.filter(img => img.isSafe === 0).length;
        if (safeCount > 0) {
          specialTags.push({ tag: Constants.SAFE_TAG, count: safeCount });
        }
        if (unsafeCount > 0) {
          specialTags.push({ tag: Constants.UNSAFE_TAG, count: unsafeCount });
        }
      }

      // 对标签进行排序
      const sortedTagsWithGroup = this.sortTagsForFilter(tagsWithGroup, tagCounts);

      // 渲染特殊标签
      if (specialTagsContainer) {
        const selectedSet = new Set(this.selectedImageTags);
        const specialTagsHtml = specialTags.map(({ tag, count }) => {
          const isActive = selectedSet.has(tag);
          return `
            <button class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagRenderer.escapeHtml(tag)}" data-is-special="true">
              <span class="tag-name">${TagRenderer.escapeHtml(tag)}</span>
              <span class="tag-badge">${count}</span>
            </button>
          `;
        }).join('');
        specialTagsContainer.innerHTML = specialTagsHtml || '<span class="tag-filter-empty">暂无特殊标签</span>';
      }

      // 渲染普通标签
      const html = TagRenderer.renderTagFilters(sortedTagsWithGroup, tagCounts, {
        specialTags: [],
        selectedImageTags: this.selectedImageTags,
        groups: groups,
        isImage: true
      });

      if (container) {
        container.innerHTML = html || '<span class="tag-filter-empty">暂无标签</span>';
      }

      // 绑定事件
      this.bindTagFilterEvents();
    } catch (error) {
      console.error('Failed to render tag filters:', error);
    }
  }

  /**
   * 绑定标签筛选器事件
   */
  bindTagFilterEvents() {
    const container = document.getElementById('imageTagFilterList');
    const specialTagsContainer = document.getElementById('imageTagFilterSpecialTags');
    if (!container && !specialTagsContainer) return;

    // 特殊标签点击
    if (specialTagsContainer) {
      specialTagsContainer.querySelectorAll('.tag-filter-item[data-is-special="true"]').forEach(item => {
        item.addEventListener('click', (e) => {
          const tag = item.dataset.tag;
          if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + 点击：多选模式
            const index = this.selectedImageTags.indexOf(tag);
            if (index > -1) {
              this.selectedImageTags.splice(index, 1);
            } else {
              this.selectedImageTags.push(tag);
            }
          } else {
            // 普通点击：纯单选模式
            const index = this.selectedImageTags.indexOf(tag);
            if (index > -1) {
              // 如果已选中，则取消选择
              this.selectedImageTags.splice(index, 1);
            } else {
              // 未选中：清除所有选择，只选中当前
              this.selectedImageTags = [tag];
            }
          }
          this.renderGrid();
          this.renderTagFilters();
        });
      });
    }

    // 普通标签点击
    if (container) {
      container.querySelectorAll('.tag-filter-item:not([data-is-special="true"])').forEach(item => {
        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tag = item.dataset.tag;
          const groupId = item.closest('.tag-filter-group')?.dataset.groupId;

          // 获取标签所属的组信息
          const groups = await window.electronAPI.getImageTagGroups();
          const group = groups.find(g => String(g.id) === String(groupId));
          const isSingleSelectGroup = group && group.type === 'single';

          if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + 点击：多选模式（单选组仍限制单选）
            if (isSingleSelectGroup) {
              // 单选组：清除同组其他标签
              const groupTags = group.tags;
              this.selectedImageTags = this.selectedImageTags.filter(t => !groupTags.includes(t));
              this.selectedImageTags.push(tag);
            } else {
              // 多选模式
              const index = this.selectedImageTags.indexOf(tag);
              if (index > -1) {
                this.selectedImageTags.splice(index, 1);
              } else {
                this.selectedImageTags.push(tag);
              }
            }
          } else {
            // 普通点击：纯单选模式
            const index = this.selectedImageTags.indexOf(tag);
            if (index > -1) {
              // 如果已选中，则取消选择
              this.selectedImageTags.splice(index, 1);
            } else {
              // 未选中：清除所有选择，只选中当前
              this.selectedImageTags = [tag];
            }
          }

          this.renderGrid();
          this.renderTagFilters();
        });
      });
    }
  }

  /**
   * 删除图像
   * @param {string} id - 图像 ID
   */
  async deleteImage(id) {
    try {
      await window.electronAPI.deleteImage(id);
      await this.loadImages();
      await this.renderGrid();
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
   * 切换收藏状态
   * @param {string} id - 图像 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleFavorite(id, isFavorite) {
    try {
      await window.electronAPI.toggleFavoriteImage(id, isFavorite);
      
      const img = this.images.find(i => String(i.id) === String(id));
      if (img) {
        img.isFavorite = isFavorite;
      }

      this.app.showToast(isFavorite ? '已收藏' : '已取消收藏', 'success');
      this.updateImageFavoriteUI(id, isFavorite);
      this.renderTagFilters();
    } catch (error) {
      console.error('toggleFavorite error:', error);
      this.app.showToast('操作失败：' + error.message, 'error');
    }
  }

  /**
   * 更新收藏按钮 UI
   * @param {string} id - 图像 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  updateImageFavoriteUI(id, isFavorite) {
    const updateBtn = (btn) => {
      if (!btn) return;
      if (isFavorite) {
        btn.classList.add('active');
        btn.title = '取消收藏';
        btn.innerHTML = this.app.ICONS.favorite.filled;
      } else {
        btn.classList.remove('active');
        btn.title = '收藏';
        btn.innerHTML = this.app.ICONS.favorite.outline;
      }
    };

    const card = document.querySelector(`.image-card[data-id="${id}"]`);
    if (card) {
      const btn = card.querySelector('.favorite-btn');
      updateBtn(btn);
      card.classList.toggle('is-favorite', isFavorite);
    }
  }

  /**
   * 绑定 hover 预览事件
   * @param {string} selector - CSS 选择器
   */
  bindImageHoverPreview(selector) {
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
   * 绑定卡片拖拽事件
   * @param {HTMLElement} container - 容器元素
   */
  bindImageCardDropEvents(container) {
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
   * 订阅事件
   */
  subscribeToEvents() {
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
      this.renderGrid();
    }
  }

  /**
   * 清除标签筛选
   */
  clearTagFilter() {
    this.selectedImageTags = [];
    this.renderGrid();
    this.renderTagFilters();
  }

  /**
   * 设置视图模式
   * @param {string} mode - 视图模式
   */
  setViewMode(mode) {
    this.viewModeType = mode;
    localStorage.setItem('imageViewMode', mode);
    this.renderGrid();
  }

  /**
   * 排序图像列表
   * @param {Array} images - 图像列表
   * @param {string} sortBy - 排序字段 (updatedAt, createdAt, fileName, width, height, fileSize)
   * @param {string} sortOrder - 排序顺序 (asc, desc)
   * @returns {Array} 排序后的列表
   */
  sortImages(images, sortBy, sortOrder) {
    const sorted = [...images];
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
   * 排序标签（用于标签筛选器）
   * @param {Array} tags - 标签数组
   * @param {Object} tagCounts - 标签计数对象
   * @returns {Array} 排序后的标签数组
   */
  sortTagsForFilter(tags, tagCounts) {
    const sorted = [...tags];
    const order = this.tagFilterSortOrder === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      const countA = tagCounts[a.name] || 0;
      const countB = tagCounts[b.name] || 0;
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();

      if (this.tagFilterSortBy === 'count') {
        if (countA !== countB) {
          return (countA - countB) * order;
        }
        // 数量相同时按名称排序
        return nameA.localeCompare(nameB);
      } else if (this.tagFilterSortBy === 'name') {
        return nameA.localeCompare(nameB) * order;
      }
      return 0;
    });

    return sorted;
  }

  /**
   * 设置排序方式
   * @param {string} sortBy - 排序字段
   * @param {string} sortOrder - 排序顺序
   */
  setSort(sortBy, sortOrder) {
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
    this.renderGrid();
  }

  /**
   * 设置卡片大小
   * @param {number} size - 卡片宽度/高度（像素），保持1:1方形
   */
  setCardSize(size) {
    this.cardSize = size;
    const imageGrid = document.getElementById('imageGrid');
    if (imageGrid) {
      // 使用固定列宽，每列大小等于滑杆值
      imageGrid.style.gridTemplateColumns = `repeat(auto-fill, ${size}px)`;
      // 设置行高等于列宽，保持1:1方形
      imageGrid.style.gridAutoRows = `${size}px`;
    }
  }

  /**
   * 渲染图像列表视图
   * @param {Array} filtered - 筛选后的图像列表
   */
  async renderImageListView(filtered) {
    const listContainer = document.getElementById('imageList');
    if (!listContainer) return;

    const isCompact = this.viewModeType === 'list-compact';

    // 生成列表项 HTML（先不加载图像，使用 data 属性存储路径）
    listContainer.innerHTML = filtered.map((img, index) => {
      const isSelected = this.selectedImageIds.has(img.id);
      const isCompactClass = isCompact ? 'is-compact' : '';
      const favoriteIcon = img.isFavorite ? this.app.ICONS.favorite.filled : this.app.ICONS.favorite.outline;
      const tagsHtml = TagRenderer.generateTagsHtml(img.tags, 'tag-display', 'tag-display-empty');

      // 获取图像路径
      const imagePath = img.thumbnailPath || img.relativePath || '';

      if (isCompact) {
        return `
          <div class="image-list-item ${isCompactClass} ${img.isFavorite ? 'is-favorite' : ''} ${isSelected ? 'is-selected' : ''}" 
               data-id="${img.id}" 
               data-index="${index}"
               data-image-path="${imagePath.replace(/"/g, '&quot;')}">
            <input type="checkbox" class="image-list-checkbox" ${isSelected ? 'checked' : ''} data-id="${img.id}" data-index="${index}">
            <div class="image-list-thumbnail-wrapper">
              <div class="image-list-thumbnail-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>
            </div>
            <div class="image-list-text-content">
              <div class="image-list-item-header">
                <div class="image-list-title">${TagRenderer.escapeHtml(img.name || '无标题')}</div>
                <div class="image-list-tags">${tagsHtml}</div>
              </div>
            </div>
            <div class="image-list-actions">
              <button type="button" class="favorite-btn ${img.isFavorite ? 'active' : ''}" title="${img.isFavorite ? '取消收藏' : '收藏'}" data-id="${img.id}">
                ${favoriteIcon}
              </button>
              <button type="button" class="delete-btn" title="删除" data-id="${img.id}">
                ${this.app.ICONS.delete}
              </button>
            </div>
          </div>
        `;
      }

      // 完整列表视图
      return `
        <div class="image-list-item ${isCompactClass} ${img.isFavorite ? 'is-favorite' : ''} ${isSelected ? 'is-selected' : ''}" 
             data-id="${img.id}" 
             data-index="${index}"
             data-image-path="${imagePath.replace(/"/g, '&quot;')}">
          <input type="checkbox" class="image-list-checkbox" ${isSelected ? 'checked' : ''} data-id="${img.id}" data-index="${index}">
          <div class="image-list-thumbnail-wrapper">
            <div class="image-list-thumbnail-placeholder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </div>
          </div>
          <div class="image-list-text-content">
            <div class="image-list-item-header">
              <div class="image-list-title">${TagRenderer.escapeHtml(img.name || '无标题')}</div>
              <div class="image-list-tags">${tagsHtml}</div>
            </div>
            <div class="image-list-meta">
              <span>${img.width || '?'} x ${img.height || '?'}</span>
              <span>${this.formatFileSize(img.fileSize)}</span>
            </div>
          </div>
          <div class="image-list-actions">
            <button type="button" class="favorite-btn ${img.isFavorite ? 'active' : ''}" title="${img.isFavorite ? '取消收藏' : '收藏'}" data-id="${img.id}">
              ${favoriteIcon}
            </button>
            <button type="button" class="delete-btn" title="删除" data-id="${img.id}">
              ${this.app.ICONS.delete}
            </button>
          </div>
        </div>
      `;
    }).join('');

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
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的文件大小
   */
  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
          if (this.selectedImageIds.has(id)) {
            this.selectedImageIds.delete(id);
          } else {
            this.selectedImageIds.add(id);
            this.lastSelectedIndex = index;
          }
        } else if (e.shiftKey && this.lastSelectedIndex !== -1) {
          // Shift+点击：范围选择
          const start = Math.min(this.lastSelectedIndex, index);
          const end = Math.max(this.lastSelectedIndex, index);
          for (let i = start; i <= end; i++) {
            this.selectedImageIds.add(images[i].id);
          }
        } else {
          // 普通点击：单选并打开详情
          this.selectedImageIds.clear();
          this.selectedImageIds.add(id);
          this.lastSelectedIndex = index;
          const img = images.find(i => i.id === id);
          if (img) {
            this.app.openImageDetailModal(img);
          }
        }

        this.renderGrid();
      });
    });

    // 复选框事件
    listContainer.querySelectorAll('.image-list-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const index = parseInt(e.target.dataset.index);

        if (e.target.checked) {
          this.selectedImageIds.add(id);
          this.lastSelectedIndex = index;
        } else {
          this.selectedImageIds.delete(id);
        }

        this.renderGrid();
      });
    });

    // 收藏按钮事件
    listContainer.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        await this.toggleImageFavorite(id);
      });
    });

    // 删除按钮事件
    listContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        await this.deleteImage(id);
      });
    });
  }
}

export default ImagePanelManager;
