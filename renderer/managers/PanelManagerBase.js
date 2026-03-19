import { TagUI } from './TagUI.js';
import { LRUCache } from '../utils/LRUCache.js';

/**
 * 面板管理器基类
 * 封装提示词面板和图像面板的通用逻辑
 * 使用模板方法模式，子类实现特定差异
 */
export class PanelManagerBase {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 主应用引用
   * @param {Object} options.tagManager - 标签管理器
   * @param {Object} options.eventBus - 事件总线
   * @param {string} options.storagePrefix - localStorage 键前缀
   * @param {number} options.defaultCardSize - 默认卡片大小
   */
  constructor(options) {
    this.app = options.app;
    this.tagManager = options.tagManager;
    this.eventBus = options.eventBus;
    this.storagePrefix = options.storagePrefix;
    this.defaultCardSize = options.defaultCardSize || 200;

    // 通用状态
    this.filteredItems = [];
    this.selectedTags = new Set();
    this.viewMode = options.app.viewMode || 'safe';

    // 从 localStorage 加载视图模式和排序设置
    this.viewModeType = localStorage.getItem(`${this.storagePrefix}ViewMode`) || 'grid';
    this.sortBy = localStorage.getItem(`${this.storagePrefix}SortBy`) || 'updatedAt';
    this.sortOrder = localStorage.getItem(`${this.storagePrefix}SortOrder`) || 'desc';

    // 卡片大小设置
    this.cardSize = parseInt(localStorage.getItem(`${this.storagePrefix}CardSize`)) || this.defaultCardSize;

    // 标签筛选排序设置
    this.tagFilterSortBy = localStorage.getItem(`${this.storagePrefix}TagFilterSortBy`) || 'count';
    this.tagFilterSortOrder = localStorage.getItem(`${this.storagePrefix}TagFilterSortOrder`) || 'desc';

    // 选中状态
    this.selectedIds = new Set();
    this.lastSelectedIndex = -1;

    // 初始化 LRU 缓存，用于缓存标签组数据
    this.tagsWithGroupCache = new LRUCache(10);

    // 绑定事件
    this.subscribeToEvents();
  }

  /**
   * 获取项目列表（子类实现）
   * @abstract
   * @returns {Array}
   */
  getItems() {
    throw new Error('getItems() must be implemented by subclass');
  }

  /**
   * 获取特殊标签检查函数 Map（子类实现）
   * @abstract
   * @returns {Map}
   */
  getSpecialTagChecks() {
    throw new Error('getSpecialTagChecks() must be implemented by subclass');
  }

  /**
   * 获取项目类型标识（子类实现）
   * @abstract
   * @returns {string}
   */
  getItemType() {
    throw new Error('getItemType() must be implemented by subclass');
  }

  /**
   * 加载项目列表（子类实现）
   * @abstract
   * @returns {Promise<Array>}
   */
  async loadItems() {
    throw new Error('loadItems() must be implemented by subclass');
  }

  /**
   * 创建卡片 HTML（子类实现）
   * @abstract
   * @param {Object} item - 项目对象
   * @returns {string}
   */
  createCard(item) {
    throw new Error('createCard() must be implemented by subclass');
  }

  /**
   * 绑定卡片事件（子类实现）
   * @abstract
   * @param {Array} filtered - 筛选后的项目列表
   */
  bindCardEvents(filtered) {
    throw new Error('bindCardEvents() must be implemented by subclass');
  }

  /**
   * 加载卡片背景（子类实现）
   * @abstract
   */
  async loadCardBackgrounds() {
    throw new Error('loadCardBackgrounds() must be implemented by subclass');
  }

  /**
   * 绑定悬停预览（子类实现）
   * @abstract
   * @param {string} selector - CSS 选择器
   */
  bindHoverPreview(selector) {
    throw new Error('bindHoverPreview() must be implemented by subclass');
  }

  /**
   * 绑定卡片拖拽事件（子类实现）
   * @abstract
   * @param {HTMLElement} container - 容器元素
   */
  bindCardDropEvents(container) {
    throw new Error('bindCardDropEvents() must be implemented by subclass');
  }

