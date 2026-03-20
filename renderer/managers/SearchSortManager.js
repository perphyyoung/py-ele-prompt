import { Constants } from '../constants.js';

/**
 * 搜索排序管理器
 * 负责处理搜索和排序功能
 */
export class SearchSortManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;

    // 搜索状态
    this.searchQuery = '';
    this.imageSearchQuery = '';

    // 防抖定时器
    this.searchDebounceTimer = null;
    this.searchDebounceDelay = 300;
  }

  /**
   * 初始化
   */
  init() {
    this.bindSearchEvents();
    this.bindSortEvents();
    this.bindViewToggleEvents();
  }

  /**
   * 绑定搜索事件
   * @private
   */
  bindSearchEvents() {
    // 提示词搜索
    const promptSearchInput = document.getElementById('promptSearchInput');
    const clearPromptSearchBtn = document.getElementById('clearPromptSearchBtn');

    if (promptSearchInput) {
      promptSearchInput.addEventListener('input', (e) => {
        this.handlePromptSearch(e.target.value, clearPromptSearchBtn);
      });
    }

    if (clearPromptSearchBtn) {
      clearPromptSearchBtn.addEventListener('click', () => {
        this.clearPromptSearch(promptSearchInput, clearPromptSearchBtn);
      });
    }

    // 图像搜索
    const imageSearchInput = document.getElementById('imageSearchInput');
    const clearImageSearchBtn = document.getElementById('clearImageSearchBtn');

    if (imageSearchInput) {
      imageSearchInput.addEventListener('input', (e) => {
        this.handleImageSearch(e.target.value, clearImageSearchBtn);
      });
    }

    if (clearImageSearchBtn) {
      clearImageSearchBtn.addEventListener('click', () => {
        this.clearImageSearch(imageSearchInput, clearImageSearchBtn);
      });
    }
  }

  /**
   * 处理提示词搜索
   * @param {string} value - 搜索值
   * @param {HTMLElement} clearBtn - 清除按钮
   * @private
   */
  handlePromptSearch(value, clearBtn) {
    this.searchQuery = value;

    if (clearBtn) {
      clearBtn.style.display = value ? 'flex' : 'none';
    }

    // 防抖处理
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      if (this.app.promptPanelManager) {
        this.app.promptPanelManager.renderView();
      }
    }, this.searchDebounceDelay);
  }

  /**
   * 清除提示词搜索
   * @param {HTMLElement} input - 输入框
   * @param {HTMLElement} clearBtn - 清除按钮
   * @private
   */
  clearPromptSearch(input, clearBtn) {
    if (input) {
      input.value = '';
      input.focus();
    }
    this.searchQuery = '';

    if (clearBtn) {
      clearBtn.style.display = 'none';
    }

    if (this.app.promptPanelManager) {
      this.app.promptPanelManager.renderView();
    }
  }

  /**
   * 处理图像搜索
   * @param {string} value - 搜索值
   * @param {HTMLElement} clearBtn - 清除按钮
   * @private
   */
  handleImageSearch(value, clearBtn) {
    this.imageSearchQuery = value;

    if (clearBtn) {
      clearBtn.style.display = value ? 'flex' : 'none';
    }

    // 防抖处理
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    this.searchDebounceTimer = setTimeout(() => {
      if (this.app.imagePanelManager) {
        this.app.imagePanelManager.renderView();
      }
    }, this.searchDebounceDelay);
  }

  /**
   * 清除图像搜索
   * @param {HTMLElement} input - 输入框
   * @param {HTMLElement} clearBtn - 清除按钮
   * @private
   */
  clearImageSearch(input, clearBtn) {
    if (input) {
      input.value = '';
      input.focus();
    }
    this.imageSearchQuery = '';

    if (clearBtn) {
      clearBtn.style.display = 'none';
    }

    if (this.app.imagePanelManager) {
      this.app.imagePanelManager.renderView();
    }
  }

  /**
   * 绑定视图切换事件
   * @private
   */
  bindViewToggleEvents() {
    // 提示词视图
    document.getElementById('promptGridViewBtn')?.addEventListener('click', () => {
      this.app.promptPanelManager?.setViewMode('grid');
      this.app.updatePromptViewButtons?.('grid');
    });
    document.getElementById('promptListViewBtn')?.addEventListener('click', () => {
      this.app.promptPanelManager?.setViewMode('list');
      this.app.updatePromptViewButtons?.('list');
    });
    document.getElementById('promptCompactViewBtn')?.addEventListener('click', () => {
      this.app.promptPanelManager?.setViewMode('list-compact');
      this.app.updatePromptViewButtons?.('list-compact');
    });

    // 图像视图
    document.getElementById('imageGridViewBtn')?.addEventListener('click', () => {
      this.app.imagePanelManager?.setViewMode('grid');
      this.app.updateImageViewButtons?.('grid');
    });
    document.getElementById('imageListViewBtn')?.addEventListener('click', () => {
      this.app.imagePanelManager?.setViewMode('list');
      this.app.updateImageViewButtons?.('list');
    });
    document.getElementById('imageCompactViewBtn')?.addEventListener('click', () => {
      this.app.imagePanelManager?.setViewMode('list-compact');
      this.app.updateImageViewButtons?.('list-compact');
    });
  }

  /**
   * 绑定排序事件
   * @private
   */
  bindSortEvents() {
    this.bindPromptSortEvents();
    this.bindImageSortEvents();
  }

  /**
   * 绑定提示词排序事件
   * @private
   */
  bindPromptSortEvents() {
    const promptSortSelect = document.getElementById('promptSortSelect');
    const promptSortReverseBtn = document.getElementById('promptSortReverseBtn');
    const promptCardSizeSlider = document.getElementById('promptCardSizeSlider');

    if (!this.app.promptPanelManager) return;

    // 排序选择
    if (promptSortSelect) {
      promptSortSelect.value = `${this.app.promptPanelManager.sortBy}-${this.app.promptPanelManager.sortOrder}`;
      promptSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.setPromptSort(sortBy, sortOrder);
      });
    }

    // 排序反转
    if (promptSortReverseBtn) {
      promptSortReverseBtn.addEventListener('click', () => {
        this.togglePromptSortOrder(promptSortSelect);
      });
    }

    // 卡片大小
    if (promptCardSizeSlider) {
      promptCardSizeSlider.value = this.app.promptPanelManager.cardSize;
      this.app.promptPanelManager.setCardSize(this.app.promptPanelManager.cardSize);
      promptCardSizeSlider.addEventListener('input', (e) => {
        this.app.promptPanelManager.setCardSize(parseInt(e.target.value));
      });
      promptCardSizeSlider.addEventListener('change', (e) => {
        localStorage.setItem(Constants.LocalStorageKey.PROMPT_CARD_SIZE, e.target.value);
      });
    }
  }

  /**
   * 设置提示词排序
   * @param {string} sortBy - 排序字段
   * @param {string} sortOrder - 排序顺序 (asc/desc)
   */
  setPromptSort(sortBy, sortOrder) {
    if (!this.app.promptPanelManager) return;

    this.app.promptPanelManager.sortBy = sortBy;
    this.app.promptPanelManager.sortOrder = sortOrder;
    localStorage.setItem(Constants.LocalStorageKey.PROMPT_SORT_BY, sortBy);
    localStorage.setItem(Constants.LocalStorageKey.PROMPT_SORT_ORDER, sortOrder);
    this.app.promptPanelManager.renderView();
  }

  /**
   * 切换提示词排序顺序
   * @param {HTMLElement} sortSelect - 排序选择框
   */
  togglePromptSortOrder(sortSelect) {
    if (!this.app.promptPanelManager) return;

    const newOrder = this.app.promptPanelManager.sortOrder === 'asc' ? 'desc' : 'asc';
    this.app.promptPanelManager.sortOrder = newOrder;
    localStorage.setItem(Constants.LocalStorageKey.PROMPT_SORT_ORDER, newOrder);

    if (sortSelect) {
      sortSelect.value = `${this.app.promptPanelManager.sortBy}-${newOrder}`;
    }

    this.app.promptPanelManager.renderView();
  }

  /**
   * 绑定图像排序事件
   * @private
   */
  bindImageSortEvents() {
    const imageSortSelect = document.getElementById('imageSortSelect');
    const imageSortReverseBtn = document.getElementById('imageSortReverseBtn');
    const imageCardSizeSlider = document.getElementById('imageCardSizeSlider');

    if (!this.app.imagePanelManager) return;

    // 排序选择
    if (imageSortSelect) {
      imageSortSelect.value = `${this.app.imagePanelManager.sortBy}-${this.app.imagePanelManager.sortOrder}`;
      imageSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.setImageSort(sortBy, sortOrder);
      });
    }

    // 排序反转
    if (imageSortReverseBtn) {
      imageSortReverseBtn.addEventListener('click', () => {
        this.toggleImageSortOrder(imageSortSelect);
      });
    }

    // 卡片大小
    if (imageCardSizeSlider) {
      imageCardSizeSlider.value = this.app.imagePanelManager.cardSize;
      this.app.imagePanelManager.setCardSize(this.app.imagePanelManager.cardSize);
      imageCardSizeSlider.addEventListener('input', (e) => {
        this.app.imagePanelManager.setCardSize(parseInt(e.target.value));
      });
      imageCardSizeSlider.addEventListener('change', (e) => {
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_CARD_SIZE, e.target.value);
      });
    }
  }

  /**
   * 设置图像排序
   * @param {string} sortBy - 排序字段
   * @param {string} sortOrder - 排序顺序 (asc/desc)
   */
  setImageSort(sortBy, sortOrder) {
    if (!this.app.imagePanelManager) return;

    this.app.imagePanelManager.sortBy = sortBy;
    this.app.imagePanelManager.sortOrder = sortOrder;
    localStorage.setItem(Constants.LocalStorageKey.IMAGE_SORT_BY, sortBy);
    localStorage.setItem(Constants.LocalStorageKey.IMAGE_SORT_ORDER, sortOrder);
    this.app.imagePanelManager.renderView();
  }

  /**
   * 切换图像排序顺序
   * @param {HTMLElement} sortSelect - 排序选择框
   */
  toggleImageSortOrder(sortSelect) {
    if (!this.app.imagePanelManager) return;

    const newOrder = this.app.imagePanelManager.sortOrder === 'asc' ? 'desc' : 'asc';
    this.app.imagePanelManager.sortOrder = newOrder;
    localStorage.setItem(Constants.LocalStorageKey.IMAGE_SORT_ORDER, newOrder);

    if (sortSelect) {
      sortSelect.value = `${this.app.imagePanelManager.sortBy}-${newOrder}`;
    }

    this.app.imagePanelManager.renderView();
  }

  /**
   * 获取提示词搜索查询
   * @returns {string}
   */
  getPromptSearchQuery() {
    return this.searchQuery;
  }

  /**
   * 获取图像搜索查询
   * @returns {string}
   */
  getImageSearchQuery() {
    return this.imageSearchQuery;
  }

  /**
   * 设置提示词搜索查询
   * @param {string} query - 搜索查询
   */
  setPromptSearchQuery(query) {
    this.searchQuery = query;
    const input = document.getElementById('promptSearchInput');
    if (input) {
      input.value = query;
    }
  }

  /**
   * 设置图像搜索查询
   * @param {string} query - 搜索查询
   */
  setImageSearchQuery(query) {
    this.imageSearchQuery = query;
    const input = document.getElementById('imageSearchInput');
    if (input) {
      input.value = query;
    }
  }

  /**
   * 清除所有搜索
   */
  clearAllSearches() {
    this.clearPromptSearch(
      document.getElementById('promptSearchInput'),
      document.getElementById('clearPromptSearchBtn')
    );
    this.clearImageSearch(
      document.getElementById('imageSearchInput'),
      document.getElementById('clearImageSearchBtn')
    );
  }
}
