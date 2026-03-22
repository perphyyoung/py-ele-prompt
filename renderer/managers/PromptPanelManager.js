import { PanelManagerBase } from './PanelManagerBase.js';
import { PanelRenderer, PanelItemRenderer } from './SharedComponents/index.js';
import { TagUI } from './TagUI.js';
import { Constants } from '../constants.js';
import { DialogService, DialogConfig } from '../services/DialogService.js';
import { cacheManager } from '../utils/CacheManager.js';

/**
 * 提示词面板管理器
 * 负责提示词列表的渲染、筛选、排序、标签管理等功能
 */
export class PromptPanelManager extends PanelManagerBase {
  // 提示词特殊标签检查函数 Map
  static PROMPT_TAG_CHECKS = new Map([
    [Constants.FAVORITE_TAG, (p) => p.isFavorite],
    [Constants.SAFE_TAG, (p) => p.isSafe !== 0],
    [Constants.UNSAFE_TAG, (p) => p.isSafe === 0],
    [Constants.MULTI_IMAGE_TAG, (p) => p.images && p.images.length >= 2],
    [Constants.NO_IMAGE_TAG, (p) => !p.images || p.images.length === 0],
    [Constants.NO_TAG_TAG, (p) => !p.tags || p.tags.length === 0]
  ]);

  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 主应用引用
   * @param {Object} options.tagManager - 标签管理器
   * @param {Object} options.saveManager - 保存管理器
   * @param {Object} options.eventBus - 事件总线
   */
  constructor(options) {
    super({
      app: options.app,
      tagManager: options.tagManager,
      eventBus: options.eventBus,
      storagePrefix: 'prompt',
      defaultCardSize: 260
    });
    this.saveManager = options.saveManager;
    this.filteredPrompts = [];
  }

  /**
   * 获取提示词列表（从缓存读取）
   */
  get prompts() {
    return Array.from(this.app.promptCache.values());
  }

  /**
   * 获取项目列表（实现基类抽象方法）
   * @returns {Array}
   */
  getItems() {
    return this.prompts;
  }

  /**
   * 获取特殊标签检查函数 Map（实现基类抽象方法）
   * @returns {Map}
   */
  getSpecialTagChecks() {
    return PromptPanelManager.PROMPT_TAG_CHECKS;
  }

  /**
   * 获取项目类型标识（实现基类抽象方法）
   * @returns {string}
   */
  getItemType() {
    return 'prompt';
  }

  /**
   * 加载提示词数据（实现基类抽象方法）
   */
  async loadData() {
    try {
      const prompts = await window.electronAPI.getPrompts();
      cacheManager.cachePrompts(prompts);
      return prompts;
    } catch (error) {
      window.electronAPI.logError('PromptPanelManager.js', 'Failed to load prompts:', error);
      throw error;
    }
  }

  /**
   * 初始化
   */
  async init() {
    await this.loadData();
    await this.renderView();
    await this.renderTagFilters();
  }