  /**
   * 渲染列表视图（子类实现）
   * @abstract
   * @param {Array} filtered - 筛选后的项目列表
   */
  async renderListView(filtered) {
    throw new Error('renderListView() must be implemented by subclass');
  }

  /**
   * 获取标签筛选容器 ID（子类实现）
   * @abstract
   * @returns {string}
   */
  getTagFilterContainerId() {
    throw new Error('getTagFilterContainerId() must be implemented by subclass');
  }

  /**
   * 获取特殊标签容器 ID（子类实现）
   * @abstract
   * @returns {string}
   */
  getSpecialTagsContainerId() {
    throw new Error('getSpecialTagsContainerId() must be implemented by subclass');
  }

  /**
   * 获取清除筛选按钮 ID（子类实现）
   * @abstract
   * @returns {string}
   */
  getClearFilterBtnId() {
    throw new Error('getClearFilterBtnId() must be implemented by subclass');
  }

  /**
   * 获取标签筛选头部容器 ID（子类实现）
   * @abstract
   * @returns {string}
   */
  getTagFilterHeaderContainerId() {
    throw new Error('getTagFilterHeaderContainerId() must be implemented by subclass');
  }

  /**
   * 获取标签拖拽类型（子类实现）
   * @abstract
   * @returns {string}
   */
  getTagDragType() {
    throw new Error('getTagDragType() must be implemented by subclass');
  }

  /**
   * 获取所有标签（子类实现）
   * @abstract
   * @returns {Promise<Array>}
   */
  async getAllTags() {
    throw new Error('getAllTags() must be implemented by subclass');
  }

  /**
   * 获取带分组的标签（子类实现）
   * @abstract
   * @returns {Promise<Array>}
   */
  async getTagsWithGroup() {
    throw new Error('getTagsWithGroup() must be implemented by subclass');
  }

  /**
   * 获取标签组（子类实现）
   * @abstract
   * @returns {Promise<Array>}
   */
  async getTagGroups() {
    throw new Error('getTagGroups() must be implemented by subclass');
  }

  /**
   * 计算特殊标签计数（子类实现）
   * @abstract
   * @param {Array} visibleItems - 可见项目列表
   * @returns {Array<{tag: string, count: number}>}
   */
  calculateSpecialTagCounts(visibleItems) {
    throw new Error('calculateSpecialTagCounts() must be implemented by subclass');
  }

  /**
   * 删除项目（子类实现）
   * @abstract
   * @param {string} id - 项目 ID
   */
  async deleteItem(id) {
    throw new Error('deleteItem() must be implemented by subclass');
  }

  /**
   * 切换收藏状态（子类实现）
   * @abstract
   * @param {string} id - 项目 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleFavorite(id, isFavorite) {
    throw new Error('toggleFavorite() must be implemented by subclass');
  }

  /**
   * 更新收藏 UI（子类实现）
   * @abstract
   * @param {string} id - 项目 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  updateFavoriteUI(id, isFavorite) {
    throw new Error('updateFavoriteUI() must be implemented by subclass');
  }

  /**
   * 排序项目列表（子类实现）
   * @abstract
   * @param {Array} items - 项目列表
   * @param {string} sortBy - 排序字段
   * @param {string} sortOrder - 排序顺序
   * @returns {Array}
   */
  sortItems(items, sortBy, sortOrder) {
    throw new Error('sortItems() must be implemented by subclass');
  }

