/**
 * 重构版应用主类
 * 作为协调器，整合各个面板管理器
 */
import { Constants } from './constants.js';
import SafeRatingService from './services/SafeRatingService.js';
import { PromptPanelManager, ImagePanelManager, TagRenderer, TagManager, TrashManager, BatchOperationsManager, PromptTagManager, ImageTagManager, SimpleTagManager } from './managers/index.js';
import { EventBus, HoverTooltipManager, FieldChangeTracker, SaveManager, ListNavigator, ShortcutManager } from './utils/index.js';
import { EditableTagList } from './components/index.js';

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
    // 从 localStorage 加载 viewMode（在创建面板管理器之前）
    this.viewMode = localStorage.getItem('viewMode') || 'safe';
    this.searchQuery = '';
    this.selectedTags = new Set();
    this.selectedImageTags = [];
    this.imageSearchQuery = '';

    // 标签管理排序状态
    this.promptTagSortBy = localStorage.getItem('promptTagSortBy') || 'count';
    this.promptTagSortOrder = localStorage.getItem('promptTagSortOrder') || 'desc';
    this.imageTagSortBy = localStorage.getItem('imageTagSortBy') || 'count';
    this.imageTagSortOrder = localStorage.getItem('imageTagSortOrder') || 'desc';

    // 标签管理器（重构后）
    this.promptTagManager = null;
    this.imageTagManager = null;

    // 事件总线
    this.eventBus = new EventBus();
    
    // 服务
    this.safeRatingService = new SafeRatingService();
    
    // 面板管理器（初始化后赋值）
    this.promptPanelManager = null;
    this.imagePanelManager = null;
    this.tagManager = null;
    this.trashManager = null;
    this.batchOpsManager = null;
    this.shortcutManager = null;
    
    // 当前面板状态
    this.currentPanel = 'prompt'; // 默认打开提示词面板
    
    // UI 组件
    this.hoverTooltip = null;
    this.promptHoverTooltip = null;
    
    // 编辑相关
    this.promptSaveManager = null;
    this.promptChangeTracker = null;
    this.promptNavigator = null;
    this.imageSaveManager = null;
    this.imageChangeTracker = null;
    this.imageNavigator = null;
    
    // 图标
    this.ICONS = {
      favorite: {
        outline: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
        filled: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>'
      },
      delete: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
      copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'
    };
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
      this.restorePanelState();
    } catch (error) {
      console.error('Failed to initialize application:', error);
      this.showToast('应用初始化失败', 'error');
    }
  }

  /**
   * 恢复主题
   */
  restoreTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
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
    // 初始化标签管理器
    this.tagManager = new TagManager({
      app: this,
      eventBus: this.eventBus
    });
    await this.tagManager.init();

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

    // 初始化标签管理器（重构后）
    this.promptTagManager = new PromptTagManager(this);
    this.imageTagManager = new ImageTagManager(this);

    // 初始化提示词面板管理器
    this.promptPanelManager = new PromptPanelManager({
      app: this,
      tagManager: this.tagManager,
      saveManager: null,
      eventBus: this.eventBus
    });

    // 初始化图像面板管理器
    this.imagePanelManager = new ImagePanelManager({
      app: this,
      tagManager: this.tagManager,
      eventBus: this.eventBus
    });

    // 执行初始化
    await this.promptPanelManager.init();
    await this.imagePanelManager.init();
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
    // 侧边栏收起/展开
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('sidebar');
    if (toggleSidebarBtn && sidebar) {
      toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        toggleSidebarBtn.title = isCollapsed ? '展开侧边栏' : '收起侧边栏';
        localStorage.setItem('sidebarCollapsed', isCollapsed);
      });

      // 恢复侧边栏状态
      const savedState = localStorage.getItem('sidebarCollapsed');
      if (savedState === 'true') {
        sidebar.classList.add('collapsed');
        toggleSidebarBtn.title = '展开侧边栏';
      }
    }

    // 侧边栏导航按钮
    document.getElementById('promptManagerBtn')?.addEventListener('click', () => {
      this.switchToPromptManager();
    });

    document.getElementById('imageManagerBtn')?.addEventListener('click', () => {
      this.switchToImageManager();
    });

    document.getElementById('statisticsBtn')?.addEventListener('click', () => {
      this.switchToStatistics();
    });

    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      this.openSettingsModal();
    });

    // 刷新按钮
    document.getElementById('reloadBtn')?.addEventListener('click', () => {
      this.refreshData();
    });

    // 重启按钮
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
      this.relaunchApp();
    });

    // 提示词工具栏按钮
    document.getElementById('addBtn')?.addEventListener('click', () => {
      this.openNewPromptPage();
    });

    document.getElementById('recycleBinBtn')?.addEventListener('click', () => {
      this.openRecycleBinModal();
    });

    document.getElementById('closeRecycleBinModal')?.addEventListener('click', () => {
      this.closeRecycleBinModal();
    });

    document.getElementById('emptyRecycleBinBtn')?.addEventListener('click', () => {
      this.emptyRecycleBin();
    });

    // 搜索框
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.promptPanelManager.renderList();
        // 显示/隐藏清空按钮
        if (clearSearchBtn) {
          clearSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        this.promptPanelManager.renderList();
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
      });
    }

    // 图像工具栏按钮
    document.getElementById('uploadImageBtn')?.addEventListener('click', () => {
      this.openUploadImageModal();
    });

    document.getElementById('imageRecycleBinBtn')?.addEventListener('click', () => {
      this.openImageRecycleBinModal();
    });

    document.getElementById('closeImageRecycleBinModal')?.addEventListener('click', () => {
      this.closeImageRecycleBinModal();
    });

    document.getElementById('emptyImageRecycleBinBtn')?.addEventListener('click', () => {
      this.emptyImageRecycleBin();
    });

    // 绑定图像上传事件
    this.bindImageUploadEvents();

    // 图像搜索框
    const imageSearchInput = document.getElementById('imageSearchInput');
    const clearImageSearchBtn = document.getElementById('clearImageSearchBtn');
    
    if (imageSearchInput) {
      imageSearchInput.addEventListener('input', (e) => {
        this.imageSearchQuery = e.target.value;
        this.imagePanelManager.renderGrid();
        if (clearImageSearchBtn) {
          clearImageSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    
    if (clearImageSearchBtn) {
      clearImageSearchBtn.addEventListener('click', () => {
        imageSearchInput.value = '';
        this.imageSearchQuery = '';
        this.imagePanelManager.renderGrid();
        clearImageSearchBtn.style.display = 'none';
        imageSearchInput.focus();
      });
    }

    // 清除标签筛选
    document.getElementById('clearTagFilter')?.addEventListener('click', () => {
      this.promptPanelManager.clearTagFilter();
    });

    document.getElementById('clearImageTagFilter')?.addEventListener('click', () => {
      this.imagePanelManager.clearTagFilter();
    });

    // 标签管理按钮
    document.getElementById('promptTagManagerBtn')?.addEventListener('click', () => {
      this.openPromptTagManagerModal();
    });

    document.getElementById('imageTagManagerBtn')?.addEventListener('click', () => {
      this.openImageTagManagerModal();
    });

    // 视图切换按钮
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

    // 图像标签筛选排序
    const imageTagFilterSortSelect = document.getElementById('imageTagFilterSortSelect');
    if (imageTagFilterSortSelect) {
      // 初始化排序选择器的值
      imageTagFilterSortSelect.value = `${this.imagePanelManager.tagFilterSortBy}-${this.imagePanelManager.tagFilterSortOrder}`;

      imageTagFilterSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imagePanelManager.tagFilterSortBy = sortBy;
        this.imagePanelManager.tagFilterSortOrder = sortOrder;
        localStorage.setItem('imageTagFilterSortBy', sortBy);
        localStorage.setItem('imageTagFilterSortOrder', sortOrder);
        this.imagePanelManager.renderTagFilters();
      });
    }

    // 图像标签筛选排序逆序按钮
    const imageTagFilterOrderBtn = document.getElementById('imageTagFilterOrderBtn');
    if (imageTagFilterOrderBtn) {
      imageTagFilterOrderBtn.addEventListener('click', () => {
        const newOrder = this.imagePanelManager.tagFilterSortOrder === 'asc' ? 'desc' : 'asc';
        this.imagePanelManager.tagFilterSortOrder = newOrder;
        localStorage.setItem('imageTagFilterSortOrder', newOrder);
        if (imageTagFilterSortSelect) {
          imageTagFilterSortSelect.value = `${this.imagePanelManager.tagFilterSortBy}-${newOrder}`;
        }
        this.imagePanelManager.renderTagFilters();
      });
    }

    // 提示词标签筛选排序
    const promptTagFilterSortSelect = document.getElementById('promptTagFilterSortSelect');
    if (promptTagFilterSortSelect) {
      // 初始化排序选择器的值
      promptTagFilterSortSelect.value = `${this.promptPanelManager.tagFilterSortBy}-${this.promptPanelManager.tagFilterSortOrder}`;

      promptTagFilterSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.promptPanelManager.tagFilterSortBy = sortBy;
        this.promptPanelManager.tagFilterSortOrder = sortOrder;
        localStorage.setItem('promptTagFilterSortBy', sortBy);
        localStorage.setItem('promptTagFilterSortOrder', sortOrder);
        this.promptPanelManager.renderTagFilters();
      });
    }

    // 提示词标签筛选排序逆序按钮
    const promptTagFilterOrderBtn = document.getElementById('promptTagFilterOrderBtn');
    if (promptTagFilterOrderBtn) {
      promptTagFilterOrderBtn.addEventListener('click', () => {
        const newOrder = this.promptPanelManager.tagFilterSortOrder === 'asc' ? 'desc' : 'asc';
        this.promptPanelManager.tagFilterSortOrder = newOrder;
        localStorage.setItem('promptTagFilterSortOrder', newOrder);
        if (promptTagFilterSortSelect) {
          promptTagFilterSortSelect.value = `${this.promptPanelManager.tagFilterSortBy}-${newOrder}`;
        }
        this.promptPanelManager.renderTagFilters();
      });
    }

    // 标签筛选收起/展开
    document.getElementById('tagFilterToggleBtn')?.addEventListener('click', () => {
      this.togglePromptTagFilter();
    });

    document.getElementById('toggleImageTagFilterBtn')?.addEventListener('click', () => {
      this.toggleImageTagFilter();
    });

    // 恢复标签筛选收起/展开状态
    const savedPromptTagFilterCollapsed = localStorage.getItem('promptTagFilterCollapsed');
    if (savedPromptTagFilterCollapsed === 'true') {
      const tagFilterSection = document.getElementById('promptTagFilterSection');
      const toggleBtn = document.getElementById('tagFilterToggleBtn');
      if (tagFilterSection && toggleBtn) {
        tagFilterSection.classList.add('collapsed');
        toggleBtn.textContent = '展开标签';
      }
    }

    const savedImageTagFilterCollapsed = localStorage.getItem('imageTagFilterCollapsed');
    if (savedImageTagFilterCollapsed === 'true') {
      const tagFilterSection = document.getElementById('imageTagFilterSection');
      const toggleBtn = document.getElementById('toggleImageTagFilterBtn');
      if (tagFilterSection && toggleBtn) {
        tagFilterSection.classList.add('collapsed');
        toggleBtn.textContent = '展开标签';
      }
    }

    // 模态框关闭按钮
    const closeBtn = document.getElementById('closeEditModalBtn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.closeEditModal();
      };
    }

    // 编辑导航按钮 - 事件监听器在 initPromptNavigator 中通过 ListNavigator 绑定
    // 这里不需要重复绑定，避免事件监听器累积

    // 提示词排序
    const promptSortSelect = document.getElementById('promptSortSelect');
    if (promptSortSelect) {
      // 初始化排序选择器的值
      promptSortSelect.value = `${this.promptPanelManager.sortBy}-${this.promptPanelManager.sortOrder}`;
      
      promptSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.promptPanelManager.sortBy = sortBy;
        this.promptPanelManager.sortOrder = sortOrder;
        localStorage.setItem('promptSortBy', sortBy);
        localStorage.setItem('promptSortOrder', sortOrder);
        this.promptPanelManager.renderList();
      });
    }

    // 提示词排序逆序按钮
    const promptSortReverseBtn = document.getElementById('promptSortReverseBtn');
    if (promptSortReverseBtn) {
      promptSortReverseBtn.addEventListener('click', () => {
        const newOrder = this.promptPanelManager.sortOrder === 'asc' ? 'desc' : 'asc';
        this.promptPanelManager.sortOrder = newOrder;
        localStorage.setItem('promptSortOrder', newOrder);
        if (promptSortSelect) {
          promptSortSelect.value = `${this.promptPanelManager.sortBy}-${newOrder}`;
        }
        this.promptPanelManager.renderList();
      });
    }

    // 提示词卡片大小滑杆
    const promptCardSizeSlider = document.getElementById('promptCardSizeSlider');
    if (promptCardSizeSlider) {
      // 初始化滑杆值
      promptCardSizeSlider.value = this.promptPanelManager.cardSize;
      this.promptPanelManager.setCardSize(this.promptPanelManager.cardSize);

      // 监听滑杆变化
      promptCardSizeSlider.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        this.promptPanelManager.setCardSize(size);
      });

      // 保存最终值
      promptCardSizeSlider.addEventListener('change', (e) => {
        localStorage.setItem('promptCardSize', e.target.value);
      });
    }

    // 图像排序
    const imageSortSelect = document.getElementById('imageSortSelect');
    if (imageSortSelect) {
      // 初始化排序选择器的值
      imageSortSelect.value = `${this.imagePanelManager.sortBy}-${this.imagePanelManager.sortOrder}`;

      imageSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imagePanelManager.sortBy = sortBy;
        this.imagePanelManager.sortOrder = sortOrder;
        localStorage.setItem('imageSortBy', sortBy);
        localStorage.setItem('imageSortOrder', sortOrder);
        this.imagePanelManager.renderGrid();
      });
    }

    // 图像排序逆序按钮
    const imageSortReverseBtn = document.getElementById('imageSortReverseBtn');
    if (imageSortReverseBtn) {
      imageSortReverseBtn.addEventListener('click', () => {
        const newOrder = this.imagePanelManager.sortOrder === 'asc' ? 'desc' : 'asc';
        this.imagePanelManager.sortOrder = newOrder;
        localStorage.setItem('imageSortOrder', newOrder);
        if (imageSortSelect) {
          imageSortSelect.value = `${this.imagePanelManager.sortBy}-${newOrder}`;
        }
        this.imagePanelManager.renderGrid();
      });
    }

    // 图像卡片大小滑杆
    const thumbnailSizeSlider = document.getElementById('thumbnailSizeSlider');
    if (thumbnailSizeSlider) {
      // 初始化滑杆值
      thumbnailSizeSlider.value = this.imagePanelManager.cardSize;
      this.imagePanelManager.setCardSize(this.imagePanelManager.cardSize);

      // 监听滑杆变化
      thumbnailSizeSlider.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        this.imagePanelManager.setCardSize(size);
      });

      // 保存最终值
      thumbnailSizeSlider.addEventListener('change', (e) => {
        localStorage.setItem('imageCardSize', e.target.value);
      });
    }

    // 确认对话框
    document.getElementById('closeConfirmModal')?.addEventListener('click', () => {
      this.closeConfirmModal();
    });

    document.getElementById('confirmCancelBtn')?.addEventListener('click', () => {
      this.closeConfirmModal();
    });

    document.getElementById('confirmOkBtn')?.addEventListener('click', () => {
      this.handleConfirmOk();
    });

    // 输入对话框
    document.getElementById('closeInputModal')?.addEventListener('click', () => {
      this.closeInputModal();
    });

    document.getElementById('inputCancelBtn')?.addEventListener('click', () => {
      this.closeInputModal();
    });

    document.getElementById('inputOkBtn')?.addEventListener('click', () => {
      this.handleInputOk();
    });

    // 选择对话框
    document.getElementById('closeSelectModal')?.addEventListener('click', () => {
      this.closeSelectModal();
    });

    document.getElementById('selectCancelBtn')?.addEventListener('click', () => {
      this.closeSelectModal();
    });

    document.getElementById('selectOkBtn')?.addEventListener('click', () => {
      this.handleSelectOk();
    });

    // 设置模态框按钮
    document.getElementById('closeSettingsModal')?.addEventListener('click', () => {
      this.closeSettingsModal();
    });

    document.getElementById('changeDataPathBtn')?.addEventListener('click', () => {
      this.changeDataPath();
    });

    document.getElementById('importBtn')?.addEventListener('click', () => {
      this.importPrompts();
    });

    document.getElementById('exportBtn')?.addEventListener('click', () => {
      this.exportPrompts();
    });

    document.getElementById('exportOrphanFilesBtn')?.addEventListener('click', () => {
      this.exportOrphanFiles();
    });

    document.getElementById('clearAllDataBtn')?.addEventListener('click', () => {
      this.clearAllData();
    });

    // 内容显示模式设置
    const viewModeSelect = document.getElementById('viewModeSelect');
    if (viewModeSelect) {
      // 设置下拉框的初始值（viewMode 已在构造函数中从 localStorage 加载）
      viewModeSelect.value = this.viewMode;
      
      // 监听变化
      viewModeSelect.addEventListener('change', () => {
        this.viewMode = viewModeSelect.value;
        localStorage.setItem('viewMode', this.viewMode);
        this.showToast(this.viewMode === 'safe' ? '已切换到安全模式' : '已切换到 NSFW 模式');
        // 刷新显示
        this.promptPanelManager.viewMode = this.viewMode;
        this.imagePanelManager.viewMode = this.viewMode;
        this.promptPanelManager.renderList();
        this.imagePanelManager.renderGrid();
        // 刷新标签筛选
        this.promptPanelManager.renderTagFilters();
        this.imagePanelManager.renderTagFilters();
      });
    }

    // 主题切换
    document.getElementById('settingsThemeToggle')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // 提示词标签管理模态框
    document.getElementById('closePromptTagManagerModal')?.addEventListener('click', () => {
      this.closePromptTagManagerModal();
    });

    // 提示词标签组管理
    document.getElementById('addPromptTagGroupBtn')?.addEventListener('click', () => {
      this.openTagGroupEditModal('prompt');
    });

    // 提示词标签管理 - 新建标签
    document.getElementById('addPromptTagInManagerBtn')?.addEventListener('click', () => {
      this.promptTagManager.addTagInManager();
    });

    // 标签管理搜索
    const tagManagerSearchInput = document.getElementById('tagManagerSearchInput');
    const clearTagManagerSearchBtn = document.getElementById('clearTagManagerSearchBtn');
    if (tagManagerSearchInput) {
      tagManagerSearchInput.addEventListener('input', (e) => {
        this.promptTagManager.render(e.target.value);
        if (clearTagManagerSearchBtn) {
          clearTagManagerSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    if (clearTagManagerSearchBtn) {
      clearTagManagerSearchBtn.addEventListener('click', () => {
        tagManagerSearchInput.value = '';
        this.promptTagManager.render('');
        clearTagManagerSearchBtn.style.display = 'none';
        tagManagerSearchInput.focus();
      });
    }

    // 提示词标签排序
    const tagManagerSortSelect = document.getElementById('tagManagerSortSelect');
    const tagManagerOrderBtn = document.getElementById('tagManagerOrderBtn');
    if (tagManagerSortSelect) {
      // 初始化排序选择器的值
      tagManagerSortSelect.value = `${this.promptTagManager.sortBy}-${this.promptTagManager.sortOrder}`;
      tagManagerSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.promptTagManager.setSort(sortBy, sortOrder);
        this.promptTagManager.render(tagManagerSearchInput ? tagManagerSearchInput.value : '');
      });
    }
    if (tagManagerOrderBtn && tagManagerSortSelect) {
      tagManagerOrderBtn.addEventListener('click', () => {
        const newOrder = this.promptTagManager.toggleSortOrder();
        tagManagerSortSelect.value = `${this.promptTagManager.sortBy}-${newOrder}`;
        this.promptTagManager.render(tagManagerSearchInput ? tagManagerSearchInput.value : '');
      });
    }

    // 标签组编辑模态框
    document.getElementById('closeTagGroupEditModal')?.addEventListener('click', () => {
      this.closeTagGroupEditModal();
    });
    document.getElementById('cancelTagGroupEditBtn')?.addEventListener('click', () => {
      this.closeTagGroupEditModal();
    });
    document.getElementById('saveTagGroupBtn')?.addEventListener('click', () => {
      this.saveTagGroup();
    });

    // ==================== 图像标签管理事件绑定 ====================

    // 关闭图像标签管理模态框
    document.getElementById('closeImageTagManagerModal')?.addEventListener('click', () => {
      this.closeImageTagManagerModal();
    });

    // 关闭图像详情模态框
    document.getElementById('closeImageDetailBtn')?.addEventListener('click', () => {
      this.closeImageDetailModal();
    });

    // 图像详情 - 收藏按钮
    document.getElementById('imageDetailFavoriteBtn')?.addEventListener('click', async () => {
      if (this.currentImage) {
        const newFavorite = !this.currentImage.isFavorite;
        await this.toggleImageFavorite(this.currentImage.id, newFavorite);
        this.currentImage.isFavorite = newFavorite;
        this.updateImageDetailFavoriteBtnUI(newFavorite);
      }
    });

    // 图像标签管理 - 新建组
    document.getElementById('addImageTagGroupBtn')?.addEventListener('click', () => {
      this.openTagGroupEditModal('image');
    });

    // 图像标签管理 - 新建标签
    document.getElementById('addImageTagInManagerBtn')?.addEventListener('click', () => {
      this.imageTagManager.addTagInManager();
    });

    // 图像标签管理搜索
    const imageTagManagerSearchInput = document.getElementById('imageTagManagerSearchInput');
    const clearImageTagManagerSearchBtn = document.getElementById('clearImageTagManagerSearchBtn');
    if (imageTagManagerSearchInput) {
      imageTagManagerSearchInput.addEventListener('input', (e) => {
        this.imageTagManager.render(e.target.value);
        if (clearImageTagManagerSearchBtn) {
          clearImageTagManagerSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    if (clearImageTagManagerSearchBtn) {
      clearImageTagManagerSearchBtn.addEventListener('click', () => {
        imageTagManagerSearchInput.value = '';
        this.imageTagManager.render('');
        clearImageTagManagerSearchBtn.style.display = 'none';
        imageTagManagerSearchInput.focus();
      });
    }

    // 图像标签排序
    const imageTagManagerSortSelect = document.getElementById('imageTagManagerSortSelect');
    const imageTagManagerOrderBtn = document.getElementById('imageTagManagerOrderBtn');
    if (imageTagManagerSortSelect) {
      // 初始化排序选择器的值
      imageTagManagerSortSelect.value = `${this.imageTagManager.sortBy}-${this.imageTagManager.sortOrder}`;
      imageTagManagerSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imageTagManager.setSort(sortBy, sortOrder);
        this.imageTagManager.render(imageTagManagerSearchInput ? imageTagManagerSearchInput.value : '');
      });
    }
    if (imageTagManagerOrderBtn && imageTagManagerSortSelect) {
      imageTagManagerOrderBtn.addEventListener('click', () => {
        const newOrder = this.imageTagManager.toggleSortOrder();
        imageTagManagerSortSelect.value = `${this.imageTagManager.sortBy}-${newOrder}`;
        this.imageTagManager.render(imageTagManagerSearchInput ? imageTagManagerSearchInput.value : '');
      });
    }
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
    await this.promptPanelManager.renderList();
    await this.promptPanelManager.renderTagFilters();
    await this.imagePanelManager.renderGrid();
    await this.imagePanelManager.renderTagFilters();
    
    this.showToast(`已切换到${this.viewMode === 'safe' ? '安全' : 'NSFW'}模式`, 'success');
  }

  /**
   * 刷新数据
   */
  async refreshData() {
    try {
      await this.promptPanelManager.loadPrompts();
      await this.imagePanelManager.loadImages();
      await this.promptPanelManager.renderList();
      await this.imagePanelManager.renderGrid();
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
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    if (!toast || !toastMessage) return;

    toast.className = `toast toast-${type}`;
    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  /**
   * 显示确认对话框
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @returns {Promise<boolean>} 用户选择
   */
  async showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const modalTitle = document.getElementById('confirmModalTitle');
      const modalMessage = document.getElementById('confirmModalMessage');
      const confirmBtn = document.getElementById('confirmOkBtn');
      const cancelBtn = document.getElementById('confirmCancelBtn');
      const closeBtn = document.getElementById('closeConfirmModal');

      if (!modal) {
        resolve(window.confirm(message));
        return;
      }

      if (modalTitle) modalTitle.textContent = title;
      if (modalMessage) modalMessage.textContent = message;
      modal.style.display = 'flex';

      const cleanup = () => {
        modal.style.display = 'none';
        if (confirmBtn) confirmBtn.removeEventListener('click', onConfirm);
        if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
        if (closeBtn) closeBtn.removeEventListener('click', onClose);
      };

      const onConfirm = () => {
        cleanup();
        resolve(true);
      };

      const onCancel = () => {
        cleanup();
        resolve(false);
      };

      const onClose = () => {
        cleanup();
        resolve(false);
      };

      if (confirmBtn) confirmBtn.addEventListener('click', onConfirm);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
      if (closeBtn) closeBtn.addEventListener('click', onClose);
    });
  }

  /**
   * 打开编辑提示词模态框
   * @param {Object} prompt - 提示词对象
   * @param {Object} options - 选项
   */
  async openEditPromptModal(prompt, options = {}) {
    const modal = document.getElementById('editModal');
    if (!modal) {
      console.error('Edit modal not found');
      return;
    }

    try {
      // 填充基本数据
      document.getElementById('promptId').value = prompt.id || '';
      document.getElementById('promptTitle').value = prompt.title || '';
      document.getElementById('promptContent').value = prompt.content || '';
      document.getElementById('promptContentTranslate').value = prompt.contentTranslate || '';
      document.getElementById('promptNote').value = prompt.note || '';
      
      // 设置安全状态
      const safeToggle = document.getElementById('promptSafeToggle');
      if (safeToggle) {
        safeToggle.checked = prompt.isSafe !== 0;
      }
      
      // 更新收藏按钮
      this.updatePromptFavoriteBtnUI(prompt.isFavorite);
      
      // 加载图像
      await this.loadPromptEditImages(prompt);
      
      // 渲染标签
      await this.renderPromptEditTags(prompt);
      
      // 初始化保存管理器
      this.initPromptEditSaveManager(prompt);
      
      // 初始化导航器
      await this.initPromptNavigator(prompt, options);
      
      // 显示模态框
      modal.style.display = '';
      modal.classList.add('active');
      
      // 自动调整文本框高度
      this.autoResizeTextarea(document.getElementById('promptContent'));
      this.autoResizeTextarea(document.getElementById('promptContentTranslate'));
      this.autoResizeTextarea(document.getElementById('promptNote'));
    } catch (error) {
      console.error('Failed to open edit prompt modal:', error);
      this.showToast('打开编辑界面失败', 'error');
    }
  }

  /**
   * 初始化提示词导航器
   * @param {Object} prompt - 提示词对象
   * @param {Object} options - 选项
   */
  async initPromptNavigator(prompt, options = {}) {
    // 如果导航器已存在，先销毁旧的事件监听器
    if (this.promptNavigator) {
      this.promptNavigator.destroy();
    }
    
    // 记录当前提示词列表的快照
    if (options.filteredList && options.filteredList.length > 0) {
      this.editModalPromptsSnapshot = [...options.filteredList];
    } else {
      this.editModalPromptsSnapshot = [...this.prompts];
    }

    // 记录当前编辑的提示词索引
    this.currentEditIndex = this.editModalPromptsSnapshot.findIndex(p => 
      isSameId(p.id, prompt.id)
    );
    


    // 填充导航按钮 SVGs
    this.fillNavButtonSVGs('promptEdit');

    // 初始化导航器
    this.promptNavigator = new ListNavigator({
      items: this.editModalPromptsSnapshot,
      currentIndex: this.currentEditIndex,
      onSave: () => this.savePromptWithoutClosing(),
      onNavigate: async (targetPrompt, currentIndex) => {
        // 使用 targetPrompt，因为它来自 editModalPromptsSnapshot，已经包含所需的图像信息
        // 但需要确保图像数据是最新的，从 this.prompts 中同步
        const latestPrompt = this.findPromptById(targetPrompt.id);
        
        // 如果找到了最新的 prompt，使用它的 images 字段
        const nextPrompt = latestPrompt ? { ...targetPrompt, images: latestPrompt.images } : targetPrompt;
        

        
        this.currentEditIndex = currentIndex;
        
        // 强制重置 currentImages，确保导航时不会残留旧数据
        this.currentImages = [];
        
        await this.updatePromptEditView(nextPrompt);
      },
      navButtons: {
        first: document.getElementById('promptEditFirstNavBtn'),
        prev: document.getElementById('promptEditPrevNavBtn'),
        next: document.getElementById('promptEditNextNavBtn'),
        last: document.getElementById('promptEditLastNavBtn')
      }
    });
  }

  /**
   * 更新提示词编辑视图
   * @param {Object} prompt - 提示词对象
   */
  async updatePromptEditView(prompt) {
    // 填充表单数据
    document.getElementById('promptId').value = prompt.id || '';
    document.getElementById('promptTitle').value = prompt.title || '';
    document.getElementById('promptContent').value = prompt.content || '';
    document.getElementById('promptContentTranslate').value = prompt.contentTranslate || '';
    document.getElementById('promptNote').value = prompt.note || '';
    
    // 设置安全状态
    const safeToggle = document.getElementById('promptSafeToggle');
    if (safeToggle) {
      safeToggle.checked = prompt.isSafe !== 0;
    }
    
    // 更新收藏按钮
    this.updatePromptFavoriteBtnUI(prompt.isFavorite);
    
    // 重新初始化保存管理器（因为值已改变）
    this.initPromptEditSaveManager(prompt);
    
    // 加载已有图像
    this.currentImages = [];
    if (prompt.images && Array.isArray(prompt.images) && prompt.images.length > 0) {
      this.currentImages = [...prompt.images];
    }
    this.renderImagePreviews();
    
    // 渲染标签
    await this.renderPromptEditTags(prompt);
    
    // 自动调整文本框高度
    this.autoResizeTextarea(document.getElementById('promptContent'));
    this.autoResizeTextarea(document.getElementById('promptContentTranslate'));
    this.autoResizeTextarea(document.getElementById('promptNote'));
  }

  /**
   * 填充导航按钮 SVG
   * @param {string} prefix - 按钮前缀
   */
  fillNavButtonSVGs(prefix) {
    const icons = {
      first: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>',
      prev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>',
      next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>',
      last: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>'
    };

    ['first', 'prev', 'next', 'last'].forEach(type => {
      const btn = document.getElementById(`${prefix}${type.charAt(0).toUpperCase() + type.slice(1)}NavBtn`);
      if (btn) {
        btn.innerHTML = icons[type];
      }
    });
  }

  /**
   * 加载提示词编辑界面的图像
   * @param {Object} prompt - 提示词对象
   */
  async loadPromptEditImages(prompt) {
    const imageContainer = document.getElementById('imagePreviewList');
    if (!imageContainer) return;

    imageContainer.innerHTML = '';
    
    if (!prompt.images || prompt.images.length === 0) {
      imageContainer.innerHTML = '<div class="empty-images">暂无图像</div>';
      return;
    }

    const allImages = await window.electronAPI.getImages();
    
    // 加载所有关联的图像
    for (const img of prompt.images) {
      const imageObj = this.findImageById(img.id || img, allImages);
      if (!imageObj) continue;

      const imagePath = imageObj.thumbnailPath || imageObj.relativePath;
      if (!imagePath) continue;

      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        
        const imageEl = document.createElement('div');
        imageEl.className = 'image-preview-item';
        imageEl.innerHTML = `
          <img src="file://${fullPath.replace(/"/g, '&quot;')}" alt="${TagRenderer.escapeHtml(imageObj.fileName || '图像')}">
          <button type="button" class="remove-image-btn" title="移除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        `;
        
        imageContainer.appendChild(imageEl);
      } catch (error) {
        console.error('Failed to load image:', error);
      }
    }
  }

  /**
   * 渲染提示词编辑界面的标签
   * @param {Object} prompt - 提示词对象
   */
  async renderPromptEditTags(prompt) {
    // 清理旧的实例（导航时需要）
    if (this.promptTagManager) {
      this.promptTagManager = null;
    }
    if (this.promptTagList) {
      this.promptTagList = null;
    }

    // 初始化提示词标签管理器
    this.promptTagManager = new SimpleTagManager({
      onSave: async (tags) => {
        await this.promptSaveManager.saveField('tags', tags);
        // 刷新主界面的标签筛选
        await this.promptPanelManager.renderTagFilters();
      },
      onRender: () => {
        if (this.promptTagList) {
          this.promptTagList.render();
        }
      },
      getTagsWithGroup: () => window.electronAPI.getPromptTagsWithGroup(),
      showConfirm: (title, message) => this.showConfirmDialog(title, message),
      saveDelay: 800
    });
    this.promptTagManager.setTags(prompt.tags || []);

    // 初始化提示词标签列表组件
    this.promptTagList = new EditableTagList({
      containerId: 'editPromptTagsList',
      tagManager: this.promptTagManager,
      onRemove: (tagName) => this.removePromptTag(tagName),
      filterTags: [Constants.VIOLATING_TAG]
    });
    
    this.promptTagList.renderWithInit();
  }

  /**
   * 删除提示词标签
   * @param {string} tagName - 标签名称
   */
  async removePromptTag(tagName) {
    return this.removeTagWithManager(this.promptTagManager, tagName);
  }

  /**
   * 使用标签管理器删除标签
   * @param {TagManager} tagManager - 标签管理器实例
   * @param {string} tagName - 标签名称
   */
  async removeTagWithManager(tagManager, tagName) {
    try {
      await tagManager.removeTag(tagName);
      this.showToast('标签已删除', 'success');
      return true;
    } catch (error) {
      console.error('Failed to remove tag:', error);
      this.showToast('删除标签失败', 'error');
      return false;
    }
  }

  /**
   * 初始化提示词编辑界面的保存管理器
   * @param {Object} prompt - 提示词对象
   */
  initPromptEditSaveManager(prompt) {
    // 清理旧的实例
    if (this.promptSaveManager) {
      this.promptSaveManager.destroy();
    }
    if (this.promptChangeTracker) {
      this.promptChangeTracker.destroy();
    }

    // 创建新的实例
    this.promptChangeTracker = new FieldChangeTracker();
    this.promptSaveManager = new SaveManager({
      context: 'promptEdit',
      app: this,
      tracker: this.promptChangeTracker
    });

    // 注册字段
    this.promptSaveManager.registerField('title', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'promptTitle',
      statusId: 'promptTitleStatus',
      validate: async (value, id) => {
        const trimmed = value.trim();
        if (!trimmed) return { valid: false, error: '标题不能为空' };
        const isExists = await window.electronAPI.isTitleExists(trimmed, id);
        if (isExists) return { valid: false, error: '标题已存在' };
        return { valid: true };
      }
    });

    this.promptSaveManager.registerField('content', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'promptContent',
      statusId: 'promptContentStatus',
      autoResize: true,
      validate: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return { valid: false, error: '内容不能为空' };
        return { valid: true };
      }
    });

    this.promptSaveManager.registerField('contentTranslate', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'promptContentTranslate',
      statusId: 'promptContentTranslateStatus',
      autoResize: true
    });

    this.promptSaveManager.registerField('note', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'promptNote',
      statusId: 'promptNoteStatus',
      autoResize: true
    });

    this.promptSaveManager.registerField('isSafe', {
      elementId: 'promptSafeToggle',
      onChange: async (value) => {
        await this.togglePromptSafeStatus(value);
      }
    });

    // 初始化字段的原始值（在设置表单值之后）
    this.promptChangeTracker.initField('title', prompt.title || '', {
      saveMode: 'debounce',
      delay: 800
    });
    this.promptChangeTracker.initField('content', prompt.content || '', {
      saveMode: 'debounce',
      delay: 800
    });
    this.promptChangeTracker.initField('contentTranslate', prompt.contentTranslate || '', {
      saveMode: 'debounce',
      delay: 800
    });
    this.promptChangeTracker.initField('note', prompt.note || '', {
      saveMode: 'debounce',
      delay: 800
    });
    this.promptChangeTracker.initField('isSafe', prompt.isSafe !== 0, {});
  }

  /**
   * 切换提示词安全状态
   * @param {boolean} isSafe - 是否安全
   */
  async togglePromptSafeStatus(isSafe) {
    const promptIdEl = document.getElementById('promptId');
    if (!promptIdEl) return;

    const promptId = promptIdEl.value;
    const prompt = this.prompts.find(p => isSameId(p.id, promptId));
    
    if (prompt) {
      prompt.isSafe = isSafe ? 1 : 0;
      await window.electronAPI.updatePrompt(promptId, { isSafe: prompt.isSafe });
      
      // 通知事件
      this.eventBus.emit('safeRatingChanged', {
        targetType: 'prompt',
        targetId: promptId,
        isSafe: prompt.isSafe !== 0
      });
      
      this.showToast(isSafe ? '标记为安全' : '标记为不安全', 'success');
    }
  }

  /**
   * 保存提示词（不关闭模态框）
   */
  async savePromptWithoutClosing() {
    if (!this.promptSaveManager || !this.promptChangeTracker) return;

    // 只保存实际修改的字段
    const changedFields = this.promptChangeTracker.getChangedFields();
    
    if (changedFields.length === 0) {
      return; // 没有修改，直接返回
    }

    const results = [];
    for (const fieldId of changedFields) {
      const config = this.promptSaveManager.fields.get(fieldId);
      if (config) {
        const element = document.getElementById(config.elementId);
        if (element) {
          const value = this.promptSaveManager.getFieldValue(element);
          const result = await this.promptSaveManager.save(fieldId, value);
          results.push(result);
        }
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    // 只在有字段成功保存时显示提示（不显示具体数量，避免干扰）
    if (successCount > 0) {
      // 静默保存，不显示 toast
    }
  }

  /**
   * 保存并关闭提示词编辑
   */
  async saveAndClosePromptEdit() {
    await this.savePromptWithoutClosing();
    this.closeEditModal();
  }

  /**
   * 关闭编辑模态框
   */
  closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }

    // 清理保存管理器
    if (this.promptSaveManager) {
      this.promptSaveManager.destroy();
      this.promptSaveManager = null;
    }
    
    if (this.promptChangeTracker) {
      this.promptChangeTracker.destroy();
      this.promptChangeTracker = null;
    }
    
    if (this.promptNavigator) {
      this.promptNavigator.destroy();
      this.promptNavigator = null;
    }
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
      // 同步到面板管理器
      if (this.promptPanelManager) {
        await this.promptPanelManager.renderList();
        await this.promptPanelManager.renderTagFilters();
      }
    } catch (error) {
      console.error('Failed to load prompts:', error);
      this.prompts = [];
      if (this.promptPanelManager) {
        await this.promptPanelManager.renderList();
        await this.promptPanelManager.renderTagFilters();
      }
    }
  }

  /**
   * 处理新建提示词图像上传
   * @param {FileList} files - 选择的文件列表
   */
  async handleNewPromptImageUpload(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      try {
        const imageInfo = await window.electronAPI.saveImageFile(file.path, file.name);
        // 获取完整图像信息（包含 relativePath）
        const fullImageInfo = await window.electronAPI.getImageById(imageInfo.id);
        if (fullImageInfo) {
          this.newPromptImages.push(fullImageInfo);
        }
      } catch (error) {
        console.error('Failed to upload image:', error);
        this.showToast('图像上传失败：' + file.name, 'error');
      }
    }

    // 重新渲染图像列表
    await this.renderNewPromptImages();
  }

  /**
   * 关闭新建提示词页面
   * @param {boolean} save - 是否保存（true=完成，false=取消）
   */
  async closeNewPromptPage(save = true) {
    const modal = document.getElementById('newPromptPage');

    if (!save) {
      // 取消时只删除本次新上传的图像（预填充图像不删除）
      if (this.newPromptImages && this.newPromptImages.length > 0) {
        for (const img of this.newPromptImages) {
          try {
            await window.electronAPI.permanentDeleteImage(img.id);
          } catch (error) {
            console.error('Failed to delete image:', error);
          }
        }
      }
      this.showToast('已取消创建');
    } else if (save) {
      // 完成时创建提示词
      const content = document.getElementById('newPromptContent').value.trim();
      if (!content) {
        this.showToast('提示词内容不能为空', 'error');
        return;
      }

      try {
        // 合并预填充图像和新上传图像
        const allImages = [...(this.prefillImages || []), ...(this.newPromptImages || [])];
        await window.electronAPI.addPrompt({
          title: this.pendingNewPromptTitle,
          tags: [],
          content: content,
          images: allImages,
          isSafe: 1
        });
        this.showToast('提示词创建成功');
      } catch (error) {
        console.error('Failed to create prompt:', error);
        this.showToast('创建提示词失败', 'error');
        return;
      }
    }

    // 关闭页面
    modal.classList.remove('active');

    // 清理状态
    this.pendingNewPromptTitle = null;
    this.currentNewPromptId = null;
    this.prefillImages = [];
    this.newPromptImages = [];
    
    // 刷新列表
    await this.loadPrompts();
    if (this.promptPanelManager) {
      await this.promptPanelManager.renderList();
      await this.promptPanelManager.renderTagFilters();
    }
  }

  /**
   * 绑定新建提示词页面的事件
   */
  bindNewPromptPageEvents() {
    // 取消按钮
    document.getElementById('newPromptCancelBtn').onclick = () => this.closeNewPromptPage(false);

    // 完成按钮
    document.getElementById('newPromptDoneBtn').onclick = () => this.closeNewPromptPage(true);

    // 关闭按钮
    document.getElementById('closeNewPromptPage').onclick = () => this.closeNewPromptPage(false);

    // 内容输入 - 实时更新完成按钮状态
    const contentInput = document.getElementById('newPromptContent');
    contentInput.oninput = () => {
      const hasContent = contentInput.value.trim().length > 0;
      document.getElementById('newPromptDoneBtn').disabled = !hasContent;
      this.autoResizeTextarea(contentInput);
    };

    // 图像上传
    document.getElementById('newPromptImageUploadArea').onclick = () => {
      document.getElementById('newPromptImageInput').click();
    };
    document.getElementById('newPromptImageInput').onchange = (e) => {
      this.handleNewPromptImageUpload(e.target.files);
    };
  }

  /**
   * 渲染新建提示词页面的图像列表
   */
  async renderNewPromptImages() {
    const container = document.getElementById('newPromptImagePreviewList');
    const allImages = [...(this.prefillImages || []), ...(this.newPromptImages || [])];

    if (allImages.length === 0) {
      container.innerHTML = '';
      return;
    }

    // 获取所有图像的完整路径并渲染
    const prefillCount = (this.prefillImages || []).length;
    const previews = await Promise.all(
      allImages.map(async (img, index) => {
        const imagePath = await window.electronAPI.getImagePath(img.relativePath);
        // 预填充图像不显示删除按钮
        const removeBtn = index >= prefillCount
          ? `<button type="button" class="remove-image" data-index="${index - prefillCount}" title="删除图像">×</button>`
          : '';
        return `
          <div class="image-preview-item" data-index="${index}">
            <img src="file://${imagePath}" alt="${img.fileName}">
            ${removeBtn}
          </div>
        `;
      })
    );

    container.innerHTML = previews.join('');

    // 绑定删除事件（只绑定新上传图像的删除按钮）
    container.querySelectorAll('.remove-image').forEach(btn => {
      btn.onclick = () => this.removeNewPromptImage(parseInt(btn.dataset.index));
    });
  }

  /**
   * 打开新建提示词页面
   * @param {Array} prefillImages - 预填充的图像列表
   */
  async openNewPromptPage(prefillImages = []) {
    try {
      // 生成默认时间戳标题（备用）
      let defaultTitle = this.generateUniqueTimestamp();

      // 检查标题是否重复
      let isExists = await window.electronAPI.isTitleExists(defaultTitle);
      while (isExists) {
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        defaultTitle = `${defaultTitle}_${randomSuffix}`;
        isExists = await window.electronAPI.isTitleExists(defaultTitle);
      }

      // 保存标题备用，不创建提示词
      this.pendingNewPromptTitle = defaultTitle;
      this.currentNewPromptId = null;

      // 初始化新建页面表单
      document.getElementById('newPromptContent').value = '';

      // 初始化图像列表（预填充图像和新上传图像分开存储）
      this.prefillImages = prefillImages || [];
      this.newPromptImages = [];
      await this.renderNewPromptImages();
      
      // 显示新建页面
      document.getElementById('newPromptPage').classList.add('active');
      document.getElementById('newPromptDoneBtn').disabled = true;
      
      // 绑定事件
      this.bindNewPromptPageEvents();
      
      // 聚焦内容输入框
      document.getElementById('newPromptContent').focus();
      
    } catch (error) {
      console.error('Failed to open new prompt page:', error);
      this.showToast('打开新建页面失败', 'error');
    }
  }

  /**
   * 更新提示词编辑界面收藏按钮的 UI 状态
   * @param {boolean} isFavorite - 是否收藏
   */
  updatePromptFavoriteBtnUI(isFavorite) {
    const btn = document.getElementById('promptFavoriteBtn');
    if (!btn) return;

    if (isFavorite) {
      btn.classList.add('active');
      btn.title = '取消收藏';
      btn.innerHTML = this.ICONS.favorite.filled;
    } else {
      btn.classList.remove('active');
      btn.title = '收藏';
      btn.innerHTML = this.ICONS.favorite.outline;
    }
  }

  /**
   * 打开图像详情模态框
   * @param {Object} image - 图像对象
   */
  async openImageDetailModal(image) {
    const modal = document.getElementById('imageDetailModal');
    if (!modal) {
      console.error('Image detail modal not found');
      return;
    }

    try {
      // 保存当前编辑的图像
      this.currentImage = image;
      
      // 填充基本数据
      const fileNameInput = document.getElementById('imageDetailFileName');
      if (fileNameInput) {
        fileNameInput.value = image.fileName || '';
      }
      
      const noteInput = document.getElementById('imageDetailNote');
      if (noteInput) {
        noteInput.value = image.note || '';
      }
      
      // 设置安全状态
      const safeToggle = document.getElementById('imageSafeToggle');
      if (safeToggle) {
        safeToggle.checked = image.isSafe !== 0;
      }
      
      // 更新收藏按钮
      this.updateImageDetailFavoriteBtnUI(image.isFavorite);
      
      // 渲染图像信息
      await this.renderImageDetailInfo(image);
      
      // 渲染标签
      await this.renderImageDetailTags(image);
      
      // 渲染关联提示词信息
      await this.renderImageDetailPromptInfo(image);
      
      // 初始化保存管理器
      this.initImageDetailSaveManager(image);
      
      // 初始化导航器
      await this.initImageDetailNavigator(image);
      
      // 显示模态框
      modal.classList.add('active');
      
      // 自动调整文本框高度
      if (noteInput) {
        this.autoResizeTextarea(noteInput);
      }
    } catch (error) {
      console.error('Failed to open image detail modal:', error);
      this.showToast('打开图像详情失败', 'error');
    }
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
      btn.innerHTML = this.ICONS.favorite.filled;
    } else {
      btn.classList.remove('active');
      btn.title = '收藏';
      btn.innerHTML = this.ICONS.favorite.outline;
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
      fileSizeEl.textContent = image.fileSize ? this.formatFileSize(image.fileSize) : '-';
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
      } catch (error) {
        console.error('Failed to load image:', error);
        imgEl.alt = '加载图像失败';
      }
    }
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} - 格式化后的文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 渲染图像详情界面的关联提示词信息
   * @param {Object} image - 图像对象
   */
  async renderImageDetailPromptInfo(image) {
    const promptTitleContainer = document.getElementById('imageDetailPromptTitle');
    const promptContentEl = document.getElementById('imageDetailPromptContent');
    const promptTranslateEl = document.getElementById('imageDetailPromptTranslate');
    const promptNoteEl = document.getElementById('imageDetailPromptNote');
    const tagsContainer = document.getElementById('imageDetailTags');
    const editPromptBtn = document.getElementById('editPromptFromImageBtn');
    const editPromptBtnText = document.getElementById('editPromptBtnText');

    // 收集所有引用的提示词信息
    let allPromptRefs = [];

    if (image.promptRefs && image.promptRefs.length > 0) {
      allPromptRefs = image.promptRefs.map(ref => {
        // 优先从本地缓存查找
        const cachedPrompt = this.findPromptById(ref.promptId);
        if (cachedPrompt) {
          return cachedPrompt;
        }
        // 如果本地缓存中没有，使用数据库返回的数据
        if (ref.promptContent) {
          return {
            id: ref.promptId,
            title: ref.promptTitle,
            content: ref.promptContent,
            contentTranslate: ref.promptContentTranslate,
            note: ref.promptNote,
            tags: []
          };
        }
        return null;
      }).filter(p => p !== null);
    }

    if (allPromptRefs.length > 0) {
      // 多引用情况：显示所有提示词标题列表
      if (allPromptRefs.length > 1) {
        promptTitleContainer.innerHTML = allPromptRefs.map((p, index) =>
          `<div class="prompt-ref-item" data-prompt-id="${p.id}">
            <span class="prompt-ref-number">${index + 1}.</span>
            <span class="prompt-ref-title">${this.escapeHtml(p.title || '未命名')}</span>
            <span class="prompt-ref-unlink" title="解除关联">×</span>
          </div>`
        ).join('');

        // 绑定点击事件 - 点击标题切换显示
        promptTitleContainer.querySelectorAll('.prompt-ref-item').forEach(item => {
          const titleEl = item.querySelector('.prompt-ref-title');
          if (titleEl) {
            titleEl.addEventListener('click', () => {
              const promptId = item.dataset.promptId;
              const selectedPrompt = allPromptRefs.find(p => isSameId(p.id, promptId));
              if (selectedPrompt) {
                this.showPromptDetailFromImage(selectedPrompt);
              }
            });
          }
        });

        // 绑定解除关联事件
        promptTitleContainer.querySelectorAll('.prompt-ref-unlink').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.prompt-ref-item');
            const promptId = item.dataset.promptId;
            const promptRef = allPromptRefs.find(p => isSameId(p.id, promptId));
            if (promptRef) {
              await this.unlinkImageFromPrompt(image.id, promptId, promptRef.title);
            }
          });
        });
      } else {
        // 单引用情况：显示标题和解除关联按钮
        const p = allPromptRefs[0];
        promptTitleContainer.innerHTML =
          `<div class="prompt-ref-item single-ref" data-prompt-id="${p.id}">
            <span class="prompt-ref-title">${this.escapeHtml(p.title || '未命名')}</span>
            <span class="prompt-ref-unlink" title="解除关联">×</span>
          </div>`;

        // 绑定解除关联事件
        const unlinkBtn = promptTitleContainer.querySelector('.prompt-ref-unlink');
        if (unlinkBtn) {
          unlinkBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.unlinkImageFromPrompt(image.id, p.id, p.title);
          });
        }
      }

      // 显示第一个提示词的详细内容
      const firstPrompt = allPromptRefs[0];
      if (promptContentEl) promptContentEl.textContent = firstPrompt.content || '-';
      if (promptTranslateEl) promptTranslateEl.textContent = firstPrompt.contentTranslate || '-';
      if (promptNoteEl) promptNoteEl.textContent = firstPrompt.note || '-';

      // 设置标签
      if (tagsContainer) {
        if (firstPrompt.tags && firstPrompt.tags.length > 0) {
          tagsContainer.innerHTML = firstPrompt.tags.map(tag =>
            `<span class="tag-editable">${this.escapeHtml(tag)}</span>`
          ).join('');
        } else {
          tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
        }
      }

      // 显示编辑按钮，设置文本
      if (editPromptBtn) editPromptBtn.style.display = 'flex';
      if (editPromptBtnText) editPromptBtnText.textContent = allPromptRefs.length > 1 ? '编辑提示词 (1)' : '编辑提示词';
      this.currentDetailPromptId = firstPrompt.id;
      this.currentDetailPromptRefs = allPromptRefs;
    } else {
      // 没有关联提示词
      if (promptTitleContainer) promptTitleContainer.textContent = '-';
      if (promptContentEl) promptContentEl.textContent = '-';
      if (promptTranslateEl) promptTranslateEl.textContent = '-';
      if (promptNoteEl) promptNoteEl.textContent = '-';
      if (tagsContainer) tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';

      // 显示按钮，文本改为"添加提示词"
      if (editPromptBtn) editPromptBtn.style.display = 'flex';
      if (editPromptBtnText) editPromptBtnText.textContent = '添加提示词';
      this.currentDetailPromptId = null;
      this.currentDetailPromptRefs = [];
    }
  }

  /**
   * 从图像详情界面显示提示词详情
   * @param {Object} promptInfo - 提示词信息对象
   */
  showPromptDetailFromImage(promptInfo) {
    if (!promptInfo) return;

    // 更新当前选中的提示词ID
    this.currentDetailPromptId = promptInfo.id;

    // 更新提示词标题区域的选中状态
    const promptTitleContainer = document.getElementById('imageDetailPromptTitle');
    if (promptTitleContainer) {
      promptTitleContainer.querySelectorAll('.prompt-ref-item').forEach(item => {
        if (isSameId(item.dataset.promptId, promptInfo.id)) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    // 更新提示词内容
    const promptContentEl = document.getElementById('imageDetailPromptContent');
    const promptTranslateEl = document.getElementById('imageDetailPromptTranslate');
    const promptNoteEl = document.getElementById('imageDetailPromptNote');
    const tagsContainer = document.getElementById('imageDetailTags');

    if (promptContentEl) promptContentEl.textContent = promptInfo.content || '-';
    if (promptTranslateEl) promptTranslateEl.textContent = promptInfo.contentTranslate || '-';
    if (promptNoteEl) promptNoteEl.textContent = promptInfo.note || '-';

    // 更新标签
    if (tagsContainer) {
      if (promptInfo.tags && promptInfo.tags.length > 0) {
        tagsContainer.innerHTML = promptInfo.tags.map(tag =>
          `<span class="tag-editable">${this.escapeHtml(tag)}</span>`
        ).join('');
      } else {
        tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
      }
    }

    // 更新编辑按钮文本
    const editPromptBtnText = document.getElementById('editPromptBtnText');
    const allRefs = this.currentDetailPromptRefs || [];
    const currentIndex = allRefs.findIndex(p => isSameId(p.id, promptInfo.id));
    if (editPromptBtnText && currentIndex >= 0) {
      editPromptBtnText.textContent = `编辑提示词 (${currentIndex + 1})`;
    }
  }

  /**
   * 解除图像与提示词的关联
   * @param {string} imageId - 图像ID
   * @param {string} promptId - 提示词ID
   * @param {string} promptTitle - 提示词标题（用于确认消息）
   */
  async unlinkImageFromPrompt(imageId, promptId, promptTitle) {
    const confirmed = await this.showConfirmDialog(
      '解除关联',
      `确定要解除与提示词 "${promptTitle || '未命名'}" 的关联吗？`
    );

    if (!confirmed) return;

    try {
      await window.electronAPI.unlinkImageFromPrompt(imageId, promptId);
      this.showToast('关联已解除', 'success');
      // 刷新关联提示词显示
      if (this.currentImage) {
        // 重新获取图像信息以更新 promptRefs
        const updatedImage = await window.electronAPI.getImageById(imageId);
        if (updatedImage) {
          this.currentImage.promptRefs = updatedImage.promptRefs;
          await this.renderImageDetailPromptInfo(this.currentImage);
        }
      }
    } catch (error) {
      console.error('Failed to unlink image from prompt:', error);
      this.showToast('解除关联失败', 'error');
    }
  }

  /**
   * 渲染图像详情界面的标签
   * @param {Object} image - 图像对象
   */
  async renderImageDetailTags(image) {
    // 清理旧的实例（导航时需要）
    if (this.imageTagManager) {
      this.imageTagManager = null;
    }
    if (this.imageTagList) {
      this.imageTagList = null;
    }

    // 初始化图像标签管理器
    this.imageTagManager = new SimpleTagManager({
      onSave: async (tags) => {
        await this.imageSaveManager.saveField('tags', tags);
        // 刷新主界面的标签筛选
        await this.imagePanelManager.renderTagFilters();
      },
      onRender: () => {
        if (this.imageTagList) {
          this.imageTagList.render();
        }
      },
      getTagsWithGroup: () => window.electronAPI.getImageTagsWithGroup(),
      showConfirm: (title, message) => this.showConfirmDialog(title, message),
      saveDelay: 800
    });
    this.imageTagManager.setTags(image.tags || []);

    // 初始化图像标签列表组件
    this.imageTagList = new EditableTagList({
      containerId: 'imageDetailImageTags',
      tagManager: this.imageTagManager,
      onRemove: (tagName) => this.removeImageTag(tagName),
      filterTags: [Constants.VIOLATING_TAG]
    });
    
    this.imageTagList.renderWithInit();
  }

  /**
   * 删除图像标签
   * @param {string} tagName - 标签名称
   */
  async removeImageTag(tagName) {
    return this.removeTagWithManager(this.imageTagManager, tagName);
  }

  /**
   * 初始化图像详情界面的保存管理器
   * @param {Object} image - 图像对象
   */
  initImageDetailSaveManager(image) {
    // 清理旧的实例
    if (this.imageSaveManager) {
      this.imageSaveManager.destroy();
    }
    if (this.imageChangeTracker) {
      this.imageChangeTracker.destroy();
    }

    // 创建新的实例
    this.imageChangeTracker = new FieldChangeTracker();
    this.imageSaveManager = new SaveManager({
      context: 'imageDetail',
      app: this,
      tracker: this.imageChangeTracker
    });

    // 注册字段
    this.imageSaveManager.registerField('fileName', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'imageDetailFileName',
      statusId: 'fileNameStatus'
    });

    this.imageSaveManager.registerField('note', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'imageDetailNote',
      statusId: 'noteStatus',
      autoResize: true
    });

    this.imageSaveManager.registerField('isSafe', {
      elementId: 'imageSafeToggle',
      onChange: async (value) => {
        await this.toggleImageDetailSafeStatus(value);
      }
    });
  }

  /**
   * 切换图像详情安全状态
   * @param {boolean} isSafe - 是否安全
   */
  async toggleImageDetailSafeStatus(isSafe) {
    const image = this.currentImage;
    if (!image) return;

    image.isSafe = isSafe ? 1 : 0;
    await window.electronAPI.updateImage(image.id, { isSafe: image.isSafe });
    
    // 通知事件
    this.eventBus.emit('safeRatingChanged', {
      targetType: 'image',
      targetId: image.id,
      isSafe: image.isSafe !== 0
    });
    
    this.showToast(isSafe ? '标记为安全' : '标记为不安全', 'success');
  }

  /**
   * 保存图像（不关闭模态框）
   */
  async saveImageWithoutClosing() {
    if (!this.imageSaveManager || !this.imageChangeTracker) return;

    // 只保存实际修改的字段
    const changedFields = this.imageChangeTracker.getChangedFields();
    
    if (changedFields.length === 0) {
      return; // 没有修改，直接返回
    }

    const results = [];
    for (const fieldId of changedFields) {
      const config = this.imageSaveManager.fields.get(fieldId);
      if (config) {
        const element = document.getElementById(config.elementId);
        if (element) {
          const value = this.imageSaveManager.getFieldValue(element);
          const result = await this.imageSaveManager.save(fieldId, value);
          results.push(result);
        }
      }
    }

    // 清除变更追踪
    this.imageChangeTracker.clear();
  }

  /**
   * 保存并关闭图像详情
   */
  async saveAndCloseImageDetail() {
    await this.saveImageWithoutClosing();
    this.closeImageDetailModal();
  }

  /**
   * 关闭图像详情模态框
   */
  closeImageDetailModal() {
    const modal = document.getElementById('imageDetailModal');
    if (modal) {
      modal.classList.remove('active');
    }

    // 清理保存管理器
    if (this.imageSaveManager) {
      this.imageSaveManager.destroy();
      this.imageSaveManager = null;
    }
    if (this.imageChangeTracker) {
      this.imageChangeTracker.destroy();
      this.imageChangeTracker = null;
    }
    if (this.imageNavigator) {
      this.imageNavigator.destroy();
      this.imageNavigator = null;
    }

    // 清理当前图像引用
    this.currentImage = null;
  }

  /**
   * 切换图像收藏状态
   * @param {string} imageId - 图像 ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleImageFavorite(imageId, isFavorite) {
    try {
      await window.electronAPI.updateImage(imageId, { isFavorite });
      const image = this.images.find(i => isSameId(i.id, imageId));
      if (image) {
        image.isFavorite = isFavorite;
      }
      this.showToast(isFavorite ? '已收藏' : '已取消收藏', 'success');
    } catch (error) {
      console.error('Failed to toggle image favorite:', error);
      this.showToast('操作失败', 'error');
    }
  }

  /**
   * 初始化图像详情导航器
   * @param {Object} image - 图像对象
   * @param {Object} options - 选项
   */
  async initImageDetailNavigator(image, options = {}) {
    // 记录当前图像列表的快照
    if (options.filteredList && options.filteredList.length > 0) {
      this.detailModalImagesSnapshot = [...options.filteredList];
    } else {
      this.detailModalImagesSnapshot = [...this.images];
    }

    // 记录当前编辑的图像索引
    this.currentDetailIndex = this.detailModalImagesSnapshot.findIndex(i => 
      isSameId(i.id, image.id)
    );

    // 填充导航按钮 SVGs
    this.fillNavButtonSVGs('imageDetail');

    // 初始化导航器
    this.imageNavigator = new ListNavigator({
      items: this.detailModalImagesSnapshot,
      currentIndex: this.currentDetailIndex,
      onSave: () => this.saveImageWithoutClosing(),
      onNavigate: async (targetImage) => {
        // 直接使用 targetImage，不要重新查找，避免数据不一致
        const nextImage = targetImage;
        this.currentDetailIndex = this.imageNavigator.currentIndex;
        await this.updateImageDetailView(nextImage);
      },
      navButtons: {
        first: document.getElementById('imageDetailFirstNavBtn'),
        prev: document.getElementById('imageDetailPrevNavBtn'),
        next: document.getElementById('imageDetailNextNavBtn'),
        last: document.getElementById('imageDetailLastNavBtn')
      }
    });
  }

  /**
   * 更新图像详情视图
   * @param {Object} image - 图像对象
   */
  async updateImageDetailView(image) {
    // 更新当前图像
    this.currentImage = image;
    
    // 填充表单数据
    const fileNameInput = document.getElementById('imageDetailFileName');
    if (fileNameInput) {
      fileNameInput.value = image.fileName || '';
    }
    
    const noteInput = document.getElementById('imageDetailNote');
    if (noteInput) {
      noteInput.value = image.note || '';
    }
    
    // 设置安全状态
    const safeToggle = document.getElementById('imageSafeToggle');
    if (safeToggle) {
      safeToggle.checked = image.isSafe !== 0;
    }
    
    // 更新收藏按钮
    this.updateImageDetailFavoriteBtnUI(image.isFavorite);
    
    // 渲染图像信息（包括图像显示）
    await this.renderImageDetailInfo(image);
    
    // 重新初始化保存管理器
    this.initImageDetailSaveManager(image);
    
    // 渲染标签
    await this.renderImageDetailTags(image);
    
    // 渲染关联提示词信息
    await this.renderImageDetailPromptInfo(image);
    
    // 自动调整文本框高度
    if (noteInput) {
      this.autoResizeTextarea(noteInput);
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
      await this.promptPanelManager.renderList();
      await this.promptPanelManager.renderTagFilters();
      
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
      await this.imagePanelManager.renderGrid();
      await this.imagePanelManager.renderTagFilters();
      
      this.showToast('标签已添加', 'success');
    } catch (error) {
      console.error('Failed to add tag to image:', error);
      this.showToast(error.message, 'error');
    }
  }

  /**
   * 根据 ID 查找图像
   * @param {string} id - 图像 ID
   * @param {Array} allImages - 图像列表
   * @returns {Object|null} 图像对象
   */
  findImageById(id, allImages = this.images) {
    return allImages.find(img => isSameId(img.id, id)) || null;
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
   * @param {string} id - 提示词 ID
   * @returns {Object|null} 提示词对象
   */
  findPromptById(id) {
    return this.prompts.find(p => isSameId(p.id, id)) || null;
  }

  /**
   * 渲染提示词批量操作工具栏
   */
  renderPromptBatchOperationToolbar() {
    const toolbar = document.getElementById('promptBatchToolbar');
    if (!toolbar) return;

    const selectedCount = this.promptPanelManager?.selectedPromptIds?.size || 0;
    
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
    const promptPanel = document.getElementById('promptPanel');
    const imagePanel = document.getElementById('imagePanel');
    const statisticsSection = document.getElementById('statisticsSection');
    const promptBtn = document.getElementById('promptManagerBtn');
    const imageBtn = document.getElementById('imageManagerBtn');
    const statsBtn = document.getElementById('statisticsBtn');

    // 切换面板显示
    if (promptPanel) promptPanel.style.display = 'flex';
    if (imagePanel) imagePanel.style.display = 'none';
    if (statisticsSection) statisticsSection.style.display = 'none';

    // 更新按钮高亮
    if (promptBtn) promptBtn.classList.add('active');
    if (imageBtn) imageBtn.classList.remove('active');
    if (statsBtn) statsBtn.classList.remove('active');

    // 更新视图按钮状态
    if (this.promptPanelManager) {
      this.updatePromptViewButtons(this.promptPanelManager.viewModeType);
    }

    // 保存面板状态
    this.currentPanel = 'prompt';
    this.savePanelState();
  }

  /**
   * 切换到图像管理器
   */
  switchToImageManager() {
    const promptPanel = document.getElementById('promptPanel');
    const imagePanel = document.getElementById('imagePanel');
    const statisticsSection = document.getElementById('statisticsSection');
    const promptBtn = document.getElementById('promptManagerBtn');
    const imageBtn = document.getElementById('imageManagerBtn');
    const statsBtn = document.getElementById('statisticsBtn');

    // 切换面板显示
    if (promptPanel) promptPanel.style.display = 'none';
    if (imagePanel) imagePanel.style.display = 'flex';
    if (statisticsSection) statisticsSection.style.display = 'none';

    // 更新按钮高亮
    if (promptBtn) promptBtn.classList.remove('active');
    if (imageBtn) imageBtn.classList.add('active');
    if (statsBtn) statsBtn.classList.remove('active');

    // 更新视图按钮状态
    if (this.imagePanelManager) {
      this.updateImageViewButtons(this.imagePanelManager.viewModeType);
    }

    // 保存面板状态
    this.currentPanel = 'image';
    this.savePanelState();
  }

  /**
   * 切换到统计页面
   */
  switchToStatistics() {
    const promptPanel = document.getElementById('promptPanel');
    const imagePanel = document.getElementById('imagePanel');
    const statisticsSection = document.getElementById('statisticsSection');
    const promptBtn = document.getElementById('promptManagerBtn');
    const imageBtn = document.getElementById('imageManagerBtn');
    const statsBtn = document.getElementById('statisticsBtn');
    
    // 切换面板显示
    if (promptPanel) promptPanel.style.display = 'none';
    if (imagePanel) imagePanel.style.display = 'none';
    if (statisticsSection) {
      statisticsSection.style.display = 'flex';
      this.renderStatistics();
    }
    
    // 更新按钮高亮
    if (promptBtn) promptBtn.classList.remove('active');
    if (imageBtn) imageBtn.classList.remove('active');
    if (statsBtn) statsBtn.classList.add('active');
    
    // 保存面板状态
    this.currentPanel = 'statistics';
    this.savePanelState();
  }

  /**
   * 保存面板状态到 localStorage
   */
  savePanelState() {
    localStorage.setItem('currentPanel', this.currentPanel);
  }

  /**
   * 从 localStorage 恢复面板状态
   */
  restorePanelState() {
    const savedPanel = localStorage.getItem('currentPanel') || 'prompt';
    this.currentPanel = savedPanel;
    
    if (savedPanel === 'image') {
      this.switchToImageManager();
    } else if (savedPanel === 'statistics') {
      this.switchToStatistics();
    } else {
      this.switchToPromptManager();
    }
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

      // 提示词统计
      const totalPrompts = prompts.length;
      const deletedPrompts = prompts.filter(p => p.isDeleted).length;
      const activePrompts = totalPrompts - deletedPrompts;
      const totalPromptTags = tagGroups.reduce((sum, group) => sum + (group.tags ? group.tags.length : 0), 0);

      // 图像统计
      const totalImages = images.length;
      const deletedImages = images.filter(i => i.isDeleted).length;
      const favoriteImages = images.filter(i => i.isFavorite).length;
      const unreferencedImages = images.filter(i => !i.referencedBy || i.referencedBy.length === 0).length;
      const totalImageTags = images.reduce((sum, img) => sum + (img.tags ? img.tags.length : 0), 0);

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
    const modal = document.getElementById('settingsModal');

    // 获取当前数据路径
    try {
      const dataPath = await window.electronAPI.getDataPath();
      document.getElementById('currentDataPath').textContent = dataPath;
    } catch (error) {
      console.error('Failed to get data path:', error);
      document.getElementById('currentDataPath').textContent = '获取失败';
    }

    modal.classList.add('active');
  }

  /**
   * 关闭设置模态框
   */
  closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /**
   * 打开上传图像模态框
   */
  openUploadImageModal() {
    const modal = document.getElementById('imageUploadModal');
    if (modal) {
      modal.classList.add('active');
    }
  }

  /**
   * 绑定图像上传事件
   * 支持点击上传和拖拽上传
   */
  bindImageUploadEvents() {
    const uploadArea = document.getElementById('imageUploadArea');
    const imageInput = document.getElementById('imageInput');
    const selectFromManagerBtn = document.getElementById('selectFromImageManagerBtn');

    if (!uploadArea || !imageInput) return;

    // 点击上传区域触发文件选择
    uploadArea.addEventListener('click', () => imageInput.click());

    // 文件选择变化
    imageInput.addEventListener('change', (e) => {
      this.handleImageFiles(e.target.files);
    });

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      this.handleImageFiles(e.dataTransfer.files);
    });

    // 从图像管理选择按钮
    if (selectFromManagerBtn) {
      selectFromManagerBtn.addEventListener('click', () => this.openImageSelectorForPrompt());
    }
  }

  /**
   * 处理图像文件上传
   * 保存图像到数据目录并生成缩略图
   * @param {FileList} fileList - 要处理的图像文件列表
   */
  async handleImageFiles(fileList) {
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;

      try {
        // 获取文件的临时路径（拖拽或选择时）
        let filePath = file.path;

        // 如果没有 path（例如从 input 选择的文件），需要保存到临时位置
        if (!filePath) {
          // 创建一个临时文件
          const arrayBuffer = await file.arrayBuffer();
          const tempPath = await this.saveTempFile(arrayBuffer, file.name);
          filePath = tempPath;
        }

        // 保存到数据目录
        const imageInfo = await window.electronAPI.saveImageFile(filePath, file.name);

        // 检查是否是重复图像
        if (imageInfo.isDuplicate && imageInfo.duplicateMessage) {
          this.showToast(imageInfo.duplicateMessage, 'info');
        }

        // 只保存图像 ID 到当前图像列表
        this.currentImages.push({
          id: imageInfo.id,
          fileName: imageInfo.fileName
        });

        // 立即保存到数据库
        const promptId = document.getElementById('promptId').value;
        if (promptId) {
          await this.savePromptField('images', this.currentImages);
        }
      } catch (error) {
        console.error('Failed to save image:', error);
        this.showToast('保存图像失败：' + error.message, 'error');
      }
    }
    this.renderImagePreviews();
  }

  /**
   * 保存临时文件
   * @param {ArrayBuffer} arrayBuffer - 文件内容
   * @param {string} fileName - 文件名
   * @returns {Promise<string>} - 临时文件路径
   */
  async saveTempFile(arrayBuffer, fileName) {
    const tempDir = await window.electronAPI.getTempDir();
    const tempPath = `${tempDir}/${fileName}`;
    await window.electronAPI.saveFile(tempPath, new Uint8Array(arrayBuffer));
    return tempPath;
  }

  /**
   * 打开图像选择器（用于提示词编辑）
   */
  async openImageSelectorForPrompt() {
    // 关闭上传模态框
    this.closeUploadImageModal();
    
    // 打开图像管理面板，并标记为选择模式
    const imageManagerBtn = document.getElementById('imageManagerBtn');
    if (imageManagerBtn) {
      imageManagerBtn.click();
    }
    
    // 提示用户选择图像
    this.showToast('请在图像管理中选择要添加的图像', 'info');
  }

  /**
   * 关闭上传图像模态框
   */
  closeUploadImageModal() {
    const modal = document.getElementById('imageUploadModal');
    if (modal) {
      modal.classList.remove('active');
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
        const imagePath = await window.electronAPI.getImagePath(img.relativePath);
        const isSecondary = this.isSecondaryPromptEdit;

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
  }

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
  }

  /**
   * 打开提示词回收站模态框
   */
  async openRecycleBinModal() {
    const modal = document.getElementById('recycleBinModal');
    await this.renderRecycleBin();
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  /**
   * 关闭提示词回收站模态框
   */
  closeRecycleBinModal() {
    const modal = document.getElementById('recycleBinModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * 清空回收站
   */
  async emptyRecycleBin() {
    const confirmed = await this.showConfirmDialog('确认清空回收站', '确定要清空回收站吗？所有项目将被彻底删除，此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.emptyRecycleBin();
      this.showToast('回收站已清空');
      await this.renderRecycleBin();
    } catch (error) {
      console.error('Failed to empty recycle bin:', error);
      this.showToast('清空回收站失败', 'error');
    }
  }

  /**
   * 渲染回收站列表
   */
  async renderRecycleBin() {
    if (this.trashManager) {
      await this.trashManager.loadTrash();
    }
  }

  /**
   * 打开图像回收站模态框
   */
  async openImageRecycleBinModal() {
    const modal = document.getElementById('imageRecycleBinModal');
    await this.renderRecycleBin();
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  /**
   * 关闭图像回收站模态框
   */
  closeImageRecycleBinModal() {
    const modal = document.getElementById('imageRecycleBinModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * 清空图像回收站
   */
  async emptyImageRecycleBin() {
    const confirmed = await this.showConfirmDialog('确认清空回收站', '确定要清空回收站吗？所有项目将被彻底删除，此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.emptyRecycleBin();
      this.showToast('回收站已清空');
      await this.renderRecycleBin();
    } catch (error) {
      console.error('Failed to empty recycle bin:', error);
      this.showToast('清空回收站失败', 'error');
    }
  }

  /**
   * 打开提示词标签管理器模态框
   */
  async openPromptTagManagerModal() {
    const modal = document.getElementById('promptTagManagerModal');
    if (modal) {
      modal.classList.add('active');
      await this.promptTagManager.render();
    }
  }

  /**
   * 关闭提示词标签管理器模态框
   */
  closePromptTagManagerModal() {
    const modal = document.getElementById('promptTagManagerModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /**
   * 打开标签组编辑模态框
   * @param {string} type - 类型 (prompt/image)
   * @param {number} groupId - 标签组ID (可选)
   */
  async openTagGroupEditModal(type, groupId = null) {
    const modal = document.getElementById('tagGroupEditModal');
    const title = document.getElementById('tagGroupEditTitle');
    const nameInput = document.getElementById('tagGroupEditName');
    const typeInput = document.getElementById('tagGroupEditType');
    const idInput = document.getElementById('tagGroupEditId');
    const selectTypeInput = document.getElementById('tagGroupEditSelectType');
    const sortOrderInput = document.getElementById('tagGroupEditSortOrder');

    if (!modal) return;

    typeInput.value = type;
    idInput.value = groupId || '';

    if (groupId) {
      title.textContent = '编辑标签组';
      const groups = type === 'prompt'
        ? await window.electronAPI.getPromptTagGroups()
        : await window.electronAPI.getImageTagGroups();
      const group = groups.find(g => g.id === groupId);
      if (group) {
        nameInput.value = group.name;
        if (selectTypeInput) selectTypeInput.value = group.type || 'multi';
        if (sortOrderInput) sortOrderInput.value = group.sortOrder || 0;
      }
    } else {
      title.textContent = '新建标签组';
      nameInput.value = '';
      if (selectTypeInput) selectTypeInput.value = 'multi';
      if (sortOrderInput) sortOrderInput.value = 0;
    }

    modal.classList.add('active');
    nameInput.focus();
  }

  /**
   * 关闭标签组编辑模态框
   */
  closeTagGroupEditModal() {
    const modal = document.getElementById('tagGroupEditModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /**
   * 保存标签组
   */
  async saveTagGroup() {
    const nameInput = document.getElementById('tagGroupEditName');
    const typeInput = document.getElementById('tagGroupEditType');
    const idInput = document.getElementById('tagGroupEditId');
    const selectTypeInput = document.getElementById('tagGroupEditSelectType');
    const sortOrderInput = document.getElementById('tagGroupEditSortOrder');

    const name = nameInput.value.trim();
    const type = typeInput.value;
    const groupId = idInput.value ? parseInt(idInput.value) : null;
    const groupType = selectTypeInput ? selectTypeInput.value : 'multi';
    const sortOrder = sortOrderInput ? parseInt(sortOrderInput.value) || 0 : 0;

    if (!name) {
      this.showToast('请输入标签组名称', 'error');
      return;
    }

    try {
      if (groupId) {
        // 更新
        if (type === 'prompt') {
          await window.electronAPI.updatePromptTagGroupAttrs(groupId, {
            name,
            type: groupType,
            sortOrder
          });
        } else {
          await window.electronAPI.updateImageTagGroupAttrs(groupId, {
            name,
            type: groupType,
            sortOrder
          });
        }
      } else {
        // 新建
        if (type === 'prompt') {
          await window.electronAPI.createPromptTagGroup(name, groupType, sortOrder);
        } else {
          await window.electronAPI.createImageTagGroup(name, groupType, sortOrder);
        }
      }

      this.closeTagGroupEditModal();

      // 刷新标签管理器
      if (type === 'prompt') {
        await this.promptTagManager.render();
        this.promptPanelManager.renderTagFilters();
      } else {
        await this.imageTagManager.render();
        this.imagePanelManager.renderTagFilters();
      }

      this.showToast(groupId ? '标签组已更新' : '标签组已创建', 'success');
    } catch (error) {
      console.error('Failed to save tag group:', error);
      this.showToast('保存标签组失败', 'error');
    }
  }

  /**
   * 打开图像标签管理器模态框
   */
  openImageTagManagerModal() {
    const modal = document.getElementById('imageTagManagerModal');
    if (modal) {
      modal.classList.add('active');
      this.imageTagManager.render();
    }
  }

  /**
   * 关闭图像标签管理器模态框
   */
  closeImageTagManagerModal() {
    const modal = document.getElementById('imageTagManagerModal');
    if (modal) {
      modal.classList.remove('active');
    }
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
    const thumbnailSizeSlider = document.getElementById('thumbnailSizeSlider');
    const thumbnailSizeSliderContainer = thumbnailSizeSlider?.closest('.thumbnail-size-slider');

    // 更新按钮状态
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');
    if (listBtn) listBtn.classList.toggle('active', mode === 'list');
    if (compactBtn) compactBtn.classList.toggle('active', mode === 'list-compact');

    // 更新容器显示状态
    if (mode === 'grid') {
      if (imageGrid) imageGrid.style.display = 'grid';
      if (imageList) imageList.style.display = 'none';
      // 显示缩略图尺寸滑杆
      if (thumbnailSizeSliderContainer) {
        thumbnailSizeSliderContainer.style.display = 'flex';
      }
    } else {
      if (imageGrid) imageGrid.style.display = 'none';
      if (imageList) imageList.style.display = 'flex';
      // 隐藏缩略图尺寸滑杆（列表视图不需要）
      if (thumbnailSizeSliderContainer) {
        thumbnailSizeSliderContainer.style.display = 'none';
      }
    }
  }

  /**
   * 切换提示词标签筛选收起/展开
   */
  togglePromptTagFilter() {
    const tagFilterSection = document.getElementById('promptTagFilterSection');
    const toggleBtn = document.getElementById('tagFilterToggleBtn');
    
    if (tagFilterSection && toggleBtn) {
      tagFilterSection.classList.toggle('collapsed');
      const collapsed = tagFilterSection.classList.contains('collapsed');
      localStorage.setItem('promptTagFilterCollapsed', collapsed);
      toggleBtn.textContent = collapsed ? '展开标签' : '收起标签';
    }
  }

  /**
   * 切换图像标签筛选收起/展开
   */
  toggleImageTagFilter() {
    const tagFilterSection = document.getElementById('imageTagFilterSection');
    const toggleBtn = document.getElementById('toggleImageTagFilterBtn');
    
    if (tagFilterSection && toggleBtn) {
      tagFilterSection.classList.toggle('collapsed');
      const collapsed = tagFilterSection.classList.contains('collapsed');
      localStorage.setItem('imageTagFilterCollapsed', collapsed);
      toggleBtn.textContent = collapsed ? '展开标签' : '收起标签';
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
   * 处理确认对话框确定按钮
   */
  handleConfirmOk() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
      modal.classList.remove('active');
    }
    if (this.confirmResolve) {
      this.confirmResolve(true);
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
    return new Promise((resolve) => {
      this.inputResolve = resolve;
      this.inputOptions = options;
      document.getElementById('inputModalTitle').textContent = title;
      document.getElementById('inputModalLabel').textContent = label;
      const inputField = document.getElementById('inputModalField');
      inputField.value = defaultValue;

      // 处理标签组选择
      const groupSection = document.getElementById('inputModalGroupSection');
      const groupSelect = document.getElementById('inputModalGroupSelect');
      if (options.showGroupSelect && options.groups) {
        groupSection.style.display = 'block';
        groupSelect.innerHTML = '<option value="">未分组</option>' +
          options.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        if (options.defaultGroupId) {
          groupSelect.value = options.defaultGroupId;
        }
      } else {
        groupSection.style.display = 'none';
      }

      document.getElementById('inputModal').classList.add('active');
      inputField.focus();
      inputField.select();
    });
  }

  /**
   * 关闭输入对话框
   */
  closeInputModal() {
    const modal = document.getElementById('inputModal');
    if (modal) {
      modal.classList.remove('active');
    }
    if (this.inputResolve) {
      this.inputResolve(null);
      this.inputResolve = null;
    }
  }

  /**
   * 处理输入对话框确定按钮
   */
  handleInputOk() {
    const value = document.getElementById('inputModalField').value.trim();
    const groupSelect = document.getElementById('inputModalGroupSelect');
    const groupId = groupSelect?.value ? parseInt(groupSelect.value) : null;
    const modal = document.getElementById('inputModal');
    if (modal) {
      modal.classList.remove('active');
    }
    if (this.inputResolve) {
      if (this.inputOptions && this.inputOptions.showGroupSelect) {
        this.inputResolve(value ? { value, groupId } : null);
      } else {
        this.inputResolve(value || null);
      }
      this.inputResolve = null;
    }
  }

  /**
   * 关闭选择对话框
   */
  closeSelectModal() {
    const modal = document.getElementById('selectModal');
    if (modal) {
      modal.classList.remove('active');
    }
    if (this.selectResolve) {
      this.selectResolve(null);
      this.selectResolve = null;
    }
  }

  /**
   * 处理选择对话框确定按钮
   */
  handleSelectOk() {
    const value = document.getElementById('selectModalField').value;
    const modal = document.getElementById('selectModal');
    if (modal) {
      modal.classList.remove('active');
    }
    if (this.selectResolve) {
      this.selectResolve(value || null);
      this.selectResolve = null;
    }
  }

  /**
   * 更改数据存储目录
   */
  async changeDataPath() {
    try {
      const newPath = await window.electronAPI.selectDataPath();
      if (newPath) {
        document.getElementById('currentDataPath').textContent = newPath;
        this.showToast('数据目录已更改，重启应用后生效', 'success');
      }
    } catch (error) {
      console.error('Failed to change data path:', error);
      this.showToast('更改失败：' + error.message, 'error');
    }
  }

  /**
   * 导入提示词
   */
  async importPrompts() {
    try {
      const result = await window.electronAPI.importPrompts();
      if (result) {
        await this.promptPanelManager.loadPrompts();
        await this.promptPanelManager.renderList();
        this.showToast('导入成功', 'success');
      }
    } catch (error) {
      console.error('Failed to import prompts:', error);
      this.showToast('导入失败：' + error.message, 'error');
    }
  }

  /**
   * 导出提示词
   */
  async exportPrompts() {
    try {
      const prompts = this.promptPanelManager.prompts;
      const result = await window.electronAPI.exportPrompts(prompts);
      if (result) {
        this.showToast('导出成功', 'success');
      }
    } catch (error) {
      console.error('Failed to export prompts:', error);
      this.showToast('导出失败：' + error.message, 'error');
    }
  }

  /**
   * 导出孤儿文件
   */
  async exportOrphanFiles() {
    try {
      // 先选择导出目录
      const exportDir = await window.electronAPI.selectDirectory();
      if (!exportDir) {
        return; // 用户取消选择
      }

      this.showToast('正在扫描孤儿文件...', 'info');

      // 扫描孤儿文件
      const scanResult = await window.electronAPI.scanOrphanFiles();

      if (scanResult.totalCount === 0) {
        this.showToast('没有发现孤儿文件', 'info');
        return;
      }

      this.showToast(`发现 ${scanResult.totalCount} 个孤儿文件，正在导出...`, 'info');

      // 导出孤儿文件
      const result = await window.electronAPI.exportOrphanFiles(exportDir);

      if (result && result.successCount > 0) {
        this.showToast(`成功导出 ${result.successCount} 个孤儿文件`, 'success');
      }
    } catch (error) {
      console.error('Failed to export orphan files:', error);
      this.showToast('导出失败：' + error.message, 'error');
    }
  }

  /**
   * 清空所有数据
   */
  async clearAllData() {
    try {
      const confirmed = await this.showConfirmDialog(
        '⚠️ 危险操作',
        '确定要清空所有数据吗？\n\n此操作将永久删除\n<图像文件>\n以外的所有数据，不可恢复！'
      );

      if (!confirmed) return;

      await window.electronAPI.clearAllData();
      this.showToast('所有数据已清空', 'success');
      
      // 重新加载数据
      await this.promptPanelManager.loadPrompts();
      await this.imagePanelManager.loadImages();
      await this.promptPanelManager.renderList();
      await this.imagePanelManager.renderGrid();
    } catch (error) {
      console.error('Failed to clear all data:', error);
      this.showToast('清空失败：' + error.message, 'error');
    }
  }

  /**
   * 切换主题
   */
  toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const themeToggle = document.getElementById('settingsThemeToggle');
    if (themeToggle) {
      themeToggle.innerHTML = newTheme === 'dark' 
        ? '<span>☀️</span> 明亮' 
        : '<span>🌙</span> 暗黑';
    }
    
    this.showToast(newTheme === 'dark' ? '已切换到黑暗模式' : '已切换到明亮模式', 'success');
  }

  handlePromptItemSelection(promptId, index, e) {
    if (!this.promptPanelManager) return;

    const { selectedPromptIds } = this.promptPanelManager;

    if (e.shiftKey && this.promptPanelManager.lastSelectedIndex !== -1) {
      // Shift 点击：选择范围
      const start = Math.min(this.promptPanelManager.lastSelectedIndex, index);
      const end = Math.max(this.promptPanelManager.lastSelectedIndex, index);
      
      const filtered = this.promptPanelManager.filteredPrompts;
      for (let i = start; i <= end; i++) {
        const item = filtered[i];
        if (item) {
          selectedPromptIds.add(item.id);
        }
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd 点击：切换单个
      if (selectedPromptIds.has(promptId)) {
        selectedPromptIds.delete(promptId);
      } else {
        selectedPromptIds.add(promptId);
      }
    } else {
      // 普通点击：单选
      selectedPromptIds.clear();
      selectedPromptIds.add(promptId);
    }

    this.promptPanelManager.lastSelectedIndex = index;
    this.promptPanelManager.renderList();
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
