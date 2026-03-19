/**
 * 重构版应用主类
 * 作为协调器，整合各个面板管理器
 */
import { Constants } from './constants.js';
import SafeRatingService from './services/SafeRatingService.js';
import {
  PromptPanelManager, ImagePanelManager,
  TagService, TagRegistry, TagGroupAdmin, TagUI,
  TrashManager, BatchOperationsManager, SimpleTagManager,
  ImageFullscreenManager, PromptDetailManager, ImageDetailManager,
  ModalManager, ToastManager, NavigationManager, SearchSortManager,
  ToolbarManager, ImportExportManager, SettingsManager, ImageSelectorManager,
  NewPromptManager, RecycleBinManager, ImageUploadManager, ImageContextMenuManager
} from './managers/index.js';
import { EventBus, HoverTooltipManager, ShortcutManager, HtmlUtils } from './utils/index.js';

// 导入 isSameId 工具函数
import { isSameId } from './utils/isSameId.js';

/**
 * 主应用类 - 协调器
 * 负责初始化和管理各个子模块，处理全局事件和状态
 */
class PromptManager {
  constructor() {
    // 全局状态
    this.prompts = [];
    this.images = [];
    this.currentImages = [];  // 当前编辑的图像列表
    
    // ID 索引缓存 - 优化查找性能 O(n) -> O(1)
    this.promptsById = new Map();
    this.imagesById = new Map();
    // 从 localStorage 加载 viewMode（在创建面板管理器之前）
    this.viewMode = localStorage.getItem(Constants.LocalStorageKey.VIEW_MODE) || 'safe';
    this.searchQuery = '';
    this.selectedTags = new Set();
    this.imageSearchQuery = '';

    // 标签管理排序状态
    this.promptTagSortBy = localStorage.getItem(Constants.LocalStorageKey.PROMPT_TAG_SORT_BY) || 'count';
    this.promptTagSortOrder = localStorage.getItem(Constants.LocalStorageKey.PROMPT_TAG_SORT_ORDER) || 'desc';
    this.imageTagSortBy = localStorage.getItem(Constants.LocalStorageKey.IMAGE_TAG_SORT_BY) || 'count';
    this.imageTagSortOrder = localStorage.getItem(Constants.LocalStorageKey.IMAGE_TAG_SORT_ORDER) || 'desc';

    // 图像选择器排序状态（独立设置）
    this.imageSelectorSortBy = localStorage.getItem(Constants.LocalStorageKey.IMAGE_SELECTOR_SORT_BY) || 'updatedAt';
    this.imageSelectorSortOrder = localStorage.getItem(Constants.LocalStorageKey.IMAGE_SELECTOR_SORT_ORDER) || 'desc';

    // 标签系统（重构后 - 4个文件替代原来的6个）
    this.tagRegistry = null;        // TagRegistry 实例（提示词）
    this.imageTagRegistry = null;   // TagRegistry 实例（图像）
    this.tagGroupAdmin = null;      // TagGroupAdmin 实例
    this.tagUI = null;              // TagUI 工具类

    // 事件总线
    this.eventBus = new EventBus();
    
    // 服务
    this.safeRatingService = new SafeRatingService();
    
    // 面板管理器（初始化后赋值）
    this.promptPanelManager = null;
    this.imagePanelManager = null;
    this.tagGroupAdmin = null;
    this.trashManager = null;
    this.batchOpsManager = null;
    this.shortcutManager = null;
    this.imageFullscreenManager = null;
    this.promptDetailManager = null;
    this.imageDetailManager = null;
    this.modalManager = null;
    this.toastManager = null;
    this.navigationManager = null;
    this.searchSortManager = null;
    this.toolbarManager = null;
    this.importExportManager = null;
    this.settingsManager = null;
    this.imageSelectorManager = null;
    this.newPromptManager = null;
    this.recycleBinManager = null;
    this.imageUploadManager = null;

    this.imageContextMenuManager = null;

    // 当前面板状态 (由 NavigationManager 管理)
    this.currentPanel = 'prompt'; // 默认打开提示词面板

    // UI 组件
    this.hoverTooltip = null;
    this.promptHoverTooltip = null;
  }

  /**
   * 初始化应用
   */
  async init() {
    try {
      // 恢复主题
      this.restoreTheme();
      
      // 初始化 hover tooltip
      this.initHoverTooltips();
      
      // 初始化面板管理器
      await this.initPanelManagers();
      
      // 绑定全局事件
      this.bindGlobalEvents();
      
      // 加载数据
      await this.loadData();
      
      // 恢复上次打开的面板
      this.navigationManager.restorePanelState();
    } catch (error) {
      console.error('Failed to initialize application:', error);
      this.showToast('应用初始化失败', 'error');
    }
  }

  /**
   * 恢复主题
   */
  restoreTheme() {
    const savedTheme = localStorage.getItem(Constants.LocalStorageKey.THEME) || 'light';
    const html = document.documentElement;
    html.setAttribute('data-theme', savedTheme);
    
    // 更新主题按钮文本
    const themeToggle = document.getElementById('settingsThemeToggle');
    if (themeToggle) {
      themeToggle.innerHTML = savedTheme === 'dark' 
        ? '<span>☀️</span> 明亮' 
        : '<span>🌙</span> 暗黑';
    }
  }

  /**
   * 初始化 Hover Tooltip
   */
  initHoverTooltips() {
    // 提示词预览 tooltip（左右布局，同时显示内容和图像）
    this.promptHoverTooltip = new HoverTooltipManager('promptPreviewTooltip', 'promptPreviewContent', 'promptPreviewImage');
  }