  /**
   * 订阅事件（子类可选实现）
   */
  subscribeToEvents() {
    // 子类可选实现
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
   * 渲染主列表（模板方法）
   */
  async render() {
    try {
      const items = this.getItems();

      // 过滤项目
      let filtered = items;

      // 过滤已删除的项目
      filtered = filtered.filter(item => !item.isDeleted);

      // 根据 viewMode 过滤
      if (this.viewMode === 'safe') {
        filtered = filtered.filter(item => item.isSafe !== 0);
      }

      // 标签筛选（多选时同时符合）
      if (this.selectedTags.size > 0) {
        const specialTagChecks = this.getSpecialTagChecks();
        filtered = filtered.filter(item => {
          return Array.from(this.selectedTags).every(tag => {
            const checkFn = specialTagChecks.get(tag);
            if (checkFn) {
              return checkFn(item);
            }
            // 普通标签
            return item.tags && item.tags.includes(tag);
          });
        });
      }

      // 排序
      filtered = this.sortItems(filtered, this.sortBy, this.sortOrder);

      // 保存筛选后的列表
      this.filteredItems = filtered;

      // 子类实现具体的渲染逻辑
      await this.renderContainer(filtered);
    } catch (error) {
      console.error(`Failed to render ${this.getItemType()} list:`, error);
      this.app.showToast(`加载${this.getItemType()}失败`, 'error');
    }
  }

  /**
   * 渲染容器（子类实现具体的容器渲染）
   * @abstract
   * @param {Array} filtered - 筛选后的项目列表
   */
  async renderContainer(filtered) {
    throw new Error('renderContainer() must be implemented by subclass');
  }

  /**
   * 渲染标签筛选器（模板方法）
   */
  async renderTagFilters() {
    try {
      const container = document.getElementById(this.getTagFilterContainerId());
      const specialTagsContainer = document.getElementById(this.getSpecialTagsContainerId());
      const clearBtn = document.getElementById(this.getClearFilterBtnId());

      // 更新清除按钮显示状态
      if (clearBtn) {
        clearBtn.style.display = this.selectedTags.size > 0 ? 'block' : 'none';
      }

      // 获取所有标签
      const tags = await this.getAllTags();
      const tagsWithGroup = await this.getTagsWithGroup();
      const groups = await this.getTagGroups();

      // 计算标签计数
      const tagCounts = this.calculateTagCounts(tags);

      // 获取可见项目
      const visibleItems = this.getItems().filter(item => !item.isDeleted && (this.viewMode !== 'safe' || item.isSafe !== 0));

      // 计算特殊标签计数
      const specialTags = this.calculateSpecialTagCounts(visibleItems);

      // 对标签进行排序
      const sortedTagsWithGroup = this.sortTagsForFilter(tagsWithGroup, tagCounts);

      // 渲染特殊标签
      if (specialTagsContainer) {
        await this.renderSpecialTags(specialTagsContainer, specialTags);
      }

      // 渲染普通标签
      await this.renderNormalTags(container, sortedTagsWithGroup, tagCounts, groups);

      // 更新头部标签
      await this.updateTagFilterHeader(specialTags, sortedTagsWithGroup, tagCounts);

      // 绑定事件
      this.bindTagFilterEvents();
    } catch (error) {
      console.error(`Failed to render ${this.getItemType()} tag filters:`, error);
    }
  }

  /**
   * 计算标签计数
   * @param {Array} tags - 所有标签
   * @returns {Object} 标签计数对象
   */
  calculateTagCounts(tags) {
    const visibleItems = this.getItems().filter(item => !item.isDeleted && (this.viewMode !== 'safe' || item.isSafe !== 0));

    const tagCounts = {};
    visibleItems.forEach(item => {
      if (item.tags && item.tags.length > 0) {
        item.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    return tagCounts;
  }

  /**
   * 渲染特殊标签
   * @param {HTMLElement} container - 容器元素
   * @param {Array} specialTags - 特殊标签列表
   */
  async renderSpecialTags(container, specialTags) {
    const specialTagsHtml = specialTags.map(({ tag, count }) => {
      const isActive = this.selectedTags.has(tag);
      return `
        <button class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagUI.escapeHtml(tag)}" data-is-special="true">
          <span class="tag-name">${TagUI.escapeHtml(tag)}</span>
          <span class="tag-badge">${count}</span>
        </button>
      `;
    }).join('');

    container.innerHTML = specialTagsHtml || '<span class="tag-filter-empty">暂无特殊标签</span>';
  }

  /**
   * 渲染普通标签
   * @param {HTMLElement} container - 容器元素
   * @param {Array} sortedTagsWithGroup - 排序后的标签列表
   * @param {Object} tagCounts - 标签计数
   * @param {Array} groups - 标签组
   */
  async renderNormalTags(container, sortedTagsWithGroup, tagCounts, groups) {
    const html = TagUI.generateTagFiltersHtml(sortedTagsWithGroup, tagCounts, {
      specialTags: [],
      selectedTags: this.selectedTags,
      groups: groups,
      isImage: this.getItemType() === 'image'
    });

    if (container) {
      container.innerHTML = html || '<span class="tag-filter-empty">暂无标签</span>';
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
        return nameA.localeCompare(nameB);
      } else if (this.tagFilterSortBy === 'name') {
        return nameA.localeCompare(nameB) * order;
      }
      return 0;
    });

    return sorted;
  }

  /**
   * 绑定标签筛选器事件
   */
  bindTagFilterEvents() {
    const container = document.getElementById(this.getTagFilterContainerId());
    const specialTagsContainer = document.getElementById(this.getSpecialTagsContainerId());
    if (!container && !specialTagsContainer) return;

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
              this.selectedTags.delete(tag);
            } else {
              this.selectedTags.clear();
              this.selectedTags.add(tag);
            }
          }
          this.render();
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
          const groups = await this.getTagGroups();
          const group = groups.find(g => String(g.id) === String(groupId));
          const isSingleSelectGroup = group && group.type === 'single';

          if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd + 点击：多选模式（单选组仍限制单选）
            if (isSingleSelectGroup) {
              // 单选组：需要从 sortedTagsWithGroup 中获取该组的所有标签
              const tagsWithGroup = await this.getTagsWithGroup();
              const groupTags = tagsWithGroup
                .filter(t => String(t.groupId) === String(groupId))
                .map(t => t.name);
              for (const t of groupTags) {
                this.selectedTags.delete(t);
              }
              this.selectedTags.add(tag);
            } else {
              // 多选模式
              if (this.selectedTags.has(tag)) {
                this.selectedTags.delete(tag);
              } else {
                this.selectedTags.add(tag);
              }
            }
          } else {
            // 普通点击：纯单选模式
            if (this.selectedTags.has(tag)) {
              this.selectedTags.delete(tag);
            } else {
              this.selectedTags.clear();
              this.selectedTags.add(tag);
            }
          }