  /**
   * 渲染容器（实现基类抽象方法）
   * @param {Array} filtered - 筛选后的提示词列表
   */
  async renderContainer(filtered) {
    this.filteredPrompts = filtered;

    const container = document.getElementById('promptGrid');
    const listContainer = document.getElementById('promptList');

    if (filtered.length === 0) {
      PanelRenderer.showEmptyState('promptGrid', 'promptEmptyState', '暂无提示词');
      if (listContainer) listContainer.style.display = 'none';
      return;
    }

    PanelRenderer.hideEmptyState('promptGrid', 'promptEmptyState');

    // 根据视图模式渲染
    if (this.viewModeType === 'grid') {
      container.style.display = 'grid';
      if (listContainer) listContainer.style.display = 'none';

      // 渲染网格视图
      PanelRenderer.renderGrid(filtered, (prompt) => this.createCard(prompt), 'promptGrid');
      this.bindCardEvents(filtered);
      this.loadCardBackgrounds();
      this.bindHoverPreview('.prompt-card');
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
   * 创建提示词卡片 HTML（实现基类抽象方法）
   * @param {Object} prompt - 提示词对象
   * @returns {string} HTML 字符串
   */
  createCard(prompt) {
    return PanelItemRenderer.createPromptGridItem(prompt, Constants.ICONS, this.sortBy, this.app);
  }

  /**
   * 绑定提示词卡片事件（实现基类抽象方法）
   * @param {Array} filtered - 筛选后的提示词列表
   */
  bindCardEvents(filtered) {
    const container = document.getElementById('promptGrid');
    if (!container) return;

    filtered.forEach(prompt => {
      const card = container.querySelector(`[data-id="${prompt.id}"]`);
      if (!card) return;

      // 点击卡片
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.action-btn')) {
          this.app.openEditPromptModal(prompt, { filteredList: filtered });
        }
      });

      // 复制按钮
      const copyBtn = card.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await window.electronAPI.copyToClipboard(prompt.content);
            this.app.showToast('已复制到剪贴板', 'success');
          } catch (error) {
            this.app.showToast('复制失败', 'error');
          }
        });
      }

      // 删除按钮
      const deleteBtn = card.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await DialogService.showConfirmDialogByConfig({
            ...DialogConfig.DELETE_PROMPT,
            data: { name: prompt.title || '未命名' }
          });
          if (confirmed) {
            await this.deleteItem(prompt.id);
          }
        });
      }

      // 收藏按钮
      const favoriteBtn = card.querySelector('.favorite-btn');
      if (favoriteBtn) {
        favoriteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.toggleFavorite(prompt.id, !prompt.isFavorite);
        });
      }
    });
  }

  /**
   * 异步加载卡片背景图（实现基类抽象方法）
   */
  async loadCardBackgrounds() {
    const container = document.getElementById('promptGrid');
    if (!container) return;

    const cards = container.querySelectorAll('.prompt-card');

    for (const card of cards) {
      const promptId = card.dataset.id;
      const prompt = this.prompts.find(p => String(p.id) === String(promptId));

      if (!prompt || !prompt.images || prompt.images.length === 0) continue;

      const firstImage = prompt.images[0];
      const imagePath = firstImage.thumbnailPath || firstImage.relativePath;

      if (!imagePath) continue;

      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        const bgElement = card.querySelector('.prompt-card-bg, .card__bg');
        if (bgElement) {
          bgElement.style.backgroundImage = `url('file://${fullPath.replace(/\\/g, '/')}')`;
        }
      } catch (error) {
        window.electronAPI.logError('PromptPanelManager.js', 'Failed to load card background:', error);
      }
    }
  }

  /**
   * 渲染提示词列表视图（实现基类抽象方法）
   * @param {Array} filtered - 筛选后的提示词列表
   */
  async renderListView(filtered) {
    const listContainer = document.getElementById('promptList');
    if (!listContainer) return;

    const allImages = await window.electronAPI.getImages();
    const isCompact = this.viewModeType === 'list-compact';

    // 准备提示词数据并生成列表项 HTML
    const listItemsHtml = await Promise.all(
      filtered.map(async (prompt, index) => {
        const hasImages = prompt.images && prompt.images.length > 0;
        const thumbnailHtml = await this.generatePromptThumbnailHtml(prompt, hasImages, allImages);

        return PanelItemRenderer.createPromptListItem({
          prompt,
          icons: Constants.ICONS,
          isCompact,
          isSelected: this.selectedIds.has(prompt.id),
          index,
          thumbnailHtml
        });
      })
    );

    listContainer.innerHTML = listItemsHtml.join('');

    // 绑定事件
    this.bindPromptListItemEvents(listContainer, filtered);
    this.bindHoverPreview('.prompt-list-item');
    this.bindCardDropEvents(listContainer);
    this.app.renderPromptBatchOperationToolbar();
  }

  /**
   * 生成提示词缩略图 HTML
   * @param {Object} prompt - 提示词对象
   * @param {boolean} hasImages - 是否有图像
   * @param {Array} allImages - 所有图像列表
   * @returns {string} 缩略图 HTML
   */
  async generatePromptThumbnailHtml(prompt, hasImages, allImages) {
    if (hasImages && prompt.images[0]) {
      const firstImageId = prompt.images[0].id || prompt.images[0];
      const img = this.app.findImageById(firstImageId, allImages);
      if (img) {
        const imagePath = img.thumbnailPath || img.relativePath;
        if (imagePath) {
          try {
            const fullPath = await window.electronAPI.getImagePath(imagePath);
            const escapedTitle = TagUI.escapeHtml(prompt.title || '预览');
            return `<img src="file://${fullPath.replace(/"/g, '&quot;')}" alt="${escapedTitle}" class="prompt-list-thumbnail">`;
          } catch (error) {
            window.electronAPI.logError('PromptPanelManager.js', 'Failed to get image path:', error);
          }
        }
      }
    }

    // 返回占位符
    return `
      <div class="prompt-list-thumbnail-placeholder">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      </div>
    `;
  }

  /**
   * 绑定提示词列表项事件
   * @param {HTMLElement} listContainer - 列表容器
   * @param {Array} filtered - 筛选后的提示词列表
   */
  bindPromptListItemEvents(listContainer, filtered) {
    listContainer.querySelectorAll('.prompt-list-item').forEach(item => {
      const promptId = item.dataset.id;
      const index = parseInt(item.dataset.index);
      const prompt = filtered.find(p => String(p.id) === String(promptId));
      if (!prompt) return;

      // 复选框
      const checkbox = item.querySelector('.prompt-list-checkbox');
      if (checkbox) {
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.selectedIds.has(promptId)) {
            this.selectedIds.delete(promptId);
          } else {
            this.selectedIds.add(promptId);
          }
          this.lastSelectedIndex = index;
          this.renderView();
          this.app.renderPromptBatchOperationToolbar();
        });
      }

      // 点击整行
      item.addEventListener('click', (e) => {
        if (e.target.closest('.prompt-list-checkbox') || e.target.closest('.prompt-list-actions')) {
          return;
        }

        // Ctrl/Shift 点击：多选
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          this.app.handlePromptItemSelection(promptId, index, e);
        } else {
          // 普通点击：打开编辑
          this.app.openEditPromptModal(prompt, { filteredList: filtered });
        }
      });

      // 复制按钮
      const copyBtn = item.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await window.electronAPI.copyToClipboard(prompt.content);
            this.app.showToast('已复制到剪贴板', 'success');
          } catch (error) {
            this.app.showToast('复制失败', 'error');
          }
        });
      }

      // 收藏按钮
      const favoriteBtn = item.querySelector('.favorite-btn');
      if (favoriteBtn) {
        favoriteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.toggleFavorite(prompt.id, !prompt.isFavorite);
        });
      }

      // 删除按钮
      const deleteBtn = item.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await DialogService.showConfirmDialogByConfig({
            ...DialogConfig.DELETE_PROMPT,
            data: { name: prompt.title || '未命名' }
          });
          if (confirmed) {
            await this.deleteItem(prompt.id);
          }
        });
      }
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
        const promptId = element.dataset.id || element.dataset.promptId;
        const prompt = this.prompts.find(p => String(p.id) === String(promptId));
        return prompt ? prompt.content : '';
      },
      getImageId: (element) => {
        const firstImage = element.dataset.firstImage;
        return firstImage || null;
      },
      delay: 500
    });
  }

  /**
   * 绑定卡片拖拽事件（实现基类抽象方法）
   * @param {HTMLElement} container - 容器元素
   */
  bindCardDropEvents(container) {
    // 避免重复绑定
    if (container.dataset.dropEventsBound === 'true') {
      return;
    }
    container.dataset.dropEventsBound = 'true';

    // 实现拖拽接收逻辑
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      const dragSource = e.dataTransfer.getData('drag-source');
      const tagName = e.dataTransfer.getData('text/plain');

      if (dragSource === 'prompt-tag' && tagName) {
        // 处理标签拖拽到卡片
        const card = e.target.closest('.prompt-card, .prompt-list-item');
        if (card) {
          const promptId = card.dataset.id || card.dataset.promptId;
          if (promptId) {
            try {
              await this.app.addTagToPrompt(promptId, tagName);
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
    return 'promptTagFilterList';
  }

  /**
   * 获取特殊标签容器 ID（实现基类抽象方法）
   * @returns {string}
   */
  getSpecialTagsContainerId() {
    return 'promptTagFilterSpecialTags';
  }

  /**
   * 获取筛选动作按钮 ID（实现基类抽象方法）
   * @returns {string}
   */
  getFilterActionBtnId() {
    return 'promptTagFilterActionBtn';
  }

  /**
   * 获取标签筛选头部容器 ID（实现基类抽象方法）
   * @returns {string}
   */
  getTagFilterHeaderContainerId() {
    return 'promptTagFilterHeaderTags';
  }

  /**
   * 获取标签拖拽类型（实现基类抽象方法）
   * @returns {string}
   */
  getTagDragType() {
    return 'prompt-tag';
  }

  /**
   * 获取所有标签（实现基类抽象方法）
   * @returns {Promise<Array>}
   */
  async getAllTags() {
    return window.electronAPI.getPromptTags();
  }

  /**
   * 获取带分组的标签（实现基类抽象方法）
   * @returns {Promise<Array>}
   */
  async getTagsWithGroup() {
    return window.electronAPI.getPromptTagsWithGroup();
  }

  /**
   * 获取标签组（实现基类抽象方法）
   * @returns {Promise<Array>}
   */
  async getTagGroups() {
    return window.electronAPI.getPromptTagGroups();
  }

  /**
   * 计算特殊标签计数（实现基类抽象方法）
   * @param {Array} visibleItems - 可见提示词列表
   * @returns {Array<{tag: string, count: number}>}
   */
  calculateSpecialTagCounts(visibleItems) {
    const specialTags = [];
    const favoriteCount = visibleItems.filter(p => p.isFavorite).length;
    const multiImageCount = visibleItems.filter(p => p.images && p.images.length >= 2).length;
    const noImageCount = visibleItems.filter(p => !p.images || p.images.length === 0).length;
    const noTagCount = visibleItems.filter(p => !p.tags || p.tags.length === 0).length;
    const violatingCount = visibleItems.filter(p => p.tags && p.tags.includes(Constants.VIOLATING_TAG)).length;

    if (favoriteCount > 0) {
      specialTags.push({ tag: Constants.FAVORITE_TAG, count: favoriteCount });
    }
    if (multiImageCount > 0) {
      specialTags.push({ tag: Constants.MULTI_IMAGE_TAG, count: multiImageCount });
    }
    if (noImageCount > 0) {
      specialTags.push({ tag: Constants.NO_IMAGE_TAG, count: noImageCount });
    }
    if (noTagCount > 0) {
      specialTags.push({ tag: Constants.NO_TAG_TAG, count: noTagCount });
    }
    if (violatingCount > 0) {
      specialTags.push({ tag: Constants.VIOLATING_TAG, count: violatingCount });
    }

    // NSFW 模式下显示安全评级标签
    if (this.viewMode === 'nsfw') {
      const safeCount = visibleItems.filter(p => p.isSafe !== 0).length;
      const unsafeCount = visibleItems.filter(p => p.isSafe === 0).length;
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
   * 删除提示词（实现基类抽象方法）
   * @param {string} id - 提示词 ID
   */
  async deleteItem(id) {
    try {
      await window.electronAPI.softDeletePrompt(id);
      await this.loadData();
      await this.renderView();
      this.app.emit('promptsChanged', { prompts: this.prompts });

      // 刷新回收站
      if (this.app.trashManager) {
        await this.app.trashManager.loadTrash();
      }

      // 刷新统计界面
      if (this.app.currentPanel === 'statistics') {
        await this.app.renderStatistics();
      }

      this.app.showToast('提示词已删除', 'success');
    } catch (error) {
      window.electronAPI.logError('PromptPanelManager.js', 'Failed to delete prompt:', error);
      this.app.showToast('删除失败：' + error.message, 'error');
    }
  }

  /**
   * 切换收藏状态（实现基类抽象方法）
   * @param {string} id - 提示词 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleFavorite(id, isFavorite) {
    try {
      await window.electronAPI.updatePrompt(id, { isFavorite });

      // 更新本地数据
      const prompt = this.prompts.find(p => String(p.id) === String(id));
      if (prompt) {
        prompt.isFavorite = isFavorite;
      }

      this.app.showToast(isFavorite ? '已收藏' : '已取消收藏', 'success');
      this.updateFavoriteUI(id, isFavorite);
      this.renderTagFilters();
    } catch (error) {
      window.electronAPI.logError('PromptPanelManager.js', 'toggleFavorite error:', error);
      this.app.showToast('操作失败：' + error.message, 'error');
    }
  }

  /**
   * 更新收藏按钮 UI（实现基类抽象方法）
   * @param {string} id - 提示词 ID
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

    // 更新卡片视图
    const card = document.querySelector(`.prompt-card[data-id="${id}"]`);
    if (card) {
      const btn = card.querySelector('.favorite-btn');
      updateBtn(btn);
      card.classList.toggle('is-favorite', isFavorite);
    }

    // 更新列表视图
    const listItem = document.querySelector(`.prompt-list-item[data-id="${id}"]`);
    if (listItem) {
      const btn = listItem.querySelector('.favorite-btn');
      updateBtn(btn);
      listItem.classList.toggle('is-favorite', isFavorite);
    }
  }

  /**
   * 排序提示词列表（实现基类抽象方法）
   * @param {Array} items - 提示词列表
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
        case 'title':
          valueA = (a.title || '').toLowerCase();
          valueB = (b.title || '').toLowerCase();
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
      if (data.targetType === 'prompt') {
        this.handlePromptRatingChange(data);
      }
    });
    this.eventBus.on('promptsChanged', () => {
      this.refreshAfterUpdate();
    });
  }

  /**
   * 处理安全评级变更
   * @param {Object} data - 事件数据
   */
  handlePromptRatingChange(data) {
    const prompt = this.prompts.find(p => String(p.id) === String(data.targetId));
    if (prompt) {
      prompt.isSafe = data.isSafe ? 1 : 0;
      this.renderView();
    }
  }

  /**
   * 设置卡片大小（重写基类方法）
   * @param {number} size - 卡片宽度/高度（像素），保持1:1方形
   */
  setCardSize(size) {
    super.setCardSize(size);
    const promptGrid = document.getElementById('promptGrid');
    if (promptGrid) {
      // 使用固定列宽，每列大小等于滑杆值
      promptGrid.style.gridTemplateColumns = `repeat(auto-fill, ${size}px)`;
      // 设置行高等于列宽，保持1:1方形
      promptGrid.style.gridAutoRows = `${size}px`;
    }
  }

}

export default PromptPanelManager;
