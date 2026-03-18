import { TagRenderer } from './SharedComponents/TagRenderer.js';
import { ListRenderer } from './SharedComponents/ListRenderer.js';
import { Constants } from '../constants.js';

/**
 * 提示词面板管理器
 * 负责提示词列表的渲染、筛选、排序、标签管理等功能
 */
export class PromptPanelManager {
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
    this.app = options.app;
    this.tagManager = options.tagManager;
    this.saveManager = options.saveManager;
    this.eventBus = options.eventBus;
    
    this.filteredPrompts = [];
    this.selectedTags = new Set();
    this.viewMode = options.app.viewMode || 'safe';
    // 从 localStorage 加载视图模式和排序设置
    this.viewModeType = localStorage.getItem('promptViewMode') || 'grid';
    this.sortBy = localStorage.getItem('promptSortBy') || 'updatedAt';
    this.sortOrder = localStorage.getItem('promptSortOrder') || 'desc';
    // 卡片大小设置
    this.cardSize = parseInt(localStorage.getItem('promptCardSize')) || 260;
    // 标签筛选排序设置
    this.tagFilterSortBy = localStorage.getItem('promptTagFilterSortBy') || 'count';
    this.tagFilterSortOrder = localStorage.getItem('promptTagFilterSortOrder') || 'desc';
    this.selectedPromptIds = new Set();
    this.lastSelectedIndex = -1;