          this.render();
          this.renderTagFilters();
        });
      });

      // 绑定标签拖拽事件
      container.querySelectorAll('.tag-filter-item[draggable="true"]').forEach(item => {
        item.addEventListener('dragstart', (e) => {
          const tag = item.dataset.tag;
          e.dataTransfer.setData('text/plain', tag);
          e.dataTransfer.setData('drag-source', this.getTagDragType());
          e.dataTransfer.effectAllowed = 'copy';
          item.classList.add('dragging');
        });

        item.addEventListener('dragend', () => {
          item.classList.remove('dragging');
        });
      });
    }
  }

  /**
   * 更新标签筛选区域头部标签（收起时显示）
   * @param {Array} specialTags - 特殊标签列表
   * @param {Array} sortedTagsWithGroup - 排序后的标签列表
   * @param {Object} tagCounts - 标签计数对象
   */
  async updateTagFilterHeader(specialTags, sortedTagsWithGroup, tagCounts) {
    // 使用 LRU 缓存 tagsWithGroup 供 getTopGroupTags 使用
    this.tagsWithGroupCache.set('current', sortedTagsWithGroup);

    TagUI.renderFilterHeader({
      containerId: this.getTagFilterHeaderContainerId(),
      specialTags,
      sortedTagsWithGroup,
      tagCounts,
      selectedTags: this.selectedTags,
      dragType: this.getTagDragType(),
      onTagClick: (tag, isTopGroupTag, isSingleSelectGroup, event) => {
        const isCtrlPressed = event && (event.ctrlKey || event.metaKey);

        // 获取标签所属的组信息（从缓存的 tagsWithGroup 中查找）
        const tagsWithGroup = this.tagsWithGroupCache.get('current') || [];
        const tagInfo = tagsWithGroup.find(t => t.name === tag);
        const isInSingleSelectGroup = tagInfo && tagInfo.groupType === 'single';
        const groupId = tagInfo ? tagInfo.groupId : null;

        if (isCtrlPressed) {
          // Ctrl/Cmd+点击：多选模式（单选组仍限制单选）
          if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
          } else {
            if (isInSingleSelectGroup && groupId) {
              // 单选组：取消同组其他标签
              const groupTags = tagsWithGroup
                .filter(t => t.groupId === groupId)
                .map(t => t.name);
              groupTags.forEach(t => this.selectedTags.delete(t));
            }
            this.selectedTags.add(tag);
          }
        } else {
          // 普通点击：单选模式
          if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
          } else {
            // 先清除所有已选标签，再添加当前标签
            this.selectedTags.clear();
            this.selectedTags.add(tag);
          }
        }
        this.render();
        this.renderTagFilters();
      }
    });
  }

  /**
   * 获取首位组的标签列表
   * @returns {Array<string>} 首位组的所有标签名称
   */
  getTopGroupTags() {
    // 使用 LRU 缓存获取 tagsWithGroup 数据
    const tagsWithGroup = this.tagsWithGroupCache.get('current') || [];

    // 按组分组
    const groupMap = new Map();
    tagsWithGroup.forEach(t => {
      if (t.groupId) {
        if (!groupMap.has(t.groupId)) {
          groupMap.set(t.groupId, {
            groupId: t.groupId,
            groupSortOrder: t.groupSortOrder || 0,
            tags: []
          });
        }
        groupMap.get(t.groupId).tags.push(t.name);
      }
    });

    // 按 sortOrder 排序，取第一个组
    const sortedGroups = Array.from(groupMap.values())
      .sort((a, b) => a.groupSortOrder - b.groupSortOrder);

    return sortedGroups.length > 0 ? sortedGroups[0].tags : [];
  }

  /**
   * 清除标签筛选
   */
  clearTagFilter() {
    this.selectedTags.clear();
    this.render();
    this.renderTagFilters();
  }

  /**
   * 设置视图模式
   * @param {string} mode - 视图模式
   */
  setViewMode(mode) {
    this.viewModeType = mode;
    localStorage.setItem(`${this.storagePrefix}ViewMode`, mode);
    this.render();
  }

  /**
   * 设置排序方式
   * @param {string} sortBy - 排序字段
   * @param {string} sortOrder - 排序顺序
   */
  setSort(sortBy, sortOrder) {
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
    localStorage.setItem(`${this.storagePrefix}SortBy`, sortBy);
    localStorage.setItem(`${this.storagePrefix}SortOrder`, sortOrder);
    this.render();
  }

  /**
   * 设置卡片大小
   * @param {number} size - 卡片大小
   */
  setCardSize(size) {
    this.cardSize = size;
    localStorage.setItem(`${this.storagePrefix}CardSize`, size);
  }

  /**
   * 处理项目选择
   * @param {string} id - 项目 ID
   * @param {number} index - 项目索引
   * @param {MouseEvent} event - 鼠标事件
   */
  handleItemSelection(id, index, event) {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + 点击：切换选择
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id);
      } else {
        this.selectedIds.add(id);
        this.lastSelectedIndex = index;
      }
    } else if (event.shiftKey && this.lastSelectedIndex !== -1) {
      // Shift + 点击：范围选择
      const start = Math.min(this.lastSelectedIndex, index);
      const end = Math.max(this.lastSelectedIndex, index);
      const items = this.filteredItems;
      for (let i = start; i <= end; i++) {
        if (items[i]) {
          this.selectedIds.add(items[i].id);
        }
      }
    }

    this.render();
  }

  /**
   * 数据更新后的统一刷新
   * 加载最新数据、重新渲染界面、更新标签筛选区
   */
  async refreshAfterUpdate() {
    await this.loadItems();
    await this.render();
    await this.renderTagFilters();
  }
}

export default PanelManagerBase;