  /**
   * 初始化面板管理器
   */
  async initPanelManagers() {
    // 初始化标签组管理器（重构后）
    this.tagGroupAdmin = new TagGroupAdmin({
      app: this,
      eventBus: this.eventBus
    });
    await this.tagGroupAdmin.init();

    // 初始化回收站管理器
    this.trashManager = new TrashManager({
      app: this,
      eventBus: this.eventBus
    });
    await this.trashManager.init();

    // 初始化批量操作管理器
    this.batchOpsManager = new BatchOperationsManager({
      app: this,
      eventBus: this.eventBus
    });
    this.batchOpsManager.init();

    // 初始化快捷键管理器
    this.shortcutManager = new ShortcutManager({
      app: this
    });
    this.shortcutManager.bind();

    // 初始化提示词面板管理器
    this.promptPanelManager = new PromptPanelManager({
      app: this,
      eventBus: this.eventBus
    });

    // 初始化图像面板管理器
    this.imagePanelManager = new ImagePanelManager({
      app: this,
      eventBus: this.eventBus
    });

    // 初始化标签注册表（重构后，用配置替代继承）
    this.tagRegistry = new TagRegistry('prompt', this);
    this.imageTagRegistry = new TagRegistry('image', this);

    // 初始化图像全屏查看器管理器
    this.imageFullscreenManager = new ImageFullscreenManager({
      app: this
    });
    this.imageFullscreenManager.init();

    // 初始化详情管理器
    this.promptDetailManager = new PromptDetailManager({
      app: this,
      tagRegistry: this.tagRegistry
    });

    this.imageDetailManager = new ImageDetailManager({
      app: this,
      tagRegistry: this.imageTagRegistry
    });

    // 初始化模态框管理器
    this.modalManager = new ModalManager({
      app: this
    });
    this.modalManager.init();

    // 初始化 Toast 管理器
    this.toastManager = new ToastManager({
      duration: 3000
    });
    this.toastManager.init();

    // 初始化导航管理器
    this.navigationManager = new NavigationManager({
      app: this,
      storageKey: 'currentPanel',
      defaultPanel: 'prompt'
    });
    this.navigationManager.init();

    // 同步 currentPanel 引用
    this.syncCurrentPanel();

    // 初始化搜索排序管理器
    this.searchSortManager = new SearchSortManager({
      app: this
    });
    this.searchSortManager.init();

    // 初始化工具栏管理器
    this.toolbarManager = new ToolbarManager({
      app: this
    });
    this.toolbarManager.init();

    // 初始化导入导出管理器
    this.importExportManager = new ImportExportManager({
      app: this
    });
    this.importExportManager.init();

    // 初始化设置管理器
    this.settingsManager = new SettingsManager({
      app: this
    });
    this.settingsManager.init();

    // 初始化图像选择器管理器
    this.imageSelectorManager = new ImageSelectorManager({
      app: this
    });

    // 初始化新建提示词管理器
    this.newPromptManager = new NewPromptManager({
      app: this
    });

    // 初始化回收站管理器
    this.recycleBinManager = new RecycleBinManager({
      app: this
    });

    // 初始化图像上传管理器
    this.imageUploadManager = new ImageUploadManager({
      app: this
    });



    // 初始化图像右键菜单管理器
    this.imageContextMenuManager = new ImageContextMenuManager({
      app: this
    });

    // 执行初始化
    await this.promptPanelManager.init();
    await this.imagePanelManager.init();
  }

  /**
   * 同步 currentPanel 引用
   * 保持与 NavigationManager 的同步
   */
  syncCurrentPanel() {
    Object.defineProperty(this, 'currentPanel', {
      get: () => this.navigationManager?.getCurrentPanel() || 'prompt',
      set: (value) => {
        if (this.navigationManager) {
          this.navigationManager.switchTo(value);
        }
      }
    });
  }

  /**
   * 加载数据
   */
  async loadData() {
    // 数据已由面板管理器加载到 this.app.prompts 和 this.app.images
    // 无需额外操作
  }

  /**
   * 绑定全局事件
   */
  bindGlobalEvents() {
    this.bindSidebarEvents();
    this.bindNavigationEvents();
    // 工具栏事件由 ToolbarManager 处理
    // 搜索、排序、视图切换事件由 SearchSortManager 处理
    this.bindTagFilterEvents();
    this.bindDialogEvents();
    this.bindSettingsEvents();
    this.bindPromptTagManagerEvents();
    this.bindImageTagManagerEvents();
    this.bindDetailModalEvents();
    // 全屏查看器事件由 ImageFullscreenManager 处理
  }