    // 绑定事件
    this.subscribeToEvents();
  }

  /**
   * 获取提示词列表（从 app 读取）
   */
  get prompts() {
    return this.app.prompts || [];
  }

  /**
   * 初始化
   */
  async init() {
    await this.loadPrompts();
    await this.renderList();
    await this.renderTagFilters();
  }

  /**
   * 加载提示词列表（加载到 app）
   */
  async loadPrompts() {
    try {
      this.app.prompts = await window.electronAPI.getPrompts();
      return this.app.prompts;
    } catch (error) {
      console.error('Failed to load prompts:', error);
      throw error;
    }
  }

  /**
   * 渲染提示词列表
   */
  async renderList() {
    try {
      // 过滤提示词
      let filtered = this.prompts;

      // 过滤已删除的提示词
      filtered = filtered.filter(prompt => !prompt.isDeleted);

      // 根据 viewMode 过滤（safe 模式只显示安全内容）
      if (this.viewMode === 'safe') {
        filtered = filtered.filter(prompt => prompt.isSafe !== 0);
      }

      // 标签筛选（多选时同时符合）
      if (this.selectedTags.size > 0) {
        filtered = filtered.filter(prompt => {
          return Array.from(this.selectedTags).every(tag => {
            const checkFn = PromptPanelManager.PROMPT_TAG_CHECKS.get(tag);
            if (checkFn) {
              return checkFn(prompt);
            }
            // 普通标签
            return prompt.tags && prompt.tags.includes(tag);
          });
        });
      }

      // 排序
      filtered = this.sortPrompts(filtered, this.sortBy, this.sortOrder);

      // 保存筛选后的列表
      this.filteredPrompts = filtered;

      const container = document.getElementById('promptList');
      const listContainer = document.getElementById('promptListView');
      const emptyState = document.getElementById('emptyState');

      if (filtered.length === 0) {
        ListRenderer.showEmptyState('promptList', 'emptyState', '暂无提示词');
        if (listContainer) listContainer.style.display = 'none';
        return;
      }

      ListRenderer.hideEmptyState('promptList', 'emptyState');

      // 根据视图模式渲染
      if (this.viewModeType === 'grid') {
        container.style.display = 'grid';
        if (listContainer) listContainer.style.display = 'none';
        
        // 渲染网格视图
        ListRenderer.renderGrid(filtered, (prompt) => this.createPromptCard(prompt), 'promptList');
        this.bindPromptCardEvents(filtered);
        this.loadCardBackgrounds();
        this.bindPromptHoverPreview('.prompt-card');
        this.bindPromptCardDropEvents(container);
      } else {
        // 列表视图
        container.style.display = 'none';
        if (listContainer) {
          listContainer.style.display = 'flex';
          await this.renderPromptListView(filtered);
        }
      }
    } catch (error) {
      console.error('Failed to render prompt list:', error);
      this.app.showToast('加载提示词失败', 'error');
    }
  }

  /**
   * 创建提示词卡片 HTML
   * @param {Object} prompt - 提示词对象
   * @returns {string} HTML 字符串
   */
  createPromptCard(prompt) {
    const favoriteIcon = prompt.isFavorite ? this.app.ICONS.favorite.filled : this.app.ICONS.favorite.outline;
    const tagsHtml = TagRenderer.generateTagsHtml(prompt.tags, 'tag-display', 'tag-display-empty');
    
    // 检查是否有图像
    const hasImages = prompt.images && prompt.images.length > 0;
    const firstImageId = hasImages ? prompt.images[0].id : '';
    
    // 根据排序规则确定底部显示内容
    let dynamicInfo = '';
    if (this.sortBy === 'updatedAt' && prompt.updatedAt) {
      const date = new Date(prompt.updatedAt);
      dynamicInfo = `<div class="prompt-card-dynamic-info">更新于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else if (this.sortBy === 'createdAt' && prompt.createdAt) {
      const date = new Date(prompt.createdAt);
      dynamicInfo = `<div class="prompt-card-dynamic-info">创建于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else if (this.sortBy === 'title') {
      dynamicInfo = `<div class="prompt-card-title">${TagRenderer.escapeHtml(prompt.title || '无标题')}</div>`;
    } else {
      dynamicInfo = `<div class="prompt-card-title">${TagRenderer.escapeHtml(prompt.title || '无标题')}</div>`;
    }

    return `
      <div class="prompt-card ${prompt.isFavorite ? 'is-favorite' : ''} ${hasImages ? 'has-images' : 'no-images'}" 
           data-id="${prompt.id}" 
           data-first-image="${firstImageId}"
           data-drop-target="prompt">
        <div class="prompt-card-bg card__bg"></div>
        <div class="prompt-card-overlay card__overlay">
          <div class="prompt-card-header card__header">
            <div class="prompt-card-actions-left">
              <button type="button" class="favorite-btn ${prompt.isFavorite ? 'active' : ''}" data-id="${prompt.id}" title="${prompt.isFavorite ? '取消收藏' : '收藏'}">
                ${favoriteIcon}
              </button>
            </div>
            <div class="prompt-card-actions-right">
              <button type="button" class="copy-btn" data-id="${prompt.id}" title="复制内容">
                ${this.app.ICONS.copy}
              </button>
              <button type="button" class="delete-btn" data-id="${prompt.id}" title="删除">
                ${this.app.ICONS.delete}
              </button>
            </div>
          </div>
          <div class="prompt-card-content">${TagRenderer.escapeHtml(prompt.content)}</div>
          <div class="prompt-card-footer card__footer">
            <div class="prompt-card-tags">${tagsHtml}</div>
            ${dynamicInfo}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定提示词卡片事件
   * @param {Array} filtered - 筛选后的提示词列表
   */
  bindPromptCardEvents(filtered) {
    const container = document.getElementById('promptList');
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
          const confirmed = await this.app.showConfirmDialog('确认删除', '确定要删除这个提示词吗？已删除的提示词会进入回收站，可以从回收站恢复。');
          if (confirmed) {
            await this.deletePrompt(prompt.id);
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
   * 异步加载卡片背景图
   */
  async loadCardBackgrounds() {
    const container = document.getElementById('promptList');
    if (!container) return;

    const cards = container.querySelectorAll('.prompt-card');
    
    for (const card of cards) {
      const promptId = card.dataset.id;
      const prompt = this.prompts.find(p => String(p.id) === String(promptId));
      
      if (!prompt) {
        continue;
      }
      
      if (!prompt.images || prompt.images.length === 0) {
        continue;
      }

      const firstImage = prompt.images[0];
      
      const imagePath = firstImage.thumbnailPath || firstImage.relativePath;
      if (!imagePath) {
        continue;
      }

      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        
        const bgElement = card.querySelector('.prompt-card-bg, .card__bg');
        if (bgElement) {
          bgElement.style.backgroundImage = `url('file://${fullPath.replace(/\\/g, '/')}')`;
        }
      } catch (error) {
        console.error('Failed to load card background:', error);
      }
    }
  }

  /**
   * 渲染提示词列表视图
   * @param {Array} filtered - 筛选后的提示词列表
   */
  async renderPromptListView(filtered) {
    const listContainer = document.getElementById('promptListView');
    if (!listContainer) return;

    const allImages = await window.electronAPI.getImages();
    const isCompact = this.viewModeType === 'list-compact';

    // 准备提示词数据
    const promptData = await Promise.all(
      filtered.map(async (prompt) => {
        const tagsHtml = TagRenderer.generateTagsHtml(prompt.tags, 'tag-display', 'tag-display-empty');
        const hasImages = prompt.images && prompt.images.length > 0;

        // 获取首图
        let thumbnailHtml = '';
        let firstImageId = '';
        if (hasImages && prompt.images[0]) {
          firstImageId = prompt.images[0].id || prompt.images[0];
          const img = this.app.findImageById(firstImageId, allImages);
          if (img) {
            const imagePath = img.thumbnailPath || img.relativePath;
            if (imagePath) {
              try {
                const fullPath = await window.electronAPI.getImagePath(imagePath);
                const escapedTitle = TagRenderer.escapeHtml(prompt.title || '预览');
                thumbnailHtml = `<img src="file://${fullPath.replace(/"/g, '&quot;')}" alt="${escapedTitle}" class="prompt-list-thumbnail">`;
              } catch (error) {
                console.error('Failed to get image path:', error);
              }
            }
          }
        }

        // 占位符
        if (!thumbnailHtml) {
          thumbnailHtml = `
            <div class="prompt-list-thumbnail-placeholder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </div>
          `;
        }

        return {
          prompt,
          tagsHtml,
          thumbnailHtml,
          firstImageId,
          hasImages
        };
      })
    );

    // 生成列表项 HTML
    listContainer.innerHTML = promptData.map(({ prompt, tagsHtml, thumbnailHtml, firstImageId, hasImages }, index) => {
      const hasImagesClass = hasImages ? 'has-images' : '';
      const isSelected = this.selectedPromptIds.has(prompt.id);
      const isCompactClass = isCompact ? 'is-compact' : '';
      const noteHtml = !isCompact ? TagRenderer.generateNoteHtml(prompt.note, 'prompt-list-note') : '';
      const favoriteIcon = prompt.isFavorite ? this.app.ICONS.favorite.filled : this.app.ICONS.favorite.outline;

      if (isCompact) {
        return `
          <div class="prompt-list-item ${isCompactClass} ${prompt.isFavorite ? 'is-favorite' : ''} ${isSelected ? 'is-selected' : ''} ${hasImagesClass}" 
               data-id="${prompt.id}" 
               data-first-image="${firstImageId}" 
               data-index="${index}"
               data-drop-target="prompt">
            <input type="checkbox" class="prompt-list-checkbox" ${isSelected ? 'checked' : ''} data-id="${prompt.id}" data-index="${index}">
            ${thumbnailHtml}
            <div class="prompt-list-text-content">
              <div class="prompt-list-item-header">
                <div class="prompt-list-title">${TagRenderer.escapeHtml(prompt.title || '无标题')}</div>
                <div class="prompt-list-tags">${tagsHtml}</div>
              </div>
            </div>
            <div class="prompt-list-actions">
              <button type="button" class="favorite-btn ${prompt.isFavorite ? 'active' : ''}" title="${prompt.isFavorite ? '取消收藏' : '收藏'}" data-id="${prompt.id}">
                ${favoriteIcon}
              </button>
              <button type="button" class="delete-btn" title="删除" data-id="${prompt.id}">
                ${this.app.ICONS.delete}
              </button>
            </div>
          </div>
        `;
      }

      // 完整列表视图
      return `
        <div class="prompt-list-item ${isCompactClass} ${prompt.isFavorite ? 'is-favorite' : ''} ${isSelected ? 'is-selected' : ''} ${hasImagesClass}" 
             data-id="${prompt.id}" 
             data-first-image="${firstImageId}" 
             data-index="${index}"
             data-drop-target="prompt">
          <input type="checkbox" class="prompt-list-checkbox" ${isSelected ? 'checked' : ''} data-id="${prompt.id}" data-index="${index}">
          ${thumbnailHtml}
          <div class="prompt-list-text-content">
            <div class="prompt-list-item-header">
              <div class="prompt-list-title">${TagRenderer.escapeHtml(prompt.title || '无标题')}</div>
              <div class="prompt-list-tags">${tagsHtml}</div>
            </div>
            <div class="prompt-list-content">${TagRenderer.escapeHtml(prompt.content)}</div>
            ${noteHtml}
          </div>
          <div class="prompt-list-actions">
            <button type="button" class="copy-btn" title="复制内容" data-id="${prompt.id}">
              ${this.app.ICONS.copy}
            </button>
            <button type="button" class="favorite-btn ${prompt.isFavorite ? 'active' : ''}" title="${prompt.isFavorite ? '取消收藏' : '收藏'}" data-id="${prompt.id}">
              ${favoriteIcon}
            </button>
            <button type="button" class="delete-btn" title="删除" data-id="${prompt.id}">
              ${this.app.ICONS.delete}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // 绑定事件
    this.bindPromptListItemEvents(listContainer, filtered);
    this.bindPromptHoverPreview('.prompt-list-item');
    this.bindPromptCardDropEvents(listContainer);
    this.app.renderPromptBatchOperationToolbar();
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
          if (this.selectedPromptIds.has(promptId)) {
            this.selectedPromptIds.delete(promptId);
          } else {
            this.selectedPromptIds.add(promptId);
          }
          this.lastSelectedIndex = index;
          this.renderList();
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
          const confirmed = await this.app.showConfirmDialog('确认删除', '确定要删除这个提示词吗？');
          if (confirmed) {
            await this.deletePrompt(prompt.id);
          }
        });
      }
    });
  }

  /**
   * 渲染标签筛选器
   */
  async renderTagFilters() {
    try {
      const container = document.getElementById('tagFilterList');
      const specialTagsContainer = document.getElementById('tagFilterSpecialTags');
      const clearBtn = document.getElementById('clearTagFilter');

      // 获取所有标签
      const tags = await window.electronAPI.getPromptTags();
      const tagsWithGroup = await window.electronAPI.getPromptTagsWithGroup();
      const groups = await window.electronAPI.getPromptTagGroups();

      // 计算标签计数（只计算未删除的提示词）
      const tagCounts = {};
      let visiblePrompts = this.prompts.filter(p => !p.isDeleted);
      
      // 根据 viewMode 过滤
      if (this.viewMode === 'safe') {
        visiblePrompts = visiblePrompts.filter(p => p.isSafe !== 0);
      }

      visiblePrompts.forEach(prompt => {
        if (prompt.tags && prompt.tags.length > 0) {
          prompt.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      // 特殊标签
      const specialTags = [];
      const favoriteCount = visiblePrompts.filter(p => p.isFavorite).length;
      const multiImageCount = visiblePrompts.filter(p => p.images && p.images.length >= 2).length;
      const noImageCount = visiblePrompts.filter(p => !p.images || p.images.length === 0).length;
      const noTagCount = visiblePrompts.filter(p => !p.tags || p.tags.length === 0).length;
      const violatingCount = visiblePrompts.filter(p => p.tags && p.tags.includes(Constants.VIOLATING_TAG)).length;

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

      // NSFW 模式下显示安全评级标签（始终显示全部数据的计数）
      if (this.viewMode === 'nsfw') {
        const safeCount = this.prompts.filter(p => p.isSafe !== 0).length;
        const unsafeCount = this.prompts.filter(p => p.isSafe === 0).length;
        if (safeCount > 0) {
          specialTags.push({ tag: Constants.SAFE_TAG, count: safeCount });
        }
        if (unsafeCount > 0) {
          specialTags.push({ tag: Constants.UNSAFE_TAG, count: unsafeCount });
        }
      }

      // 渲染特殊标签
      if (specialTagsContainer) {
        const selectedSet = new Set(this.selectedTags);
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

      // 对标签进行排序
      const sortedTagsWithGroup = this.sortTagsForFilter(tagsWithGroup, tagCounts);

      // 渲染普通标签
      const html = TagRenderer.renderTagFilters(sortedTagsWithGroup, tagCounts, {
        specialTags: [],
        selectedTags: this.selectedTags,
        groups: groups,
        isImage: false
      });

      if (container) {
        container.innerHTML = html || '<span class="tag-filter-empty">暂无标签</span>';
      }

      // 更新清除按钮显示状态
      if (clearBtn) {
        clearBtn.style.display = this.selectedTags.size > 0 ? '' : 'none';
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
    const container = document.getElementById('tagFilterList');
    const specialTagsContainer = document.getElementById('tagFilterSpecialTags');
    if (!container && !specialTagsContainer) return;

    // 清除按钮点击
    const clearBtn = document.getElementById('clearTagFilter');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearTagFilter();
      });
    }

    // 特殊标签点击
    if (specialTagsContainer) {
      specialTagsContainer.querySelectorAll('.tag-filter-item[data-is-special="true"]').forEach(item => {
        item.addEventListener('click', (e) => {
          const tag = item.dataset.tag;
          if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + 点击：多选模式
            if (this.selectedTags.has(tag)) {
              this.selectedTags.delete(tag);
            } else {
              this.selectedTags.add(tag);
            }
          } else {
            // 普通点击：纯单选模式
            if (this.selectedTags.has(tag)) {
              // 如果已选中，则取消选择
              this.selectedTags.delete(tag);
            } else {
              // 未选中：清除所有选择，只选中当前
              this.selectedTags.clear();
              this.selectedTags.add(tag);
            }
          }
          this.renderList();
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
          const groups = await window.electronAPI.getPromptTagGroups();
          const group = groups.find(g => String(g.id) === String(groupId));
          const isSingleSelectGroup = group && group.type === 'single';

          if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + 点击：多选模式（单选组仍限制单选）
            if (this.selectedTags.has(tag)) {
              this.selectedTags.delete(tag);
            } else {
              if (isSingleSelectGroup) {
                // 单选组：清除同组其他标签
                const groupTags = group.tags;
                groupTags.forEach(t => this.selectedTags.delete(t));
              }
              this.selectedTags.add(tag);
            }
          } else {
            // 普通点击：纯单选模式
            if (this.selectedTags.has(tag)) {
              // 如果已选中，则取消选择
              this.selectedTags.delete(tag);
            } else {
              // 未选中：清除所有选择，只选中当前
              this.selectedTags.clear();
              this.selectedTags.add(tag);
            }
          }

          this.renderList();
          this.renderTagFilters();
        });
      });
    }
  }

  /**
   * 删除提示词
   * @param {string} id - 提示词 ID
   */
  async deletePrompt(id) {
    try {
      await window.electronAPI.deletePrompt(id);
      await this.loadPrompts();
      await this.renderList();
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
      console.error('Failed to delete prompt:', error);
      this.app.showToast('删除失败：' + error.message, 'error');
    }
  }

  /**
   * 切换收藏状态
   * @param {string} id - 提示词 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleFavorite(id, isFavorite) {
    try {
      await window.electronAPI.toggleFavoritePrompt(id, isFavorite);
      
      // 更新本地数据
      const prompt = this.prompts.find(p => String(p.id) === String(id));
      if (prompt) {
        prompt.isFavorite = isFavorite;
      }

      this.app.showToast(isFavorite ? '已收藏' : '已取消收藏', 'success');
      this.updatePromptFavoriteUI(id, isFavorite);
      this.renderTagFilters();
    } catch (error) {
      console.error('toggleFavorite error:', error);
      this.app.showToast('操作失败：' + error.message, 'error');
    }
  }

  /**
   * 更新收藏按钮 UI
   * @param {string} id - 提示词 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  updatePromptFavoriteUI(id, isFavorite) {
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
   * 绑定 hover 预览事件
   * @param {string} selector - CSS 选择器
   */
  bindPromptHoverPreview(selector) {
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
   * 绑定卡片拖拽事件
   * @param {HTMLElement} container - 容器元素
   */
  bindPromptCardDropEvents(container) {
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
   * 订阅事件
   */
  subscribeToEvents() {
    this.eventBus.on('safeRatingChanged', (data) => {
      if (data.targetType === 'prompt') {
        this.handlePromptRatingChange(data);
      }
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
      this.renderList();
    }
  }

  /**
   * 清除标签筛选
   */
  clearTagFilter() {
    this.selectedTags.clear();
    this.renderList();
    this.renderTagFilters();
  }

  /**
   * 设置视图模式
   * @param {string} mode - 视图模式 (grid, list, list-compact)
   */
  setViewMode(mode) {
    this.viewModeType = mode;
    localStorage.setItem('promptViewMode', mode);
    this.renderList();
  }

  /**
   * 设置排序方式
   * @param {string} sortBy - 排序字段
   * @param {string} sortOrder - 排序顺序 (asc, desc)
   */
  /**
   * 排序提示词列表
   * @param {Array} prompts - 提示词列表
   * @param {string} sortBy - 排序字段 (updatedAt, createdAt, title)
   * @param {string} sortOrder - 排序顺序 (asc, desc)
   * @returns {Array} 排序后的列表
   */
  sortPrompts(prompts, sortBy, sortOrder) {
    const sorted = [...prompts];
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

  setSort(sortBy, sortOrder) {
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
    this.renderList();
  }

  /**
   * 设置卡片大小
   * @param {number} size - 卡片宽度/高度（像素），保持1:1方形
   */
  setCardSize(size) {
    this.cardSize = size;
    const promptList = document.getElementById('promptList');
    if (promptList) {
      // 使用固定列宽，每列大小等于滑杆值
      promptList.style.gridTemplateColumns = `repeat(auto-fill, ${size}px)`;
      // 设置行高等于列宽，保持1:1方形
      promptList.style.gridAutoRows = `${size}px`;
    }
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
}

export default PromptPanelManager;