  /**
   * 绑定侧边栏事件
   */
  bindSidebarEvents() {
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('sidebar');
    if (!toggleSidebarBtn || !sidebar) return;

    toggleSidebarBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      const isCollapsed = sidebar.classList.contains('collapsed');
      toggleSidebarBtn.title = isCollapsed ? '展开侧边栏' : '收起侧边栏';
      localStorage.setItem(Constants.LocalStorageKey.SIDEBAR_COLLAPSED, isCollapsed);
    });

    // 恢复侧边栏状态
    if (localStorage.getItem(Constants.LocalStorageKey.SIDEBAR_COLLAPSED) === 'true') {
      sidebar.classList.add('collapsed');
      toggleSidebarBtn.title = '展开侧边栏';
    }
  }

  /**
   * 绑定导航事件
   */
  bindNavigationEvents() {
    // 导航事件由 NavigationManager 处理
    document.getElementById('settingsBtn')?.addEventListener('click', () => this.modalManager?.openSettings());
  }

  /**
   * 绑定工具栏事件
   */
  bindToolbarEvents() {
    // 刷新按钮
    document.getElementById('reloadBtn')?.addEventListener('click', () => this.refreshData());
    document.getElementById('refreshBtn')?.addEventListener('click', () => this.relaunchApp());

    // 提示词工具栏
    document.getElementById('promptAddBtn')?.addEventListener('click', () => this.newPromptManager.open());
    document.getElementById('promptRecycleBinBtn')?.addEventListener('click', () => this.recycleBinManager.open('prompt'));
    document.getElementById('closePromptRecycleBinModal')?.addEventListener('click', () => this.recycleBinManager.close());
    document.getElementById('emptyPromptRecycleBinBtn')?.addEventListener('click', () => this.recycleBinManager.empty());

    // 图像工具栏
    document.getElementById('imageAddBtn')?.addEventListener('click', () => this.imageUploadManager.open());
    document.getElementById('imageRecycleBinBtn')?.addEventListener('click', () => this.recycleBinManager.open('image'));
    document.getElementById('closeImageRecycleBinModal')?.addEventListener('click', () => this.recycleBinManager.close());
    document.getElementById('emptyImageRecycleBinBtn')?.addEventListener('click', () => this.recycleBinManager.empty());

    // 绑定图像上传事件
    this.imageUploadManager.bindEvents();

    // 清除标签筛选
    document.getElementById('clearPromptTagFilter')?.addEventListener('click', () => this.promptPanelManager.clearTagFilter());
    document.getElementById('clearImageTagFilter')?.addEventListener('click', () => this.imagePanelManager.clearTagFilter());

    // 标签管理按钮
    document.getElementById('promptTagManagerBtn')?.addEventListener('click', () => this.openPromptTagManagerModal());
    document.getElementById('imageTagManagerBtn')?.addEventListener('click', () => this.openImageTagManagerModal());
  }

  /**
   * 绑定搜索事件
   */
  bindSearchEvents() {
    // 提示词搜索
    const promptSearchInput = document.getElementById('promptSearchInput');
    const clearPromptSearchBtn = document.getElementById('clearPromptSearchBtn');
    if (promptSearchInput) {
      promptSearchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.promptPanelManager.render();
        if (clearPromptSearchBtn) {
          clearPromptSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    if (clearPromptSearchBtn) {
      clearPromptSearchBtn.addEventListener('click', () => {
        promptSearchInput.value = '';
        this.searchQuery = '';
        this.promptPanelManager.render();
        clearPromptSearchBtn.style.display = 'none';
        promptSearchInput.focus();
      });
    }

    // 图像搜索
    const imageSearchInput = document.getElementById('imageSearchInput');
    const clearImageSearchBtn = document.getElementById('clearImageSearchBtn');
    if (imageSearchInput) {
      imageSearchInput.addEventListener('input', (e) => {
        this.imageSearchQuery = e.target.value;
        this.imagePanelManager.render();
        if (clearImageSearchBtn) {
          clearImageSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    if (clearImageSearchBtn) {
      clearImageSearchBtn.addEventListener('click', () => {
        imageSearchInput.value = '';
        this.imageSearchQuery = '';
        this.imagePanelManager.render();
        clearImageSearchBtn.style.display = 'none';
        imageSearchInput.focus();
      });
    }
  }

  /**
   * 绑定视图切换事件
   */
  bindViewToggleEvents() {
    // 提示词视图
    document.getElementById('promptGridViewBtn')?.addEventListener('click', () => {
      this.promptPanelManager.setViewMode('grid');
      this.updatePromptViewButtons('grid');
    });
    document.getElementById('promptListViewBtn')?.addEventListener('click', () => {
      this.promptPanelManager.setViewMode('list');
      this.updatePromptViewButtons('list');
    });
    document.getElementById('promptCompactViewBtn')?.addEventListener('click', () => {
      this.promptPanelManager.setViewMode('list-compact');
      this.updatePromptViewButtons('list-compact');
    });

    // 图像视图
    document.getElementById('imageGridViewBtn')?.addEventListener('click', () => {
      this.imagePanelManager.setViewMode('grid');
      this.updateImageViewButtons('grid');
    });
    document.getElementById('imageListViewBtn')?.addEventListener('click', () => {
      this.imagePanelManager.setViewMode('list');
      this.updateImageViewButtons('list');
    });
    document.getElementById('imageCompactViewBtn')?.addEventListener('click', () => {
      this.imagePanelManager.setViewMode('list-compact');
      this.updateImageViewButtons('list-compact');
    });
  }

  /**
   * 绑定排序事件
   */
  bindSortEvents() {
    // 提示词排序
    const promptSortSelect = document.getElementById('promptSortSelect');
    const promptSortReverseBtn = document.getElementById('promptSortReverseBtn');
    if (promptSortSelect) {
      promptSortSelect.value = `${this.promptPanelManager.sortBy}-${this.promptPanelManager.sortOrder}`;
      promptSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.promptPanelManager.sortBy = sortBy;
        this.promptPanelManager.sortOrder = sortOrder;
        localStorage.setItem(Constants.LocalStorageKey.PROMPT_SORT_BY, sortBy);
        localStorage.setItem(Constants.LocalStorageKey.PROMPT_SORT_ORDER, sortOrder);
        this.promptPanelManager.render();
      });
    }
    if (promptSortReverseBtn) {
      promptSortReverseBtn.addEventListener('click', () => {
        const newOrder = this.promptPanelManager.sortOrder === 'asc' ? 'desc' : 'asc';
        this.promptPanelManager.sortOrder = newOrder;
        localStorage.setItem(Constants.LocalStorageKey.PROMPT_SORT_ORDER, newOrder);
        if (promptSortSelect) {
          promptSortSelect.value = `${this.promptPanelManager.sortBy}-${newOrder}`;
        }
        this.promptPanelManager.render();
      });
    }

    // 提示词卡片大小
    const promptCardSizeSlider = document.getElementById('promptCardSizeSlider');
    if (promptCardSizeSlider) {
      promptCardSizeSlider.value = this.promptPanelManager.cardSize;
      this.promptPanelManager.setCardSize(this.promptPanelManager.cardSize);
      promptCardSizeSlider.addEventListener('input', (e) => {
        this.promptPanelManager.setCardSize(parseInt(e.target.value));
      });
      promptCardSizeSlider.addEventListener('change', (e) => {
        localStorage.setItem(Constants.LocalStorageKey.PROMPT_CARD_SIZE, e.target.value);
      });
    }

    // 图像排序
    const imageSortSelect = document.getElementById('imageSortSelect');
    const imageSortReverseBtn = document.getElementById('imageSortReverseBtn');
    if (imageSortSelect) {
      imageSortSelect.value = `${this.imagePanelManager.sortBy}-${this.imagePanelManager.sortOrder}`;
      imageSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imagePanelManager.sortBy = sortBy;
        this.imagePanelManager.sortOrder = sortOrder;
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_SORT_BY, sortBy);
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_SORT_ORDER, sortOrder);
        this.imagePanelManager.render();
      });
    }
    if (imageSortReverseBtn) {
      imageSortReverseBtn.addEventListener('click', () => {
        const newOrder = this.imagePanelManager.sortOrder === 'asc' ? 'desc' : 'asc';
        this.imagePanelManager.sortOrder = newOrder;
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_SORT_ORDER, newOrder);
        if (imageSortSelect) {
          imageSortSelect.value = `${this.imagePanelManager.sortBy}-${newOrder}`;
        }
        this.imagePanelManager.render();
      });
    }

    // 图像卡片大小
    const imageCardSizeSlider = document.getElementById('imageCardSizeSlider');
    if (imageCardSizeSlider) {
      imageCardSizeSlider.value = this.imagePanelManager.cardSize;
      this.imagePanelManager.setCardSize(this.imagePanelManager.cardSize);
      imageCardSizeSlider.addEventListener('input', (e) => {
        this.imagePanelManager.setCardSize(parseInt(e.target.value));
      });
      imageCardSizeSlider.addEventListener('change', (e) => {
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_CARD_SIZE, e.target.value);
      });
    }
  }

  /**
   * 绑定标签筛选事件
   */
  bindTagFilterEvents() {
    // 图像标签筛选排序
    const imageTagFilterSortSelect = document.getElementById('imageTagFilterSortSelect');
    const imageTagFilterOrderBtn = document.getElementById('imageTagFilterOrderBtn');
    if (imageTagFilterSortSelect) {
      imageTagFilterSortSelect.value = `${this.imagePanelManager.tagFilterSortBy}-${this.imagePanelManager.tagFilterSortOrder}`;
      imageTagFilterSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imagePanelManager.tagFilterSortBy = sortBy;
        this.imagePanelManager.tagFilterSortOrder = sortOrder;
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_TAG_FILTER_SORT_BY, sortBy);
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_TAG_FILTER_SORT_ORDER, sortOrder);
        this.imagePanelManager.renderTagFilters();
      });
    }
    if (imageTagFilterOrderBtn) {
      imageTagFilterOrderBtn.addEventListener('click', () => {
        const newOrder = this.imagePanelManager.tagFilterSortOrder === 'asc' ? 'desc' : 'asc';
        this.imagePanelManager.tagFilterSortOrder = newOrder;
        localStorage.setItem(Constants.LocalStorageKey.IMAGE_TAG_FILTER_SORT_ORDER, newOrder);
        if (imageTagFilterSortSelect) {
          imageTagFilterSortSelect.value = `${this.imagePanelManager.tagFilterSortBy}-${newOrder}`;
        }
        this.imagePanelManager.renderTagFilters();
      });
    }

    // 提示词标签筛选排序
    const promptTagFilterSortSelect = document.getElementById('promptTagFilterSortSelect');
    const promptTagFilterOrderBtn = document.getElementById('promptTagFilterOrderBtn');
    if (promptTagFilterSortSelect) {
      promptTagFilterSortSelect.value = `${this.promptPanelManager.tagFilterSortBy}-${this.promptPanelManager.tagFilterSortOrder}`;
      promptTagFilterSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.promptPanelManager.tagFilterSortBy = sortBy;
        this.promptPanelManager.tagFilterSortOrder = sortOrder;
        localStorage.setItem(Constants.LocalStorageKey.PROMPT_TAG_FILTER_SORT_BY, sortBy);
        localStorage.setItem(Constants.LocalStorageKey.PROMPT_TAG_FILTER_SORT_ORDER, sortOrder);
        this.promptPanelManager.renderTagFilters();
      });
    }
    if (promptTagFilterOrderBtn) {
      promptTagFilterOrderBtn.addEventListener('click', () => {
        const newOrder = this.promptPanelManager.tagFilterSortOrder === 'asc' ? 'desc' : 'asc';
        this.promptPanelManager.tagFilterSortOrder = newOrder;
        localStorage.setItem(Constants.LocalStorageKey.PROMPT_TAG_FILTER_SORT_ORDER, newOrder);
        if (promptTagFilterSortSelect) {
          promptTagFilterSortSelect.value = `${this.promptPanelManager.tagFilterSortBy}-${newOrder}`;
        }
        this.promptPanelManager.renderTagFilters();
      });
    }

    // 标签筛选收起/展开
    document.getElementById('promptTagFilterToggleBtn')?.addEventListener('click', () => this.togglePromptTagFilter());
    document.getElementById('imageTagFilterToggleBtn')?.addEventListener('click', () => this.toggleImageTagFilter());

    // 恢复标签筛选收起状态
    if (localStorage.getItem(Constants.LocalStorageKey.PROMPT_TAG_FILTER_COLLAPSED) === 'true') {
      document.getElementById('promptTagFilterSection')?.classList.add('collapsed');
    }
    if (localStorage.getItem(Constants.LocalStorageKey.IMAGE_TAG_FILTER_COLLAPSED) === 'true') {
      document.getElementById('imageTagFilterSection')?.classList.add('collapsed');
    }
  }

  /**
   * 绑定对话框事件
   */
  bindDialogEvents() {
    // 对话框事件由 ModalManager 处理
  }

  /**
   * 绑定设置事件
   */
  bindSettingsEvents() {
    // 设置事件由 SettingsManager 处理
  }

  /**
   * 绑定提示词标签管理器事件
   */
  bindPromptTagManagerEvents() {
    document.getElementById('closePromptTagManagerModal')?.addEventListener('click', () => this.modalManager?.closePromptTagManager());
    document.getElementById('addPromptTagGroupBtn')?.addEventListener('click', () => this.modalManager?.openTagGroupEdit('prompt'));
    const addPromptTagInManagerBtn = document.getElementById('addPromptTagInManagerBtn');
    if (addPromptTagInManagerBtn) {
      addPromptTagInManagerBtn.addEventListener('click', () => {
        console.log('Add prompt tag in manager clicked');
        this.tagRegistry.addTagInManager();
      });
    } else {
      console.warn('addPromptTagInManagerBtn not found');
    }

    // 搜索
    const searchInput = document.getElementById('promptTagManagerSearchInput');
    const clearBtn = document.getElementById('clearPromptTagManagerSearchBtn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.tagRegistry.render(e.target.value);
        if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.tagRegistry.render('');
        clearBtn.style.display = 'none';
        searchInput.focus();
      });
    }

    // 排序
    const sortSelect = document.getElementById('promptTagManagerSortSelect');
    const orderBtn = document.getElementById('promptTagManagerOrderBtn');
    if (sortSelect) {
      sortSelect.value = `${this.tagRegistry.sortBy}-${this.tagRegistry.sortOrder}`;
      sortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.tagRegistry.sortBy = sortBy;
        this.tagRegistry.sortOrder = sortOrder;
        localStorage.setItem(`promptTagSortBy`, sortBy);
        localStorage.setItem(`promptTagSortOrder`, sortOrder);
        this.tagRegistry.render(searchInput?.value || '');
      });
    }
    if (orderBtn && sortSelect) {
      orderBtn.addEventListener('click', () => {
        const newOrder = this.tagRegistry.sortOrder === 'asc' ? 'desc' : 'asc';
        this.tagRegistry.sortOrder = newOrder;
        localStorage.setItem(`promptTagSortOrder`, newOrder);
        sortSelect.value = `${this.tagRegistry.sortBy}-${newOrder}`;
        this.tagRegistry.render(searchInput?.value || '');
      });
    }
  }

  /**
   * 绑定图像标签管理器事件
   */
  bindImageTagManagerEvents() {
    document.getElementById('closeImageTagManagerModal')?.addEventListener('click', () => this.modalManager?.closeImageTagManager());
    document.getElementById('addImageTagGroupBtn')?.addEventListener('click', () => this.modalManager?.openTagGroupEdit('image'));
    const addImageTagInManagerBtn = document.getElementById('addImageTagInManagerBtn');
    if (addImageTagInManagerBtn) {
      addImageTagInManagerBtn.addEventListener('click', () => {
        console.log('Add image tag in manager clicked');
        this.imageTagRegistry.addTagInManager();
      });
    } else {
      console.warn('addImageTagInManagerBtn not found');
    }

    // 搜索
    const searchInput = document.getElementById('imageTagManagerSearchInput');
    const clearBtn = document.getElementById('clearImageTagManagerSearchBtn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.imageTagRegistry.render(e.target.value);
        if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.imageTagRegistry.render('');
        clearBtn.style.display = 'none';
        searchInput.focus();
      });
    }

    // 排序
    const sortSelect = document.getElementById('imageTagManagerSortSelect');
    const orderBtn = document.getElementById('imageTagManagerOrderBtn');
    if (sortSelect) {
      sortSelect.value = `${this.imageTagRegistry.sortBy}-${this.imageTagRegistry.sortOrder}`;
      sortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imageTagRegistry.sortBy = sortBy;
        this.imageTagRegistry.sortOrder = sortOrder;
        localStorage.setItem(`imageTagSortBy`, sortBy);
        localStorage.setItem(`imageTagSortOrder`, sortOrder);
        this.imageTagRegistry.render(searchInput?.value || '');
      });
    }
    if (orderBtn && sortSelect) {
      orderBtn.addEventListener('click', () => {
        const newOrder = this.imageTagRegistry.sortOrder === 'asc' ? 'desc' : 'asc';
        this.imageTagRegistry.sortOrder = newOrder;
        localStorage.setItem(`imageTagSortOrder`, newOrder);
        sortSelect.value = `${this.imageTagRegistry.sortBy}-${newOrder}`;
        this.imageTagRegistry.render(searchInput?.value || '');
      });
    }
  }

  /**
   * 绑定详情模态框事件
   */
  bindDetailModalEvents() {
    // 提示词详情关闭
    const closePromptDetailBtn = document.getElementById('closePromptDetailBtn');
    if (closePromptDetailBtn) {
      closePromptDetailBtn.onclick = () => this.promptDetailManager?.close();
    }

    // 图像详情关闭
    document.getElementById('closeImageDetailBtn')?.addEventListener('click', () => this.imageDetailManager?.close());

    // 收藏按钮（由 DetailManager 自动处理）
    // PromptDetailManager 和 ImageDetailManager 在 initSaveManager 中绑定事件
  }

  /**
   * 切换视图模式（safe/nsfw）
   */
  async toggleViewMode() {
    this.viewMode = this.viewMode === 'safe' ? 'nsfw' : 'safe';

    // 更新两个管理器的视图模式
    this.promptPanelManager.viewMode = this.viewMode;
    this.imagePanelManager.viewMode = this.viewMode;

    // 重新渲染
    await this.promptPanelManager.render();
    await this.promptPanelManager.renderTagFilters();
    await this.imagePanelManager.render();
    await this.imagePanelManager.renderTagFilters();

    // 刷新统计
    await this.renderStatistics();

    this.showToast(`已切换到${this.viewMode === 'safe' ? '安全' : 'NSFW'}模式`, 'success');
  }

  /**
   * 刷新数据
   */
  async refreshData() {
    try {
      // 加载数据
      await this.promptPanelManager.loadItems();
      await this.imagePanelManager.loadItems();

      // 刷新提示词和图像列表
      await this.promptPanelManager.render();
      await this.imagePanelManager.render();

      // 刷新标签筛选
      await this.promptPanelManager.renderTagFilters();
      await this.imagePanelManager.renderTagFilters();

      // 刷新统计
      await this.renderStatistics();

      this.showToast('数据已刷新', 'success');
    } catch (error) {
      console.error('Failed to refresh data:', error);
      this.showToast('刷新失败', 'error');
    }
  }

  /**
   * 重启应用
   */
  async relaunchApp() {
    try {
      const confirmed = await this.showConfirmDialog(
        '确认重启',
        '确定要重启应用吗？\n\n未保存的修改可能会丢失。'
      );
      
      if (!confirmed) return;
      
      await window.electronAPI.relaunchApp();
    } catch (error) {
      console.error('Failed to relaunch app:', error);
      this.showToast('重启失败', 'error');
    }
  }

  /**
   * 显示提示消息
   * @param {string} message - 消息内容
   * @param {string} type - 类型 (success, error, info, warning)
   */
  showToast(message, type = 'info') {
    this.toastManager?.show(message, type);
  }

  /**
   * 显示确认对话框
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @returns {Promise<boolean>} 用户选择
   */
  async showConfirmDialog(title, message) {
    return this.modalManager?.showConfirm(title, message) ?? window.confirm(message);
  }

  /**
   * 打开编辑提示词模态框
   * @param {Object} prompt - 提示词对象
   * @param {Object} options - 选项
   */
  async openEditPromptModal(prompt, options = {}) {
    await this.promptDetailManager?.open(prompt, options);
  }

  /**
   * 生成唯一的时间戳标题
   * @returns {string} 唯一的时间戳字符串
   */
  generateUniqueTimestamp() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}${month}${day}_${hour}${minute}${second}_${ms}`;
  }

  /**
   * 加载提示词列表
   */
  async loadPrompts() {
    try {
      this.prompts = await window.electronAPI.getPrompts(this.promptSortBy, this.promptSortOrder);
      // 重建 ID 索引
      this.rebuildPromptIndex();
      // 同步到面板管理器
      if (this.promptPanelManager) {
        await this.promptPanelManager.render();
        await this.promptPanelManager.renderTagFilters();
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
      this.prompts = [];
      this.promptsById.clear();
      if (this.promptPanelManager) {
        await this.promptPanelManager.render();
        await this.promptPanelManager.renderTagFilters();
      }
    }
  }

  /**
   * 更新提示词编辑界面收藏按钮的 UI 状态
   * @param {boolean} isFavorite - 是否收藏
   */
  updatePromptFavoriteBtnUI(isFavorite) {
    const btn = document.getElementById('promptDetailFavoriteBtn');
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
  }

  /**
   * 打开图像详情模态框
   * @param {Object} image - 图像对象
   */
  async openImageDetailModal(image, options = {}) {
    await this.imageDetailManager?.open(image, options);
  }

  /**
   * 更新图像详情界面收藏按钮的 UI 状态
   * @param {boolean} isFavorite - 是否收藏
   */
  updateImageDetailFavoriteBtnUI(isFavorite) {
    const btn = document.getElementById('imageDetailFavoriteBtn');
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
  }

  /**
   * 渲染图像详情信息
   * @param {Object} image - 图像对象
   */
  async renderImageDetailInfo(image) {
    // 更新时间
    const updatedAtEl = document.getElementById('imageDetailUpdatedAt');
    if (updatedAtEl) {
      updatedAtEl.textContent = image.updatedAt ? new Date(image.updatedAt).toLocaleString() : '-';
    }

    // 上传时间
    const createdAtEl = document.getElementById('imageDetailCreatedAt');
    if (createdAtEl) {
      createdAtEl.textContent = image.createdAt ? new Date(image.createdAt).toLocaleString() : '-';
    }

    // 图像尺寸
    const dimensionsEl = document.getElementById('imageDetailDimensions');
    if (dimensionsEl) {
      dimensionsEl.textContent = image.width && image.height ? `${image.width} × ${image.height}` : '-';
    }

    // 文件大小
    const fileSizeEl = document.getElementById('imageDetailFileSize');
    if (fileSizeEl) {
      fileSizeEl.textContent = image.fileSize ? HtmlUtils.formatFileSize(image.fileSize) : '-';
    }

    // 设置图像 - 异步获取完整路径
    // 使用 relativePath（原图路径），与重构前一致
    const imgEl = document.getElementById('imageDetailImg');
    const imagePath = image.relativePath;
    if (imgEl && imagePath) {
      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        imgEl.src = `file://${fullPath.replace(/"/g, '&quot;')}`;
        imgEl.alt = image.fileName || '图像';

        // 绑定双击事件 - 打开全屏查看器
        imgEl.ondblclick = () => {
          // 使用当前快照中的图像列表
          const itemsSnapshot = this.imageDetailManager?.itemsSnapshot;
          if (itemsSnapshot && itemsSnapshot.length > 0) {
            // 找到当前图像在列表中的索引
            const currentIndex = itemsSnapshot.findIndex(i => isSameId(i.id, image.id));
            this.imageFullscreenManager.open(itemsSnapshot, currentIndex >= 0 ? currentIndex : 0);
          } else {
            // 如果没有快照，只显示当前图像
            const singleImage = [{
              id: image.id,
              relativePath: image.relativePath,
              fileName: image.fileName
            }];
            this.imageFullscreenManager.open(singleImage, 0);
          }
        };
      } catch (error) {
        console.error('Failed to load image:', error);
        imgEl.alt = '加载图像失败';
      }
    }
  }

  /**
   * 添加标签到提示词
   * @param {string} promptId - 提示词 ID
   * @param {string} tagName - 标签名称
   */
  async addTagToPrompt(promptId, tagName) {
    try {
      const prompt = this.prompts.find(p => isSameId(p.id, promptId));
      if (!prompt) {
        throw new Error('提示词不存在');
      }

      if (prompt.tags && prompt.tags.includes(tagName)) {
        throw new Error('该提示词已存在此标签');
      }

      const currentTags = prompt.tags ? [...prompt.tags] : [];
      currentTags.push(tagName);

      await window.electronAPI.updatePrompt(promptId, {
        tags: currentTags
      });

      prompt.tags = currentTags;

      // 重新渲染列表
      await this.promptPanelManager.refreshAfterUpdate();
      
      this.showToast('标签已添加', 'success');
    } catch (error) {
      console.error('Failed to add tag to prompt:', error);
      this.showToast(error.message, 'error');
    }
  }

  /**
   * 添加标签到图像
   * @param {string} imageId - 图像 ID
   * @param {string} tagName - 标签名称
   */
  async addTagToImage(imageId, tagName) {
    try {
      const img = this.images.find(i => isSameId(i.id, imageId));
      if (!img) {
        throw new Error('图像不存在');
      }

      if (img.tags && img.tags.includes(tagName)) {
        throw new Error('该图像已存在此标签');
      }

      const currentTags = img.tags ? [...img.tags] : [];
      currentTags.push(tagName);

      await window.electronAPI.updateImageTags(imageId, currentTags);

      img.tags = currentTags;

      // 重新渲染列表
      await this.imagePanelManager.refreshAfterUpdate();

      this.showToast('标签已添加', 'success');
    } catch (error) {
      console.error('Failed to add tag to image:', error);
      this.showToast(error.message, 'error');
    }
  }

  /**
   * 根据 ID 查找图像
   * 优先使用索引缓存，时间复杂度 O(1)
   * @param {string} id - 图像 ID
   * @param {Array} allImages - 图像列表（可选，用于兼容旧代码）
   * @returns {Object|null} 图像对象
   */
  findImageById(id, allImages = null) {
    // 优先使用索引缓存
    const cached = this.imagesById.get(String(id));
    if (cached) return cached;
    
    // 降级到数组查找（兼容旧代码）
    if (allImages) {
      return allImages.find(img => isSameId(img.id, id)) || null;
    }
    return null;
  }

  /**
   * 重建图像 ID 索引
   * 在图像数据更新后调用
   */
  rebuildImageIndex() {
    this.imagesById.clear();
    this.images.forEach(img => {
      if (img && img.id) {
        this.imagesById.set(String(img.id), img);
      }
    });
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(event, callback) {
    this.eventBus.on(event, callback);
  }

  /**
   * 取消订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    this.eventBus.off(event, callback);
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {any} data - 事件数据
   */
  emit(event, data) {
    this.eventBus.emit(event, data);
  }

  /**
   * 自动调整 textarea 高度
   * @param {HTMLTextAreaElement} textarea - 文本框元素
   */
  autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  /**
   * 根据 ID 查找提示词
   * 优先使用索引缓存，时间复杂度 O(1)
   * @param {string} id - 提示词 ID
   * @returns {Object|null} 提示词对象
   */
  findPromptById(id) {
    // 优先使用索引缓存
    const cached = this.promptsById.get(String(id));
    if (cached) return cached;
    
    // 降级到数组查找
    return this.prompts.find(p => isSameId(p.id, id)) || null;
  }

  /**
   * 重建提示词 ID 索引
   * 在提示词数据更新后调用
   */
  rebuildPromptIndex() {
    this.promptsById.clear();
    this.prompts.forEach(p => {
      if (p && p.id) {
        this.promptsById.set(String(p.id), p);
      }
    });
  }

  /**
   * 渲染提示词批量操作工具栏
   */
  renderPromptBatchOperationToolbar() {
    const toolbar = document.getElementById('promptBatchToolbar');
    if (!toolbar) return;

    const selectedCount = this.promptPanelManager?.selectedIds?.size || 0;
    
    if (selectedCount > 0) {
      toolbar.style.display = 'flex';
      const countEl = document.getElementById('promptBatchCount');
      if (countEl) {
        countEl.textContent = `已选择 ${selectedCount} 项`;
      }
    } else {
      toolbar.style.display = 'none';
    }
  }

  /**
   * 处理提示词项选择
   * @param {string} promptId - 提示词 ID
   * @param {number} index - 索引
   * @param {Event} e - 事件对象
   */
  /**
   * 切换到提示词管理器
   */
  switchToPromptManager() {
    this.navigationManager?.switchToPromptManager();
  }

  /**
   * 切换到图像管理器
   */
  switchToImageManager() {
    this.navigationManager?.switchToImageManager();
  }

  /**
   * 切换到统计页面
   */
  switchToStatistics() {
    this.navigationManager?.switchToStatistics();
  }

  /**
   * 渲染统计数据
   */
  async renderStatistics() {
    try {
      // 获取所有数据
      const prompts = await window.electronAPI.getPrompts();
      const images = await window.electronAPI.getImages();
      const tagGroups = await window.electronAPI.getTagGroups();

      // 根据当前视图模式过滤数据（safe 模式只显示 isSafe=1 的项目）
      const isSafeMode = this.viewMode === 'safe';
      const filteredPrompts = isSafeMode ? prompts.filter(p => p.isSafe !== 0) : prompts;
      const filteredImages = isSafeMode ? images.filter(i => i.isSafe !== 0) : images;

      // 提示词统计（基于过滤后的数据）
      const totalPrompts = filteredPrompts.length;
      const deletedPrompts = filteredPrompts.filter(p => p.isDeleted).length;
      const activePrompts = totalPrompts - deletedPrompts;
      const totalPromptTags = tagGroups.reduce((sum, group) => sum + (group.tags ? group.tags.length : 0), 0);

      // 图像统计（基于过滤后的数据）
      const totalImages = filteredImages.length;
      const deletedImages = filteredImages.filter(i => i.isDeleted).length;
      const favoriteImages = filteredImages.filter(i => i.isFavorite).length;
      const unreferencedImages = filteredImages.filter(i => !i.referencedBy || i.referencedBy.length === 0).length;
      const totalImageTags = filteredImages.reduce((sum, img) => sum + (img.tags ? img.tags.length : 0), 0);

      // 更新 DOM
      this.updateStatElement('statPromptsTotal', totalPrompts);
      this.updateStatElement('statPromptsDeleted', deletedPrompts);
      this.updateStatElement('statPromptsActive', activePrompts);
      this.updateStatElement('statPromptTagGroups', tagGroups.length);
      this.updateStatElement('statPromptTagsTotal', totalPromptTags);

      this.updateStatElement('statImagesTotal', totalImages);
      this.updateStatElement('statImagesDeleted', deletedImages);
      this.updateStatElement('statImagesFavorite', favoriteImages);
      this.updateStatElement('statImagesUnreferenced', unreferencedImages);
      this.updateStatElement('statImageTagsTotal', totalImageTags);
    } catch (error) {
      console.error('Failed to render statistics:', error);
    }
  }

  /**
   * 更新统计数字
   */
  updateStatElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  /**
   * 打开设置模态框
   */
  async openSettingsModal() {
    // 获取当前数据路径
    try {
      const dataPath = await window.electronAPI.getDataPath();
      document.getElementById('currentDataPath').textContent = dataPath;
    } catch (error) {
      console.error('Failed to get data path:', error);
      document.getElementById('currentDataPath').textContent = '获取失败';
    }

    this.modalManager?.openSettings();
  }

  /**
   * 关闭设置模态框
   */
  closeSettingsModal() {
    this.modalManager?.closeSettings();
  }

  /**
   * 添加图像到当前提示词
   * @param {Object} selectedImage - 选择的图像
   */
  async addImageToCurrentPrompt(selectedImage) {
    // 添加到当前提示词的图像列表
    if (!this.currentImages) {
      this.currentImages = [];
    }

    // 检查是否已存在
    if (!this.currentImages.some(img => isSameId(img.id, selectedImage.id))) {
      this.currentImages.push({
        id: selectedImage.id,
        path: selectedImage.path,
        isExisting: true // 标记为已存在的图像
      });
      this.renderImagePreviews();
      this.showToast('Image added');

      // 立即保存到数据库
      const promptId = document.getElementById('promptId').value;
      if (promptId) {
        await this.savePromptField('images', this.currentImages);
      }
    } else {
      this.showToast('Image already exists', 'info');
    }
  }

  /**
   * 渲染图像预览
   */
  async renderImagePreviews() {
    const container = document.getElementById('imagePreviewList');
    if (!container) return;

    // 获取所有图像的完整信息
    const allImages = await window.electronAPI.getImages();

    // 过滤掉没有 ID 的图像
    const validImages = this.currentImages.filter(img => img.id);

    // 获取所有图像的完整路径并渲染
    const previews = await Promise.all(
      validImages.map(async (imgRef, index) => {
        const img = this.findImageById(imgRef.id, allImages);
        if (!img) return '';
        const imagePath = await window.electronAPI.getImagePath(img.relativePath || img.thumbnailPath);
        const isSecondary = this.isSecondaryPromptDetail;

        // 生成标签 HTML（使用展示标签样式）
        const tagsHtml = this.generateTagsHtml(img.tags, 'tag-display', 'tag-display-empty');

        return `
          <div class="image-preview-item" data-index="${index}">
            <img src="file://${imagePath}" alt="${img.fileName}">
            <div class="image-preview-tags">
              ${tagsHtml}
            </div>
            <button type="button" class="view-image ${isSecondary ? 'disabled-secondary' : ''}" data-index="${index}" data-image-id="${img.id}" title="${isSecondary ? '在图像管理查看' : '查看'}" ${isSecondary ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button type="button" class="remove-image" data-index="${index}" title="删除">×</button>
          </div>
        `;
      })
    );

    container.innerHTML = previews.filter(p => p).join('');

    // 绑定删除事件
    container.querySelectorAll('.remove-image').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        
        // 获取图像信息用于显示
        const allImages = await window.electronAPI.getImages();
        const imgRef = this.currentImages[index];
        const img = imgRef ? this.findImageById(imgRef.id, allImages) : null;
        
        // 显示确认对话框
        const confirmed = await this.showConfirmDialog('确认移除', '确定要从当前提示词中移除此图像吗？\n图像本身不会被删除。');
        if (!confirmed) return;

        // 只从当前列表中移除引用，不删除实际文件
        this.currentImages.splice(index, 1);
        this.renderImagePreviews();

        // 立即保存到数据库
        const promptId = document.getElementById('promptId').value;
        if (promptId) {
          await this.savePromptField('images', this.currentImages);
        }
      });
    });

    // 绑定查看事件
    container.querySelectorAll('.view-image').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const imageId = btn.dataset.imageId;
        // 打开图像详情
        const image = this.images.find(i => isSameId(i.id, imageId));
        if (image) {
          this.openImageDetailModal(image);
        }
      });
    });

    // 绑定右键菜单事件（设为首图）
    container.querySelectorAll('.image-preview-item').forEach(item => {
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const index = parseInt(item.dataset.index);
        if (index === 0) return; // 已经是首图

        // 创建右键菜单
        this.imageContextMenuManager.show(e.clientX, e.clientY, index);
      });
    });

    // 绑定双击事件（全屏查看）
    container.querySelectorAll('.image-preview-item img').forEach(img => {
      img.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const item = img.closest('.image-preview-item');
        const index = parseInt(item.dataset.index);
        this.imageFullscreenManager.open(this.currentImages, index);
      });
    });
  }

  /**
   * 显示图像右键菜单
   * @param {number} x - 菜单 X 坐标
   * @param {number} y - 菜单 Y 坐标
   * @param {number} imageIndex - 图像索引
   */
  /**
   * 根据 ID 查找图像
   * @param {string} id - 图像 ID
   * @param {Array} allImages - 所有图像列表
   * @returns {Object|undefined} - 图像对象
   */
  findImageById(id, allImages) {
    return allImages.find(img => String(img.id) === String(id));
  }

  /**
   * 生成标签 HTML
   * @param {Array} tags - 标签列表
   * @param {string} className - 标签样式类名
   * @param {string} emptyClassName - 空标签样式类名
   * @returns {string} - HTML 字符串
   */
  generateTagsHtml(tags, className, emptyClassName) {
    if (!tags || tags.length === 0) {
      return `<span class="${emptyClassName}">无标签</span>`;
    }
    return tags.map(tag => `<span class="${className}">${tag}</span>`).join('');
  }

  /**
   * 保存提示词字段
   * @param {string} field - 字段名
   * @param {any} value - 字段值
   */
  async savePromptField(field, value) {
    const promptIdEl = document.getElementById('promptId');
    const promptId = promptIdEl ? promptIdEl.value : null;

    if (!promptId) {
      console.error('[savePromptField] Prompt ID not found');
      return;
    }

    const updateData = {};
    // 对于 images 字段，需要深拷贝数组，避免对象引用污染
    if (field === 'images') {
      updateData[field] = value ? value.map(img => ({ ...img })) : [];
    } else {
      updateData[field] = value;
    }

    await window.electronAPI.updatePrompt(promptId, updateData);

    // 更新本地数据
    if (this.prompts) {
      const prompt = this.prompts.find(p => String(p.id) === String(promptId));
      if (prompt) {
        Object.assign(prompt, updateData);
      }
    }

    // 刷新主界面显示
    if (this.promptPanelManager) {
      await this.promptPanelManager.refreshAfterUpdate();
    }
  }

  /**
   * 打开提示词标签管理器模态框
   */
  async openPromptTagManagerModal() {
    this.modalManager?.openPromptTagManager();
    await this.tagRegistry.render();
  }

  /**
   * 关闭提示词标签管理器模态框
   */
  closePromptTagManagerModal() {
    this.modalManager?.closePromptTagManager();
  }



  /**
   * 打开图像标签管理器模态框
   */
  openImageTagManagerModal() {
    this.modalManager?.openImageTagManager();
    this.imageTagRegistry.render();
  }

  /**
   * 关闭图像标签管理器模态框
   */
  closeImageTagManagerModal() {
    this.modalManager?.closeImageTagManager();
  }

  /**
   * 更新提示词视图按钮状态
   * @param {string} mode - 视图模式 (grid, list, list-compact)
   */
  updatePromptViewButtons(mode) {
    const gridBtn = document.getElementById('promptGridViewBtn');
    const listBtn = document.getElementById('promptListViewBtn');
    const compactBtn = document.getElementById('promptCompactViewBtn');
    const promptList = document.getElementById('promptList');
    const promptListView = document.getElementById('promptListView');
    const cardSizeSlider = document.getElementById('promptCardSizeSlider');
    const cardSizeSliderContainer = cardSizeSlider?.closest('.thumbnail-size-slider');

    // 更新按钮状态
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
    if (listBtn) listBtn.classList.toggle('active', mode === 'list');
    if (compactBtn) compactBtn.classList.toggle('active', mode === 'list-compact');

    // 更新容器显示状态
    if (mode === 'grid') {
      if (promptList) promptList.style.display = 'grid';
      if (promptListView) promptListView.style.display = 'none';
      // 显示卡片尺寸滑杆
      if (cardSizeSliderContainer) {
        cardSizeSliderContainer.style.display = 'flex';
      }
    } else {
      if (promptList) promptList.style.display = 'none';
      if (promptListView) promptListView.style.display = 'flex';
      // 隐藏卡片尺寸滑杆（列表视图不需要）
      if (cardSizeSliderContainer) {
        cardSizeSliderContainer.style.display = 'none';
      }
    }
  }

  /**
   * 更新图像视图按钮状态
   * @param {string} mode - 视图模式 (grid, list, list-compact)
   */
  updateImageViewButtons(mode) {
    const gridBtn = document.getElementById('imageGridViewBtn');
    const listBtn = document.getElementById('imageListViewBtn');
    const compactBtn = document.getElementById('imageCompactViewBtn');
    const imageGrid = document.getElementById('imageGrid');
    const imageList = document.getElementById('imageList');
    const imageCardSizeSlider = document.getElementById('imageCardSizeSlider');
    const imageCardSizeSliderContainer = imageCardSizeSlider?.closest('.thumbnail-size-slider');

    // 更新按钮状态
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
    if (listBtn) listBtn.classList.toggle('active', mode === 'list');
    if (compactBtn) compactBtn.classList.toggle('active', mode === 'list-compact');

    // 更新容器显示状态
    if (mode === 'grid') {
      if (imageGrid) imageGrid.style.display = 'grid';
      if (imageList) imageList.style.display = 'none';
      // 显示缩略图尺寸滑杆
      if (imageCardSizeSliderContainer) {
        imageCardSizeSliderContainer.style.display = 'flex';
      }
    } else {
      if (imageGrid) imageGrid.style.display = 'none';
      if (imageList) imageList.style.display = 'flex';
      // 隐藏缩略图尺寸滑杆（列表视图不需要）
      if (imageCardSizeSliderContainer) {
        imageCardSizeSliderContainer.style.display = 'none';
      }
    }
  }

  /**
   * 切换标签筛选收起/展开（通用）
   * @param {string} sectionId - 标签筛选区域ID
   * @param {string} storageKey - localStorage存储键
   */
  toggleTagFilter(sectionId, storageKey) {
    const tagFilterSection = document.getElementById(sectionId);
    if (tagFilterSection) {
      tagFilterSection.classList.toggle('collapsed');
      const collapsed = tagFilterSection.classList.contains('collapsed');
      localStorage.setItem(storageKey, collapsed);
      // 只通过图标和CSS类表示状态，不显示文字
    }
  }

  /**
   * 切换提示词标签筛选收起/展开
   */
  async togglePromptTagFilter() {
    this.toggleTagFilter('promptTagFilterSection', 'promptTagFilterCollapsed');
    // 刷新标签筛选器以确保计数最新
    if (this.promptPanelManager) {
      await this.promptPanelManager.renderTagFilters();
    }
  }

  /**
   * 切换图像标签筛选收起/展开
   */
  async toggleImageTagFilter() {
    this.toggleTagFilter('imageTagFilterSection', 'imageTagFilterCollapsed');
    // 刷新标签筛选器以确保计数最新
    if (this.imagePanelManager) {
      await this.imagePanelManager.renderTagFilters();
    }
  }

  /**
   * 关闭确认对话框
   */
  closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
      modal.style.display = 'none';
    }
    if (this.confirmResolve) {
      this.confirmResolve(false);
      this.confirmResolve = null;
    }
  }

  /**
   * 显示输入对话框
   * @param {string} title - 对话框标题
   * @param {string} label - 输入标签文本
   * @param {string} defaultValue - 默认值
   * @param {Object} options - 选项
   * @returns {Promise<string|null|Object>} - 用户输入的内容，取消返回 null
   */
  showInputDialog(title, label, defaultValue = '', options = {}) {
    return this.modalManager?.showInput(title, label, defaultValue, options) ?? Promise.resolve(null);
  }

  /**
   * 关闭输入对话框
   */
  closeInputModal() {
    this.modalManager?.closeInput();
  }

  /**
   * 关闭选择对话框
   */
  closeSelectModal() {
    this.modalManager?.closeSelect();
  }

  handlePromptItemSelection(promptId, index, e) {
    if (!this.promptPanelManager) return;

    const { selectedIds } = this.promptPanelManager;

    if (e.shiftKey && this.promptPanelManager.lastSelectedIndex !== -1) {
      // Shift 点击：选择范围
      const start = Math.min(this.promptPanelManager.lastSelectedIndex, index);
      const end = Math.max(this.promptPanelManager.lastSelectedIndex, index);

      const filtered = this.promptPanelManager.filteredPrompts;
      for (let i = start; i <= end; i++) {
        const item = filtered[i];
        if (item) {
          selectedIds.add(item.id);
        }
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd 点击：切换单个
      if (selectedIds.has(promptId)) {
        selectedIds.delete(promptId);
      } else {
        selectedIds.add(promptId);
      }
    } else {
      // 普通点击：单选
      selectedIds.clear();
      selectedIds.add(promptId);
    }

    this.promptPanelManager.lastSelectedIndex = index;
    this.promptPanelManager.render();
    this.renderPromptBatchOperationToolbar();
  }
}

// 初始化应用
const app = new PromptManager();
window.app = app;

// DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

export default PromptManager;
