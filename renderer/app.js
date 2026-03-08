/**
 * Prompt Manager 主应用逻辑
 * 管理 Prompt 的增删改查、标签管理、图像处理等功能
 */
class PromptManager {
  // 常量定义
  static FAVORITE_TAG = '收藏';
  static UNREFERENCED_TAG = '未引用';
  static MULTI_REF_TAG = '多引用';
  static NO_IMAGE_TAG = '无图';
  static MULTI_IMAGE_TAG = '多图';

  /**
   * 构造函数 - 初始化应用状态和配置
   */
  constructor() {
    this.prompts = [];              // 所有 Prompt 数据
    this.searchQuery = '';          // 当前搜索关键词
    this.selectedTags = new Set();  // 当前选中的提示词标签集合
    this.selectedImageTags = [];    // 当前选中的图像标签数组（支持多选）
    this.imageSearchQuery = '';     // 当前图像搜索关键词
    this.imageSearchTimeout = null; // 图像搜索防抖定时器
    this.imageSortBy = 'createdAt'; // 图像排序字段
    this.imageSortOrder = 'desc';   // 图像排序顺序
    this.promptSortBy = 'updatedAt'; // 提示词排序字段
    this.promptSortOrder = 'desc';   // 提示词排序顺序
    this.currentTheme = localStorage.getItem('theme') || 'light';  // 当前主题
    this.currentImages = [];        // 当前编辑的图像列表
    this.currentEditIndex = -1;     // 当前编辑的提示词索引
    this.filteredPrompts = [];      // 筛选后的提示词列表（用于编辑模态框导航）
    this.editModalPromptsSnapshot = []; // 编辑模态框打开时的提示词列表快照（用于导航）
    this.viewerImages = [];         // 图像查看器中的图像列表
    this.viewerCurrentIndex = 0;    // 图像查看器当前索引
    this.currentPanel = localStorage.getItem('currentPanel') || 'prompt';   // 当前显示的面板 ('prompt' 或 'image')
    this.detailImages = [];         // 图像详情模态框中的图像列表
    this.detailCurrentIndex = 0;    // 图像详情当前索引
    this.detailPromptInfo = null;   // 图像详情中关联的提示词信息
    this.currentDetailPromptId = null;  // 当前图像详情中显示的提示词ID
    this.returnToImageDetail = false;   // 是否需要在编辑后返回图像详情
    this.returnToImageDetailIndex = null;   // 返回图像详情时的索引
    this.returnToImageDetailImages = null;  // 返回图像详情时的图像列表

    this.init();
  }

  /**
   * 生成唯一的时间戳
   * 格式: YYMMDD_HHMMSS_MMM (2位年份_月日时分秒_毫秒)
   * @returns {string} 时间戳字符串
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
   * 初始化应用
   * 加载主题、绑定事件、加载数据、初始化面板
   */
  async init() {
    this.initTheme();
    this.bindEvents();
    await this.loadPrompts();
    this.restorePanelState(); // 恢复上次打开的页面
  }

  /**
   * 初始化主题设置
   * 应用保存的主题或默认主题
   */
  initTheme() {
    this.applyTheme(this.currentTheme);
  }

  /**
   * 应用指定主题
   * @param {string} theme - 主题名称 ('light' 或 'dark')
   */
  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // 更新设置中的图标
    const settingsSunIcon = document.getElementById('settingsSunIcon');
    const settingsMoonIcon = document.getElementById('settingsMoonIcon');
    const settingsThemeText = document.getElementById('settingsThemeText');
    if (settingsSunIcon && settingsMoonIcon) {
      if (theme === 'dark') {
        settingsSunIcon.style.display = 'none';
        settingsMoonIcon.style.display = 'inline-block';
      } else {
        settingsSunIcon.style.display = 'inline-block';
        settingsMoonIcon.style.display = 'none';
      }
    }
    if (settingsThemeText) {
      settingsThemeText.textContent = theme === 'dark' ? '明亮' : '暗黑';
    }
  }

  /**
   * 切换主题
   * 在明亮模式和暗黑模式之间切换
   */
  toggleTheme() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
    this.showToast(newTheme === 'dark' ? '已切换到黑暗模式' : '已切换到明亮模式');
  }

  /**
   * 绑定所有 DOM 事件
   * 包括按钮点击、搜索、模态框等事件
   */
  bindEvents() {
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

    // 新建按钮
    document.getElementById('addBtn').addEventListener('click', () => this.openEditModal());
    
    // 搜索
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.debounceSearch();
    });

    // 清除标签筛选
    document.getElementById('clearTagFilter').addEventListener('click', () => this.clearTagFilter());

    // 提示词排序
    const promptSortSelect = document.getElementById('promptSortSelect');
    if (promptSortSelect) {
      promptSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.promptSortBy = sortBy;
        this.promptSortOrder = sortOrder;
        this.loadPrompts();
      });
    }

    // 提示词排序逆序按钮
    const promptSortReverseBtn = document.getElementById('promptSortReverseBtn');
    if (promptSortReverseBtn) {
      promptSortReverseBtn.addEventListener('click', () => {
        this.promptSortOrder = this.promptSortOrder === 'asc' ? 'desc' : 'asc';
        promptSortSelect.value = `${this.promptSortBy}-${this.promptSortOrder}`;
        this.loadPrompts();
      });
    }

    // Modal 关闭
    document.getElementById('cancelBtn').addEventListener('click', () => this.closeEditModal());

    // 保存
    document.getElementById('saveBtn').addEventListener('click', () => this.savePrompt());

    // 阻止表单默认提交行为
    document.getElementById('promptForm').addEventListener('submit', (e) => {
      e.preventDefault();
    });

    // 编辑模态框导航按钮
    document.getElementById('editModalFirstBtn').addEventListener('click', () => this.navigateEditModal('first'));
    document.getElementById('editModalPrevBtn').addEventListener('click', () => this.navigateEditModal(-1));
    document.getElementById('editModalNextBtn').addEventListener('click', () => this.navigateEditModal(1));
    document.getElementById('editModalLastBtn').addEventListener('click', () => this.navigateEditModal('last'));
    
    // 导入导出（现在在设置中）
    document.getElementById('importBtn').addEventListener('click', () => this.importPrompts());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportPrompts());

    // 提示词管理和图像管理按钮
    document.getElementById('promptManagerBtn').addEventListener('click', () => this.openPromptManager());
    document.getElementById('imageManagerBtn').addEventListener('click', () => this.openImageManager());

    // 确认对话框事件
    document.getElementById('closeConfirmModal').addEventListener('click', () => this.closeConfirmModal());
    document.getElementById('confirmCancelBtn').addEventListener('click', () => this.closeConfirmModal());
    document.getElementById('confirmOkBtn').addEventListener('click', () => this.handleConfirmOk());
    document.getElementById('confirmModal').addEventListener('click', (e) => {
      if (e.target.id === 'confirmModal') this.closeConfirmModal();
    });

    // 图像标签管理
    document.getElementById('imageTagManagerBtn').addEventListener('click', () => this.openImageTagManagerModal());
    document.getElementById('closeImageTagManagerModal').addEventListener('click', () => this.closeImageTagManagerModal());

    // 图像标签管理搜索
    const imageTagManagerSearchInput = document.getElementById('imageTagManagerSearchInput');
    if (imageTagManagerSearchInput) {
      imageTagManagerSearchInput.addEventListener('input', (e) => {
        this.renderImageTagManager(e.target.value);
      });
    }

    // 图像搜索
    const imageSearchInput = document.getElementById('imageSearchInput');
    if (imageSearchInput) {
      imageSearchInput.addEventListener('input', (e) => {
        this.imageSearchQuery = e.target.value;
        this.debounceImageSearch();
      });
    }

    // 图像排序
    const imageSortSelect = document.getElementById('imageSortSelect');
    if (imageSortSelect) {
      imageSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imageSortBy = sortBy;
        this.imageSortOrder = sortOrder;
        this.renderImageGrid();
      });
    }

    // 图像排序逆序按钮
    const imageSortReverseBtn = document.getElementById('imageSortReverseBtn');
    if (imageSortReverseBtn) {
      imageSortReverseBtn.addEventListener('click', () => {
        this.imageSortOrder = this.imageSortOrder === 'asc' ? 'desc' : 'asc';
        imageSortSelect.value = `${this.imageSortBy}-${this.imageSortOrder}`;
        this.renderImageGrid();
      });
    }

    // 上传图像按钮
    document.getElementById('uploadImageBtn').addEventListener('click', () => this.openImageUploadModal());

    // 图像上传模态框
    this.bindImageUploadModalEvents();

    // 图像上传
    this.bindImageUploadEvents();

    // 图像查看器事件
    this.bindImageViewerEvents();

    // 设置
    this.bindSettingsEvents();

    // 图像详情模态框
    document.getElementById('closeImageDetailBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeImageDetailModal();
    });
    document.getElementById('imageDetailModal').addEventListener('click', (e) => {
      if (e.target.id === 'imageDetailModal') this.closeImageDetailModal();
    });
    document.getElementById('firstImageBtn').addEventListener('click', () => this.showFirstDetailImage());
    document.getElementById('prevImageBtn').addEventListener('click', () => this.showPrevDetailImage());
    document.getElementById('nextImageBtn').addEventListener('click', () => this.showNextDetailImage());
    document.getElementById('lastImageBtn').addEventListener('click', () => this.showLastDetailImage());

    // 从图像详情界面编辑提示词
    document.getElementById('editPromptFromImageBtn').addEventListener('click', () => this.editPromptFromImageDetail());





    // 保存图像备注
    document.getElementById('saveImageNoteBtn').addEventListener('click', () => this.saveImageNote());

    // 保存图像文件名
    document.getElementById('saveImageFileNameBtn').addEventListener('click', () => this.saveImageFileName());

    // 文件名输入变化时显示保存按钮
    const fileNameInput = document.getElementById('imageDetailFileName');
    fileNameInput.addEventListener('input', (e) => {
      const saveBtn = document.getElementById('saveImageFileNameBtn');
      const currentImage = this.detailImages[this.detailCurrentIndex];
      if (currentImage && e.target.value !== currentImage.fileName) {
        saveBtn.style.display = 'inline-flex';
      } else {
        saveBtn.style.display = 'none';
      }
    });

    // 文件名输入框回车保存
    fileNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.saveImageFileName();
      }
    });

    // 图像标签输入自动补全
    this.setupImageTagAutocomplete();

    // 提示词标签输入自动补全
    this.setupPromptTagAutocomplete();

    // 缩略图尺寸控制
    this.setupThumbnailSizeControl();

    // 提示词卡片尺寸控制
    this.setupPromptCardSizeControl();

    // 图像标签筛选清除按钮
    document.getElementById('clearImageTagFilter').addEventListener('click', () => this.clearImageTagFilter());

    // 点击 Modal 外部关闭
    document.getElementById('editModal').addEventListener('click', (e) => {
      if (e.target.id === 'editModal') this.closeEditModal();
    });
    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') this.closeSettingsModal();
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeEditModal();
        this.closeSettingsModal();
        this.closeImageDetailModal();
      }
      // 编辑模态框键盘导航（全屏图像查看器打开时不触发）
      const imageViewer = document.getElementById('imageViewer');
      if (document.getElementById('editModal').classList.contains('active') &&
          !(imageViewer && imageViewer.classList.contains('active'))) {
        if (e.key === 'Home') {
          e.preventDefault();
          this.navigateEditModal('first');
        } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          this.navigateEditModal(-1);
        } else if (e.key === 'PageDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          this.navigateEditModal(1);
        } else if (e.key === 'End') {
          e.preventDefault();
          this.navigateEditModal('last');
        }
      }
      // 图像详情页面键盘导航
      if (document.getElementById('imageDetailModal').classList.contains('active')) {
        // 如果焦点在输入框或文本域中，不处理导航快捷键
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA'
        );

        if (!isInputFocused) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.showPrevDetailImage();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.showNextDetailImage();
          } else if (e.key === 'Home') {
            e.preventDefault();
            this.showFirstDetailImage();
          } else if (e.key === 'End') {
            e.preventDefault();
            this.showLastDetailImage();
          }
        }
      }
    });
  }

  // 绑定设置事件
  /**
   * 绑定设置相关事件
   * 包括设置、回收站、标签管理等按钮事件
   */
  bindSettingsEvents() {
    // 打开设置
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettingsModal());

    // 关闭设置
    document.getElementById('closeSettingsModal').addEventListener('click', () => this.closeSettingsModal());

    // 主题切换（设置中）
    const settingsThemeToggle = document.getElementById('settingsThemeToggle');
    if (settingsThemeToggle) {
      settingsThemeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // 更改数据目录
    document.getElementById('changeDataPathBtn').addEventListener('click', () => this.changeDataPath());

    // 清理未引用图像
    document.getElementById('cleanupImagesBtn').addEventListener('click', () => this.cleanupUnusedImages());

    // 一键清空所有数据
    document.getElementById('clearAllDataBtn').addEventListener('click', () => this.clearAllData());

    // 刷新应用
    document.getElementById('refreshBtn').addEventListener('click', () => this.refreshApp());

    // 刷新数据（重新读取数据库）
    document.getElementById('reloadBtn').addEventListener('click', () => this.reloadData());

    // 回收站（提示词管理面板）
    document.getElementById('recycleBinBtn').addEventListener('click', () => this.openRecycleBinModal());
    document.getElementById('closeRecycleBinModal').addEventListener('click', () => this.closeRecycleBinModal());
    document.getElementById('emptyRecycleBinBtn').addEventListener('click', () => this.emptyRecycleBin());

    // 回收站（图像管理面板）
    document.getElementById('imageRecycleBinBtn').addEventListener('click', () => this.openImageRecycleBinModal());
    document.getElementById('closeImageRecycleBinModal').addEventListener('click', () => this.closeImageRecycleBinModal());
    document.getElementById('emptyImageRecycleBinBtn').addEventListener('click', () => this.emptyImageRecycleBin());

    // 提示词标签管理
    document.getElementById('promptTagManagerBtn').addEventListener('click', () => this.openPromptTagManagerModal());
    document.getElementById('closePromptTagManagerModal').addEventListener('click', () => this.closePromptTagManagerModal());

    // 标签管理搜索
    const tagManagerSearchInput = document.getElementById('tagManagerSearchInput');
    if (tagManagerSearchInput) {
      tagManagerSearchInput.addEventListener('input', (e) => {
        this.renderPromptTagManager(e.target.value);
      });
    }

    // 统计
    document.getElementById('statisticsBtn').addEventListener('click', () => this.openStatisticsModal());
    document.getElementById('closeStatisticsModal').addEventListener('click', () => this.closeStatisticsModal());
    document.getElementById('closeStatisticsBtn').addEventListener('click', () => this.closeStatisticsModal());
    document.getElementById('statisticsModal').addEventListener('click', (e) => {
      if (e.target.id === 'statisticsModal') this.closeStatisticsModal();
    });

    // 键盘快捷键 - 统计模态框
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeStatisticsModal();
      }
    });
  }

  /**
   * 打开设置模态框
   * 显示当前数据路径
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
    document.getElementById('settingsModal').classList.remove('active');
  }

  /**
   * 更改数据存储目录
   * 打开目录选择对话框，选择新的数据存储位置
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
      this.showToast('更改失败: ' + error.message, 'error');
    }
  }

  /**
   * 清理未引用的图像文件
   * 删除所有未被 Prompt 使用的图像和缩略图
   */
  async cleanupUnusedImages() {
    if (!confirm('确定要清理未引用的图像吗？\n这将删除所有未被 Prompt 使用的图像文件，此操作不可恢复。')) {
      return;
    }

    try {
      const result = await window.electronAPI.cleanupUnusedImages();
      if (result.totalDeleted > 0) {
        this.showToast(`清理完成：删除 ${result.deletedImages} 个图像，${result.deletedThumbnails} 个缩略图`, 'success');
      } else {
        this.showToast('没有需要清理的图像', 'success');
      }
    } catch (error) {
      console.error('Failed to cleanup images:', error);
      this.showToast('清理失败: ' + error.message, 'error');
    }
  }

  /**
   * 清空所有数据
   * 删除所有提示词、图像和标签，不可恢复
   */
  async clearAllData() {
    const confirmed = await this.showConfirmDialog(
      '⚠️ 危险操作',
      '确定要清空所有数据吗？\n\n此操作将永久删除：\n- 所有提示词\n- 所有图像\n- 所有标签\n\n此操作不可恢复！'
    );
    if (!confirmed) return;

    try {
      await window.electronAPI.clearAllData();
      this.showToast('所有数据已清空', 'success');
      // 刷新界面
      await this.loadPrompts();
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to clear all data:', error);
      this.showToast('清空失败: ' + error.message, 'error');
    }
  }

  /**
   * 重启应用
   * 显示确认对话框后重启 Electron 应用
   */
  async refreshApp() {
    const confirmed = await this.showConfirmDialog('确认重启', '确定要重启应用吗？未保存的数据可能会丢失。');
    if (!confirmed) return;

    try {
      this.showToast('正在重启应用...', 'success');
      await window.electronAPI.relaunchApp();
    } catch (error) {
      console.error('Failed to restart app:', error);
      this.showToast('重启失败: ' + error.message, 'error');
    }
  }

  /**
   * 刷新数据
   * 重新读取数据库并刷新界面显示
   */
  async reloadData() {
    try {
      this.showToast('正在刷新数据...', 'success');
      await this.loadPrompts();
      if (this.currentPanel === 'image') {
        await this.renderImageGrid();
      }
      this.showToast('数据已刷新', 'success');
    } catch (error) {
      console.error('Failed to reload data:', error);
      this.showToast('刷新失败: ' + error.message, 'error');
    }
  }

  /**
   * 打开回收站模态框
   * 显示已删除的 Prompt 列表
   */
  async openRecycleBinModal() {
    const modal = document.getElementById('recycleBinModal');
    await this.renderRecycleBin();
    modal.style.display = 'flex';
  }

  /**
   * 关闭回收站模态框
   */
  closeRecycleBinModal() {
    const modal = document.getElementById('recycleBinModal');
    modal.style.display = 'none';
  }

  /**
   * 渲染回收站列表
   * 显示所有已删除的 Prompt 项目
   */
  async renderRecycleBin() {
    try {
      const items = await window.electronAPI.getRecycleBin();
      const listContainer = document.getElementById('recycleBinList');
      const emptyState = document.getElementById('recycleBinEmpty');

      if (items.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
      }

      listContainer.style.display = 'flex';
      emptyState.style.display = 'none';

      // 按删除时间倒序排列
      items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

      // 异步获取每个提示词的关联图像缩略图
      const itemCards = await Promise.all(
        items.map(async (item) => {
          const deletedDate = new Date(item.deletedAt).toLocaleString('zh-CN');
          let thumbnailHtml = '';

          try {
            // 获取提示词关联的图像
            const promptImages = await window.electronAPI.getPromptImages(item.id);
            if (promptImages && promptImages.length > 0) {
              const firstImage = promptImages[0];
              const imagePath = firstImage.thumbnailPath || firstImage.relativePath;
              if (imagePath) {
                const fullPath = await window.electronAPI.getImagePath(imagePath);
                thumbnailHtml = `<img src="file://${fullPath}" alt="${this.escapeHtml(item.title)}" class="recycle-bin-item-thumbnail">`;
              }
            }
          } catch (error) {
            console.error('Failed to get prompt thumbnail:', error);
          }

          // 如果没有缩略图，显示占位符
          if (!thumbnailHtml) {
            thumbnailHtml = `<div class="recycle-bin-item-thumbnail-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`;
          }

          // 截断提示词内容（最多显示100字符）
          const contentPreview = item.content ? (item.content.length > 100 ? item.content.substring(0, 100) + '...' : item.content) : '';

          return `
            <div class="recycle-bin-item" data-id="${item.id}">
              ${thumbnailHtml}
              <div class="recycle-bin-item-info">
                <div class="recycle-bin-item-title">${this.escapeHtml(item.title)}</div>
                <div class="recycle-bin-item-content">${this.escapeHtml(contentPreview)}</div>
                <div class="recycle-bin-item-date">删除时间: ${deletedDate}</div>
              </div>
              <div class="recycle-bin-item-actions">
                <button class="btn btn-primary btn-sm recycle-action-btn" data-id="${item.id}">恢复</button>
                <button class="btn btn-danger btn-sm recycle-action-btn" data-id="${item.id}">彻底删除</button>
              </div>
            </div>
          `;
        })
      );

      listContainer.innerHTML = itemCards.join('');

      // 绑定恢复按钮事件
      listContainer.querySelectorAll('.recycle-action-btn').forEach((btn, index) => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          if (index % 2 === 0) {
            await this.restoreFromRecycleBin(id);
          } else {
            await this.permanentlyDelete(id);
          }
        });
      });
    } catch (error) {
      console.error('Failed to render recycle bin:', error);
      this.showToast('加载回收站失败', 'error');
    }
  }

  /**
   * 从回收站恢复 Prompt
   * @param {string} id - 要恢复的 Prompt ID
   */
  async restoreFromRecycleBin(id) {
    try {
      await window.electronAPI.restoreFromRecycleBin(id);
      this.showToast('已恢复到列表');
      await this.renderRecycleBin();
      await this.loadPrompts();
    } catch (error) {
      console.error('Failed to restore:', error);
      this.showToast('恢复失败: ' + error.message, 'error');
    }
  }

  /**
   * 彻底删除 Prompt
   * @param {string} id - 要删除的 Prompt ID
   */
  async permanentlyDelete(id) {
    const confirmed = await this.showConfirmDialog('确认彻底删除', '确定要彻底删除这个 Prompt 吗？此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.permanentlyDelete(id);
      this.showToast('已彻底删除');
      await this.renderRecycleBin();
    } catch (error) {
      console.error('Failed to delete:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 清空回收站
   * 删除所有回收站中的项目
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
      this.showToast('清空失败: ' + error.message, 'error');
    }
  }

  // ==================== 图像回收站功能 ====================

  /**
   * 打开图像回收站模态框
   */
  async openImageRecycleBinModal() {
    const modal = document.getElementById('imageRecycleBinModal');
    await this.renderImageRecycleBin();
    modal.style.display = 'flex';
  }

  /**
   * 关闭图像回收站模态框
   */
  closeImageRecycleBinModal() {
    const modal = document.getElementById('imageRecycleBinModal');
    modal.style.display = 'none';
  }

  /**
   * 渲染图像回收站列表
   * 显示所有已删除的图像
   */
  async renderImageRecycleBin() {
    try {
      const items = await window.electronAPI.getImageRecycleBin();
      const listContainer = document.getElementById('imageRecycleBinList');
      const emptyState = document.getElementById('imageRecycleBinEmpty');

      if (items.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
      }

      listContainer.style.display = 'flex';
      emptyState.style.display = 'none';

      // 按删除时间倒序排列
      items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

      // 异步获取缩略图路径
      const itemCards = await Promise.all(
        items.map(async (item) => {
          const deletedDate = new Date(item.deletedAt).toLocaleString('zh-CN');
          let thumbnailHtml = '';
          
          try {
            const imagePath = item.thumbnailPath || item.relativePath;
            if (imagePath) {
              const fullPath = await window.electronAPI.getImagePath(imagePath);
              thumbnailHtml = `<img src="file://${fullPath}" alt="${this.escapeHtml(item.fileName)}" class="recycle-bin-item-thumbnail">`;
            }
          } catch (error) {
            console.error('Failed to get image path:', error);
          }
          
          return `
            <div class="recycle-bin-item" data-id="${item.id}">
              ${thumbnailHtml}
              <div class="recycle-bin-item-info">
                <div class="recycle-bin-item-title">${this.escapeHtml(item.fileName)}</div>
                <div class="recycle-bin-item-date">删除时间: ${deletedDate}</div>
                ${item.width && item.height ? `<div class="recycle-bin-item-meta">尺寸: ${item.width}x${item.height}</div>` : ''}
              </div>
              <div class="recycle-bin-item-actions">
                <button class="btn btn-secondary btn-sm restore-image-btn" data-id="${item.id}">恢复</button>
                <button class="btn btn-danger btn-sm permanent-delete-image-btn" data-id="${item.id}">彻底删除</button>
              </div>
            </div>
          `;
        })
      );

      listContainer.innerHTML = itemCards.join('');

      // 绑定恢复按钮事件
      listContainer.querySelectorAll('.restore-image-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.dataset.id;
          this.restoreImage(id);
        });
      });

      // 绑定彻底删除按钮事件
      listContainer.querySelectorAll('.permanent-delete-image-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.dataset.id;
          this.permanentlyDeleteImage(id);
        });
      });
    } catch (error) {
      console.error('Failed to render image recycle bin:', error);
      this.showToast('加载图像回收站失败', 'error');
    }
  }

  /**
   * 恢复图像
   * @param {string} id - 要恢复的图像 ID
   */
  async restoreImage(id) {
    try {
      await window.electronAPI.restoreImage(id);
      this.showToast('图像已恢复');
      await this.renderImageRecycleBin();
      await this.renderImageGrid();
    } catch (error) {
      console.error('Failed to restore image:', error);
      this.showToast('恢复失败: ' + error.message, 'error');
    }
  }

  /**
   * 彻底删除图像
   * @param {string} id - 要删除的图像 ID
   */
  async permanentlyDeleteImage(id) {
    const confirmed = await this.showConfirmDialog('确认彻底删除', '确定要彻底删除这个图像吗？此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.permanentDeleteImage(id);
      this.showToast('图像已彻底删除');
      await this.renderImageRecycleBin();
    } catch (error) {
      console.error('Failed to delete image:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 清空图像回收站
   * 删除所有图像回收站中的项目
   */
  async emptyImageRecycleBin() {
    const confirmed = await this.showConfirmDialog('确认清空图像回收站', '确定要清空图像回收站吗？所有图像将被彻底删除，此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.emptyImageRecycleBin();
      this.showToast('图像回收站已清空');
      await this.renderImageRecycleBin();
    } catch (error) {
      console.error('Failed to empty image recycle bin:', error);
      this.showToast('清空失败: ' + error.message, 'error');
    }
  }

  /**
   * 打开提示词标签管理 Modal
   */
  async openPromptTagManagerModal() {
    const modal = document.getElementById('promptTagManagerModal');
    await this.renderPromptTagManager();
    modal.style.display = 'flex';
  }

  /**
   * 关闭提示词标签管理 Modal
   */
  closePromptTagManagerModal() {
    const modal = document.getElementById('promptTagManagerModal');
    modal.style.display = 'none';
  }

  /**
   * 渲染提示词标签管理列表
   * 显示所有提示词标签及其使用数量
   */
  async renderPromptTagManager(searchTerm = '') {
    try {
      const tags = await window.electronAPI.getPromptTags();
      const listContainer = document.getElementById('promptTagManagerList');
      const specialTagsContainer = document.getElementById('promptTagManagerSpecialTags');
      const emptyState = document.getElementById('promptTagManagerEmpty');

      // 计算每个标签的使用数量
      const tagCounts = {};
      this.prompts.forEach(prompt => {
        if (prompt.tags && prompt.tags.length > 0) {
          prompt.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      // 特殊标签列表（总是显示，不支持删除和编辑）
      const specialTags = [
        PromptManager.FAVORITE_TAG,
        PromptManager.MULTI_IMAGE_TAG,
        PromptManager.NO_IMAGE_TAG
      ];

      // 计算特殊标签的数量
      const favoriteCount = this.prompts.filter(p => p.isFavorite).length;
      const multiImageCount = this.prompts.filter(p => p.images && p.images.length >= 2).length;
      const noImageCount = this.prompts.filter(p => !p.images || p.images.length === 0).length;

      tagCounts[PromptManager.FAVORITE_TAG] = favoriteCount;
      tagCounts[PromptManager.MULTI_IMAGE_TAG] = multiImageCount;
      tagCounts[PromptManager.NO_IMAGE_TAG] = noImageCount;

      // 渲染特殊标签到上方区域
      if (specialTagsContainer) {
        specialTagsContainer.innerHTML = specialTags.map(tag => {
          const count = tagCounts[tag] || 0;
          return `
            <div class="tag-manager-item special-tag" data-tag="${this.escapeHtml(tag)}">
              <div class="tag-manager-badges">
                <span class="tag-badge-count">${count}</span>
              </div>
              <div class="tag-manager-item-name">${this.escapeHtml(tag)}</div>
            </div>
          `;
        }).join('');
      }

      // 根据搜索词过滤普通标签（不包含特殊标签）
      const filteredTags = searchTerm
        ? tags.filter(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
        : tags;

      if (filteredTags.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        emptyState.querySelector('p').textContent = searchTerm ? '没有找到匹配的标签' : '暂无提示词标签';
        return;
      }

      listContainer.style.display = 'flex';
      emptyState.style.display = 'none';

      // 普通标签按数量排序
      const sortedTags = filteredTags.sort((a, b) => {
        return (tagCounts[b] || 0) - (tagCounts[a] || 0);
      });

      listContainer.innerHTML = sortedTags.map(tag => {
        const count = tagCounts[tag] || 0;
        return `
          <div class="tag-manager-item" data-tag="${this.escapeHtml(tag)}">
            <div class="tag-manager-badges">
              <button class="tag-badge-btn tag-badge-delete" data-tag="${this.escapeHtml(tag)}" title="删除">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
              <button class="tag-badge-btn tag-badge-edit" data-tag="${this.escapeHtml(tag)}" title="编辑">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <span class="tag-badge-count">${count}</span>
            </div>
            <div class="tag-manager-item-name">${this.escapeHtml(tag)}</div>
          </div>
        `;
      }).join('');

      // 绑定删除按钮事件
      listContainer.querySelectorAll('.tag-badge-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tag = btn.dataset.tag;
          await this.deletePromptTag(tag);
        });
      });

      // 绑定编辑按钮事件
      listContainer.querySelectorAll('.tag-badge-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tag = btn.dataset.tag;
          this.startRenamePromptTag(tag);
        });
      });
    } catch (error) {
      console.error('Failed to render prompt tag manager:', error);
      this.showToast('加载提示词标签失败', 'error');
    }
  }

  /**
   * 开始重命名提示词标签
   * 将标签名称转换为可编辑的输入框
   * @param {string} oldTag - 原标签名称
   */
  startRenamePromptTag(oldTag) {
    const item = document.querySelector(`.tag-manager-item[data-tag="${oldTag}"]`);
    if (!item) return;

    const nameContainer = item.querySelector('.tag-manager-item-name');
    nameContainer.classList.add('editing');
    nameContainer.innerHTML = `
      <input type="text" value="${oldTag}" class="rename-tag-input">
      <div class="tag-edit-actions">
        <button class="btn btn-primary btn-sm confirm-rename-btn">确认</button>
        <button class="btn btn-secondary btn-sm cancel-rename-btn">取消</button>
      </div>
    `;

    const input = nameContainer.querySelector('.rename-tag-input');
    input.focus();
    input.select();

    const confirmBtn = nameContainer.querySelector('.confirm-rename-btn');
    const cancelBtn = nameContainer.querySelector('.cancel-rename-btn');

    confirmBtn.addEventListener('click', async () => {
      const newTag = input.value.trim();
      if (newTag && newTag !== oldTag) {
        await this.renamePromptTag(oldTag, newTag);
      } else {
        await this.renderPromptTagManager();
      }
    });

    cancelBtn.addEventListener('click', async () => {
      await this.renderPromptTagManager();
    });

    input.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const newTag = input.value.trim();
        if (newTag && newTag !== oldTag) {
          await this.renamePromptTag(oldTag, newTag);
        } else {
          await this.renderPromptTagManager();
        }
      } else if (e.key === 'Escape') {
        await this.renderPromptTagManager();
      }
    });
  }

  /**
   * 重命名提示词标签
   * 更新标签名称并同步到所有使用该标签的 Prompt
   * @param {string} oldTag - 原标签名称
   * @param {string} newTag - 新标签名称
   */
  async renamePromptTag(oldTag, newTag) {
    try {
      await window.electronAPI.renamePromptTag(oldTag, newTag);
      this.showToast('提示词标签已重命名');
      await this.loadPrompts();
      await this.renderPromptTagManager();
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to rename prompt tag:', error);
      this.showToast('重命名失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除提示词标签
   * 从标签列表中删除，并从所有 Prompt 中移除该标签
   * @param {string} tag - 要删除的标签名称
   */
  async deletePromptTag(tag) {
    const confirmed = await this.showConfirmDialog('确认删除提示词标签', `确定要删除提示词标签 "${tag}" 吗？此标签将从所有 Prompt 中移除。`);
    if (!confirmed) return;

    try {
      await window.electronAPI.deletePromptTag(tag);
      this.showToast('提示词标签已删除');
      await this.renderPromptTagManager();
      await this.loadPrompts();
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to delete prompt tag:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 打开图像标签管理 Modal
   * 显示所有图像标签并支持管理
   */
  async openImageTagManagerModal() {
    const modal = document.getElementById('imageTagManagerModal');
    await this.renderImageTagManager();
    modal.style.display = 'flex';
  }

  /**
   * 关闭图像标签管理 Modal
   */
  closeImageTagManagerModal() {
    const modal = document.getElementById('imageTagManagerModal');
    modal.style.display = 'none';
  }

  /**
   * 渲染图像标签管理列表
   * 显示所有图像标签及其使用数量
   * @param {string} searchTerm - 搜索关键词
   */
  async renderImageTagManager(searchTerm = '') {
    try {
      const tags = await window.electronAPI.getImageTags();
      const listContainer = document.getElementById('imageTagManagerList');
      const specialTagsContainer = document.getElementById('imageTagManagerSpecialTags');
      const emptyState = document.getElementById('imageTagManagerEmpty');

      // 计算每个标签的使用数量
      const allImages = await window.electronAPI.getImages();
      const tagCounts = {};
      allImages.forEach(image => {
        if (image.tags && image.tags.length > 0) {
          image.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      // 特殊标签列表（总是显示，不支持删除和编辑）
      const specialTags = [
        PromptManager.FAVORITE_TAG,
        PromptManager.UNREFERENCED_TAG,
        PromptManager.MULTI_REF_TAG
      ];

      // 计算特殊标签的数量
      const favoriteCount = allImages.filter(img => img.isFavorite).length;
      const unreferencedCount = allImages.filter(img => !img.promptRefs || img.promptRefs.length === 0).length;
      const multiRefCount = allImages.filter(img => img.promptRefs && img.promptRefs.length > 1).length;

      tagCounts[PromptManager.FAVORITE_TAG] = favoriteCount;
      tagCounts[PromptManager.UNREFERENCED_TAG] = unreferencedCount;
      tagCounts[PromptManager.MULTI_REF_TAG] = multiRefCount;

      // 渲染特殊标签到上方区域
      if (specialTagsContainer) {
        specialTagsContainer.innerHTML = specialTags.map(tag => {
          const count = tagCounts[tag] || 0;
          return `
            <div class="tag-manager-item special-tag" data-tag="${this.escapeHtml(tag)}">
              <div class="tag-manager-badges">
                <span class="tag-badge-count">${count}</span>
              </div>
              <div class="tag-manager-item-name">${this.escapeHtml(tag)}</div>
            </div>
          `;
        }).join('');
      }

      // 根据搜索词过滤普通标签（不包含特殊标签）
      const filteredTags = searchTerm
        ? tags.filter(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
        : tags;

      if (filteredTags.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        emptyState.querySelector('p').textContent = searchTerm ? '没有找到匹配的标签' : '暂无图像标签';
        return;
      }

      listContainer.style.display = 'flex';
      emptyState.style.display = 'none';

      // 普通标签按数量排序
      const sortedTags = filteredTags.sort((a, b) => {
        return (tagCounts[b] || 0) - (tagCounts[a] || 0);
      });

      listContainer.innerHTML = sortedTags.map(tag => {
        const count = tagCounts[tag] || 0;
        return `
          <div class="tag-manager-item" data-tag="${this.escapeHtml(tag)}">
            <div class="tag-manager-badges">
              <button class="tag-badge-btn tag-badge-delete" data-tag="${this.escapeHtml(tag)}" title="删除">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
              <button class="tag-badge-btn tag-badge-edit" data-tag="${this.escapeHtml(tag)}" title="编辑">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <span class="tag-badge-count">${count}</span>
            </div>
            <div class="tag-manager-item-name">${this.escapeHtml(tag)}</div>
          </div>
        `;
      }).join('');

      // 绑定删除按钮事件
      listContainer.querySelectorAll('.tag-badge-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tag = btn.dataset.tag;
          await this.deleteImageTag(tag);
        });
      });

      // 绑定编辑按钮事件
      listContainer.querySelectorAll('.tag-badge-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tag = btn.dataset.tag;
          this.startRenameImageTag(tag);
        });
      });
    } catch (error) {
      console.error('Failed to render image tag manager:', error);
      this.showToast('加载图像标签失败', 'error');
    }
  }

  /**
   * 开始重命名图像标签
   * 将标签名称转换为可编辑的输入框
   * @param {string} oldTag - 原标签名称
   */
  startRenameImageTag(oldTag) {
    const item = document.querySelector(`.tag-manager-item[data-tag="${oldTag}"]`);
    if (!item) return;

    const nameContainer = item.querySelector('.tag-manager-item-name');
    nameContainer.classList.add('editing');
    nameContainer.innerHTML = `
      <input type="text" value="${oldTag}" class="rename-tag-input">
      <div class="tag-edit-actions">
        <button class="btn btn-primary btn-sm confirm-rename-btn">确认</button>
        <button class="btn btn-secondary btn-sm cancel-rename-btn">取消</button>
      </div>
    `;

    const input = nameContainer.querySelector('.rename-tag-input');
    input.focus();
    input.select();

    const confirmBtn = nameContainer.querySelector('.confirm-rename-btn');
    const cancelBtn = nameContainer.querySelector('.cancel-rename-btn');

    confirmBtn.addEventListener('click', async () => {
      const newTag = input.value.trim();
      if (newTag && newTag !== oldTag) {
        await this.renameImageTag(oldTag, newTag);
      } else {
        await this.renderImageTagManager();
      }
    });

    cancelBtn.addEventListener('click', async () => {
      await this.renderImageTagManager();
    });

    input.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const newTag = input.value.trim();
        if (newTag && newTag !== oldTag) {
          await this.renameImageTag(oldTag, newTag);
        } else {
          await this.renderImageTagManager();
        }
      } else if (e.key === 'Escape') {
        await this.renderImageTagManager();
      }
    });
  }

  /**
   * 重命名图像标签
   * 更新标签名称并同步到所有使用该标签的图像
   * @param {string} oldTag - 原标签名称
   * @param {string} newTag - 新标签名称
   */
  async renameImageTag(oldTag, newTag) {
    try {
      await window.electronAPI.renameImageTag(oldTag, newTag);
      this.showToast('图像标签已重命名');
      await this.renderImageTagManager();
      await this.renderImageTagFilters();
    } catch (error) {
      console.error('Failed to rename image tag:', error);
      this.showToast('重命名失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除图像标签
   * 从标签列表中删除，并从所有图像中移除该标签
   * @param {string} tag - 要删除的标签名称
   */
  async deleteImageTag(tag) {
    const confirmed = await this.showConfirmDialog('确认删除图像标签', `确定要删除图像标签 "${tag}" 吗？此标签将从所有图像中移除。`);
    if (!confirmed) return;

    try {
      await window.electronAPI.deleteImageTag(tag);
      this.showToast('图像标签已删除');
      await this.renderImageTagManager();
      await this.renderImageTagFilters();
    } catch (error) {
      console.error('Failed to delete image tag:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 防抖搜索
   * 延迟 300ms 执行搜索，避免频繁触发
   */
  debounceSearch() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.performSearch(), 300);
  }

  /**
   * 防抖图像搜索
   * 延迟 300ms 执行搜索，避免频繁触发
   */
  debounceImageSearch() {
    clearTimeout(this.imageSearchTimeout);
    this.imageSearchTimeout = setTimeout(() => this.performImageSearch(), 300);
  }

  /**
   * 执行图像搜索
   * 根据搜索关键词过滤图像列表
   */
  async performImageSearch() {
    await this.renderImageGrid();
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
      } catch (error) {
        console.error('Failed to save image:', error);
        this.showToast('保存图像失败: ' + error.message, 'error');
      }
    }
    this.renderImagePreviews();
  }

  // 渲染图像预览
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
        const img = allImages.find(i => i.id === imgRef.id);
        if (!img) return '';
        const imagePath = await window.electronAPI.getImagePath(img.relativePath);
        return `
          <div class="image-preview-item" data-index="${index}">
            <img src="file://${imagePath}" alt="${img.fileName}">
            <button type="button" class="view-image" data-index="${index}" title="查看">
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
      });
    });

    // 绑定查看事件 - 打开图像详情界面
    container.querySelectorAll('.view-image').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);

        // 准备图像数据
        const detailImages = await Promise.all(
          validImages.map(async (imgRef) => {
            const img = allImages.find(i => i.id === imgRef.id);
            if (!img) return null;
            const imagePath = await window.electronAPI.getImagePath(img.relativePath);
            return {
              ...img,
              fullPath: imagePath
            };
          })
        );
        // 过滤掉无效的图像
        const validDetailImages = detailImages.filter(img => img !== null);
        if (validDetailImages.length > 0) {
          const currentImage = validDetailImages[index];
          // 查找关联的提示词信息
          const promptInfo = this.prompts.find(p => 
            p.images && p.images.some(imgRef => imgRef.id === currentImage.id)
          );
          await this.openImageDetailModal(currentImage, promptInfo || null, validDetailImages, index);
        }
      });
    });

    // 绑定双击事件 - 打开图像查看器
    container.querySelectorAll('.image-preview-item').forEach((item) => {
      item.addEventListener('dblclick', async () => {
        // 从 data-index 获取正确的索引
        const index = parseInt(item.dataset.index);
        // 准备图像数据
        const viewerImages = await Promise.all(
          validImages.map(async (imgRef) => {
            const img = allImages.find(i => i.id === imgRef.id);
            if (!img) return null;
            const imagePath = await window.electronAPI.getImagePath(img.relativePath);
            return {
              ...img,
              fullPath: imagePath
            };
          })
        );
        // 过滤掉无效的图像
        const validViewerImages = viewerImages.filter(img => img !== null);
        if (validViewerImages.length > 0) {
          await this.openImageViewer(validViewerImages, index);
        }
      });
    });

    // 绑定右键菜单事件
    container.querySelectorAll('.image-preview-item').forEach((item) => {
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // 从 data-index 获取正确的索引
        const index = parseInt(item.dataset.index);
        this.showImageContextMenu(e, index);
      });
    });
  }

  /**
   * 渲染编辑页面的提示词标签列表
   */
  renderEditPromptTags() {
    const container = document.getElementById('editPromptTagsList');
    if (!container) return;

    if (this.editPromptTags && this.editPromptTags.length > 0) {
      container.innerHTML = this.editPromptTags.map(tag =>
        `<span class="tag tag-removable" data-tag="${this.escapeHtml(tag)}">
          ${this.escapeHtml(tag)}
          <span class="tag-remove-btn" title="删除标签">×</span>
        </span>`
      ).join('');

      // 绑定删除事件
      container.querySelectorAll('.tag-remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tagElement = btn.closest('.tag-removable');
          const tagName = tagElement.dataset.tag;
          await this.removeEditPromptTag(tagName);
        });
      });
    } else {
      container.innerHTML = '';
    }
  }

  /**
   * 删除编辑页面的提示词标签
   * @param {string} tagName - 标签名称
   */
  async removeEditPromptTag(tagName) {
    const confirmed = await this.showConfirmDialog('确认删除标签', `确定要删除标签 "${tagName}" 吗？`);
    if (!confirmed) return;

    const index = this.editPromptTags.indexOf(tagName);
    if (index > -1) {
      this.editPromptTags.splice(index, 1);
      this.renderEditPromptTags();
    }
  }

  /**
   * 添加标签到编辑页面
   * @param {string} tag - 标签名称
   */
  addEditPromptTag(tag) {
    tag = tag.trim();
    if (tag && !this.editPromptTags.includes(tag)) {
      this.editPromptTags.push(tag);
      this.renderEditPromptTags();
    }
  }

  /**
   * 显示图像右键菜单
   * @param {MouseEvent} e - 鼠标事件
   * @param {number} index - 图像索引
   */
  showImageContextMenu(e, index) {
    // 移除已有的右键菜单
    const existingMenu = document.getElementById('imageContextMenu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 创建右键菜单
    const menu = document.createElement('div');
    menu.id = 'imageContextMenu';
    menu.className = 'context-menu';
    menu.innerHTML = `
      <div class="context-menu-item" data-action="setFirst">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="17 11 12 6 7 11"></polyline>
          <polyline points="17 18 12 13 7 18"></polyline>
        </svg>
        固定为首图
      </div>
    `;

    // 设置菜单位置
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.zIndex = '9999';

    document.body.appendChild(menu);

    // 绑定菜单项点击事件
    menu.querySelector('.context-menu-item').addEventListener('click', () => {
      this.setImageAsFirst(index);
      menu.remove();
    });

    // 点击其他地方关闭菜单
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }

  /**
   * 将指定图像设置为第一张（首图）
   * @param {number} index - 图像索引
   */
  setImageAsFirst(index) {
    if (index <= 0 || index >= this.currentImages.length) return;

    // 将指定图像移到数组第一位
    const image = this.currentImages.splice(index, 1)[0];
    this.currentImages.unshift(image);

    // 重新渲染
    this.renderImagePreviews();
    this.showToast('已固定为首图', 'success');
  }

  // 绑定图像查看器事件
  bindImageViewerEvents() {
    const viewer = document.getElementById('imageViewer');
    const closeBtn = document.getElementById('imageViewerClose');
    const firstBtn = document.getElementById('imageViewerFirst');
    const prevBtn = document.getElementById('imageViewerPrev');
    const nextBtn = document.getElementById('imageViewerNext');
    const lastBtn = document.getElementById('imageViewerLast');
    const clickLeft = document.getElementById('imageViewerClickLeft');
    const clickRight = document.getElementById('imageViewerClickRight');
    const wrapper = document.getElementById('imageViewerWrapper');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeImageViewer());
    }

    if (firstBtn) {
      firstBtn.addEventListener('click', () => this.showFirstImage());
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.showPrevImage());
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.showNextImage());
    }

    if (lastBtn) {
      lastBtn.addEventListener('click', () => this.showLastImage());
    }

    // 点击左右区域切换
    if (clickLeft) {
      clickLeft.addEventListener('click', () => this.showPrevImage());
    }

    if (clickRight) {
      clickRight.addEventListener('click', () => this.showNextImage());
    }

    // 点击遮罩关闭
    if (viewer) {
      viewer.addEventListener('click', (e) => {
        if (e.target.classList.contains('image-viewer-overlay')) {
          this.closeImageViewer();
        }
      });
    }

    // 滚轮缩放
    if (wrapper) {
      wrapper.addEventListener('wheel', (e) => this.handleImageZoom(e), { passive: false });
    }

    // 拖拽移动
    this.bindImageDrag();

    // 键盘导航
    document.addEventListener('keydown', (e) => {
      if (!viewer.classList.contains('active')) return;

      if (e.key === 'Escape') {
        this.closeImageViewer();
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.showFirstImage();
      } else if (e.key === 'ArrowLeft') {
        this.showPrevImage();
      } else if (e.key === 'ArrowRight') {
        this.showNextImage();
      } else if (e.key === 'End') {
        e.preventDefault();
        this.showLastImage();
      }
    });
  }

  // 处理图像缩放
  handleImageZoom(e) {
    e.preventDefault();
    const img = document.getElementById('imageViewerImg');
    if (!img) return;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.viewerZoom = (this.viewerZoom || 1) * delta;

    // 限制缩放范围
    this.viewerZoom = Math.max(0.5, Math.min(5, this.viewerZoom));

    this.updateImageTransform();
  }

  // 更新图像变换
  updateImageTransform() {
    const img = document.getElementById('imageViewerImg');
    if (!img) return;

    const zoom = this.viewerZoom || 1;
    const translateX = this.viewerTranslateX || 0;
    const translateY = this.viewerTranslateY || 0;

    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoom})`;
  }

  // 绑定图像拖拽
  bindImageDrag() {
    const wrapper = document.getElementById('imageViewerWrapper');
    if (!wrapper) return;

    let isDragging = false;
    let startX, startY;
    let initialTranslateX = 0, initialTranslateY = 0;

    wrapper.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // 只响应左键
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialTranslateX = this.viewerTranslateX || 0;
      initialTranslateY = this.viewerTranslateY || 0;
      wrapper.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      this.viewerTranslateX = initialTranslateX + dx;
      this.viewerTranslateY = initialTranslateY + dy;

      this.updateImageTransform();
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        wrapper.style.cursor = 'grab';
      }
    });

    // 双击重置
    wrapper.addEventListener('dblclick', () => {
      this.viewerZoom = 1;
      this.viewerTranslateX = 0;
      this.viewerTranslateY = 0;
      this.updateImageTransform();
    });
  }

  // 打开图像查看器
  async openImageViewer(images, startIndex = 0) {
    this.viewerImages = images;
    this.viewerCurrentIndex = startIndex;

    // 重置缩放和位置
    this.viewerZoom = 1;
    this.viewerTranslateX = 0;
    this.viewerTranslateY = 0;
    this.updateImageTransform();

    await this.updateImageViewer();

    const viewer = document.getElementById('imageViewer');
    viewer.classList.add('active');

    // 进入全屏模式
    try {
      await window.electronAPI.setFullscreen(true);
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
    }
  }

  // 关闭图像查看器
  async closeImageViewer() {
    const viewer = document.getElementById('imageViewer');
    viewer.classList.remove('active');
    this.viewerImages = [];
    this.viewerCurrentIndex = 0;

    // 退出全屏模式
    try {
      await window.electronAPI.setFullscreen(false);
    } catch (error) {
      console.error('Failed to exit fullscreen:', error);
    }
  }

  // 显示首张
  async showFirstImage() {
    if (this.viewerCurrentIndex > 0) {
      this.viewerCurrentIndex = 0;
      await this.updateImageViewer();
    }
  }

  // 显示上一张
  async showPrevImage() {
    if (this.viewerCurrentIndex > 0) {
      this.viewerCurrentIndex--;
      await this.updateImageViewer();
    }
  }

  // 显示下一张
  async showNextImage() {
    if (this.viewerCurrentIndex < this.viewerImages.length - 1) {
      this.viewerCurrentIndex++;
      await this.updateImageViewer();
    }
  }

  // 显示末张
  async showLastImage() {
    if (this.viewerCurrentIndex < this.viewerImages.length - 1) {
      this.viewerCurrentIndex = this.viewerImages.length - 1;
      await this.updateImageViewer();
    }
  }

  // 更新查看器显示
  async updateImageViewer() {
    const img = document.getElementById('imageViewerImg');
    const counter = document.getElementById('imageViewerCounter');
    const firstBtn = document.getElementById('imageViewerFirst');
    const prevBtn = document.getElementById('imageViewerPrev');
    const nextBtn = document.getElementById('imageViewerNext');
    const lastBtn = document.getElementById('imageViewerLast');

    if (this.viewerImages.length === 0) return;

    const currentImage = this.viewerImages[this.viewerCurrentIndex];

    // 检查是否有 relativePath（旧数据兼容）
    if (!currentImage.relativePath) {
      console.error('Image missing relativePath:', currentImage);
      img.src = '';
      img.alt = 'Image not found';
      return;
    }

    // 获取图像完整路径
    const imagePath = await window.electronAPI.getImagePath(currentImage.relativePath);
    img.src = `file://${imagePath}`;
    img.alt = currentImage.name || '';

    counter.textContent = `${this.viewerCurrentIndex + 1} / ${this.viewerImages.length}`;

    // 更新导航按钮状态
    const isFirst = this.viewerCurrentIndex === 0;
    const isLast = this.viewerCurrentIndex === this.viewerImages.length - 1;

    if (firstBtn) firstBtn.disabled = isFirst;
    if (prevBtn) prevBtn.disabled = isFirst;
    if (nextBtn) nextBtn.disabled = isLast;
    if (lastBtn) lastBtn.disabled = isLast;
  }

  async performSearch() {
    if (this.searchQuery) {
      this.prompts = await window.electronAPI.searchPrompts(this.searchQuery);
    } else {
      await this.loadPrompts();
    }
    this.render();
  }
  
  async loadPrompts() {
    try {
      this.prompts = await window.electronAPI.getPrompts(this.promptSortBy, this.promptSortOrder);
      // Prompts loaded
      this.render();
    } catch (error) {
      console.error('Failed to load prompts:', error);
      this.prompts = [];
      this.render();
    }
  }

  render() {
    this.renderTagFilters();
    this.renderPromptList();
  }

  // 渲染标签筛选器
  renderTagFilters() {
    const container = document.getElementById('tagFilterList');
    const clearBtn = document.getElementById('clearTagFilter');

    // 收集所有标签及其数量
    const tagCounts = {};
    this.prompts.forEach(prompt => {
      if (prompt.tags && prompt.tags.length > 0) {
        prompt.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // 计算收藏数量
    const favoriteCount = this.prompts.filter(p => p.isFavorite).length;

    // 计算无图像提示词数量
    const noImageCount = this.prompts.filter(p => !p.images || p.images.length === 0).length;

    // 计算多图像提示词数量（2张及以上）
    const multiImageCount = this.prompts.filter(p => p.images && p.images.length >= 2).length;

    // 构建标签列表：收藏 -> 多图像 -> 无图像 -> 其他标签
    const allTags = [];

    // 收藏作为第一个（仅当数量大于0时）
    if (favoriteCount > 0) {
      allTags.push([PromptManager.FAVORITE_TAG, favoriteCount]);
    }

    // 多图像作为第二个（仅当数量大于0时）
    if (multiImageCount > 0) {
      allTags.push([PromptManager.MULTI_IMAGE_TAG, multiImageCount]);
    }

    // 无图像作为第三个（仅当数量大于0时）
    if (noImageCount > 0) {
      allTags.push([PromptManager.NO_IMAGE_TAG, noImageCount]);
    }

    // 按数量排序其他标签
    const sortedTags = Object.entries(tagCounts)
      .filter(([tag]) => tag !== PromptManager.FAVORITE_TAG)
      .sort((a, b) => b[1] - a[1]);
    allTags.push(...sortedTags);

    if (allTags.length === 0) {
      container.innerHTML = '<span class="tag-filter-empty">暂无标签</span>';
      clearBtn.style.display = 'none';
      return;
    }

    // 渲染标签
    container.innerHTML = allTags.map(([tag, count]) => {
      const isActive = this.selectedTags.has(tag);
      let tagContent;
      let specialClass = '';

      if (tag === PromptManager.FAVORITE_TAG) {
        // 只保留文字，不显示图标
        tagContent = `<span class="tag-name">${PromptManager.FAVORITE_TAG}</span>`;
        specialClass = 'favorite-tag';
      } else if (tag === PromptManager.MULTI_IMAGE_TAG) {
        // 多图像标签
        tagContent = `<span class="tag-name">${PromptManager.MULTI_IMAGE_TAG}</span>`;
        specialClass = 'multi-image-tag';
      } else if (tag === PromptManager.NO_IMAGE_TAG) {
        // 只保留文字，不显示图标
        tagContent = `<span class="tag-name">${PromptManager.NO_IMAGE_TAG}</span>`;
        specialClass = 'no-image-tag';
      } else {
        tagContent = `<span class="tag-name">${this.escapeHtml(tag)}</span>`;
      }

      return `
        <button class="tag-filter-item ${isActive ? 'active' : ''} ${specialClass}" data-tag="${this.escapeHtml(tag)}">
          ${tagContent}
          <span class="tag-badge">${count}</span>
        </button>
      `;
    }).join('');

    // 显示/隐藏清除按钮
    clearBtn.style.display = this.selectedTags.size > 0 ? 'block' : 'none';

    // 绑定点击事件
    container.querySelectorAll('.tag-filter-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const tag = item.dataset.tag;
        if (e.shiftKey) {
          // Shift+点击：多选模式
          if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
          } else {
            this.selectedTags.add(tag);
          }
        } else {
          // 普通点击：单选模式
          if (this.selectedTags.has(tag) && this.selectedTags.size === 1) {
            // 如果只选中了这个标签，则取消选择
            this.selectedTags.clear();
          } else {
            // 否则只选中这个标签
            this.selectedTags.clear();
            this.selectedTags.add(tag);
          }
        }
        this.render();
      });
    });
  }

  // 清除标签筛选
  clearTagFilter() {
    this.selectedTags.clear();
    this.render();
  }

  renderPromptList() {
    const container = document.getElementById('promptList');
    const emptyState = document.getElementById('emptyState');

    // 过滤 Prompts
    let filtered = this.prompts;

    // 标签筛选（多选时同时符合）
    if (this.selectedTags.size > 0) {
      filtered = filtered.filter(prompt => {
        return Array.from(this.selectedTags).every(tag => {
          if (tag === PromptManager.FAVORITE_TAG) {
            return prompt.isFavorite;
          } else if (tag === PromptManager.MULTI_IMAGE_TAG) {
            return prompt.images && prompt.images.length >= 2;
          } else if (tag === PromptManager.NO_IMAGE_TAG) {
            return !prompt.images || prompt.images.length === 0;
          } else {
            // 普通标签
            return prompt.tags && prompt.tags.includes(tag);
          }
        });
      });
    }

    // 保存筛选后的列表，用于编辑模态框导航
    this.filteredPrompts = filtered;

    if (filtered.length === 0) {
      container.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    container.style.display = 'grid';
    emptyState.style.display = 'none';

    container.innerHTML = filtered.map(prompt => this.createPromptCard(prompt)).join('');

    // 绑定卡片事件
    filtered.forEach(prompt => {
      const card = document.querySelector(`[data-id="${prompt.id}"]`);
      if (card) {
        card.addEventListener('click', (e) => {
          if (!e.target.closest('.action-btn')) {
            this.openEditModal(prompt, { filteredList: filtered });
          }
        });

        const copyBtn = card.querySelector('.copy-btn');
        const editBtn = card.querySelector('.edit-btn');
        const deleteBtn = card.querySelector('.delete-btn');
        const favoriteBtn = card.querySelector('.favorite-btn');

        if (copyBtn) {
          copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
              await window.electronAPI.copyToClipboard(prompt.content);
              this.showToast('已复制到剪贴板', 'success');
            } catch (error) {
              this.showToast('复制失败', 'error');
            }
          });
        }

        if (editBtn) {
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openEditModal(prompt, { filteredList: filtered });
          });
        }

        if (deleteBtn) {
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            // 弹出确认对话框
            const confirmed = await this.showConfirmDialog('确认删除', '确定要删除这个 Prompt 吗？此操作不可恢复。');
            if (confirmed) {
              await this.deletePrompt(prompt.id);
            }
          });
        }

        if (favoriteBtn) {
          favoriteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.toggleFavorite(prompt.id, !prompt.isFavorite);
          });
        }
      }

    });

    // 异步加载卡片背景图
    this.loadCardBackgrounds();

    // 绑定首图 hover 预览事件
    this.bindPromptFirstImageHover();
  }

  /**
   * 绑定提示词卡片首图 hover 预览事件
   */
  bindPromptFirstImageHover() {
    const tooltip = document.getElementById('promptFirstImageTooltip');
    const tooltipImg = tooltip?.querySelector('.prompt-first-image-tooltip-img');
    if (!tooltip || !tooltipImg) return;

    // 缓存图像路径
    const imagePathCache = new Map();

    document.querySelectorAll('.prompt-card.has-images').forEach(card => {
      card.addEventListener('mouseenter', async (e) => {
        const firstImageId = card.dataset.firstImage;
        if (!firstImageId) return;

        // 获取图像路径
        let imagePath = imagePathCache.get(firstImageId);
        if (!imagePath) {
          const allImages = await window.electronAPI.getImages();
          const img = allImages.find(i => i.id === firstImageId);
          if (img) {
            const path = img.relativePath || img.thumbnailPath;
            if (path) {
              imagePath = await window.electronAPI.getImagePath(path);
              imagePathCache.set(firstImageId, imagePath);
            }
          }
        }

        if (imagePath) {
          tooltipImg.src = `file://${imagePath}`;
          tooltip.classList.add('show');
        }
      });

      card.addEventListener('mousemove', (e) => {
        if (tooltip.classList.contains('show')) {
          // 计算位置：鼠标右下方，留出边距
          let left = e.clientX + 16;
          let top = e.clientY + 16;

          // 防止超出视口右边界
          const tooltipRect = tooltip.getBoundingClientRect();
          if (left + tooltipRect.width > window.innerWidth - 16) {
            left = e.clientX - tooltipRect.width - 16;
          }
          // 防止超出视口下边界
          if (top + tooltipRect.height > window.innerHeight - 16) {
            top = e.clientY - tooltipRect.height - 16;
          }

          tooltip.style.left = left + 'px';
          tooltip.style.top = top + 'px';
        }
      });

      card.addEventListener('mouseleave', () => {
        tooltip.classList.remove('show');
      });
    });
  }

  /**
   * 创建 Prompt 卡片 HTML
   * @param {Object} prompt - Prompt 数据对象
   * @returns {string} 卡片 HTML 字符串
   */
  createPromptCard(prompt) {
    const tags = prompt.tags ? prompt.tags.map(tag => `<span class="tag">${tag}</span>`).join('') : '';

    // 检查是否有图像
    const hasImages = prompt.images && prompt.images.length > 0;

    // 收藏按钮图标
    const favoriteIcon = prompt.isFavorite
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

    // 无图像标记
    const noImageBadge = !hasImages ? `<div class="prompt-card-no-image-badge" title="无图像关联">无图像</div>` : '';

    // 背景图像（首图）
    const backgroundImage = hasImages ? `<div class="prompt-card-bg" data-first-image="${prompt.images[0].id}"></div>` : '';

    return `
      <div class="prompt-card ${prompt.isFavorite ? 'is-favorite' : ''} ${hasImages ? 'has-images' : 'no-images'}" data-id="${prompt.id}" data-first-image="${hasImages ? prompt.images[0].id : ''}">
        ${backgroundImage}
        <div class="prompt-card-overlay">
          <div class="prompt-card-header">
            <div class="prompt-card-title">${this.escapeHtml(prompt.title)}</div>
            <div class="prompt-card-actions">
              <button class="action-btn favorite-btn ${prompt.isFavorite ? 'active' : ''}" title="${prompt.isFavorite ? '取消收藏' : '收藏'}">
                ${favoriteIcon}
              </button>
              <button class="action-btn copy-btn" title="复制内容">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button class="action-btn edit-btn" title="编辑">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="action-btn delete-btn" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="prompt-card-content">${this.escapeHtml(prompt.content)}</div>
          <div class="prompt-card-footer">
            <div class="prompt-card-tags">${tags}</div>
          </div>
          ${noImageBadge}
        </div>
      </div>
    `;
  }

  /**
   * 异步加载卡片缩略图
   * 为 Prompt 卡片加载图像缩略图
   * @param {Object} prompt - Prompt 数据对象
   */
  async loadCardBackgrounds() {
    // 获取所有有图像的提示词卡片
    const cards = document.querySelectorAll('.prompt-card.has-images');
    if (cards.length === 0) return;

    // 获取所有图像信息
    const allImages = await window.electronAPI.getImages();

    // 为每张卡片加载首图作为背景
    for (const card of cards) {
      const bgElement = card.querySelector('.prompt-card-bg');
      if (!bgElement) continue;

      const firstImageId = bgElement.dataset.firstImage;
      if (!firstImageId) continue;

      // 从 images.json 获取完整图像信息
      const img = allImages.find(i => i.id === firstImageId);
      if (!img) continue;

      // 优先使用原图，如果没有则使用缩略图
      const imagePath = img.relativePath || img.thumbnailPath;
      if (!imagePath) continue;

      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        // 先将反斜杠替换为正斜杠，然后对路径进行编码
        const normalizedPath = fullPath.replace(/\\/g, '/');
        const encodedPath = encodeURI(normalizedPath);
        const bgUrl = `url("file://${encodedPath}")`;
        bgElement.style.backgroundImage = bgUrl;
      } catch (error) {
        console.error('Failed to load background image:', error);
      }
    }
  }
  
  openEditModal(prompt = null, options = {}) {
    const modal = document.getElementById('editModal');
    const form = document.getElementById('promptForm');

    // 重置图像
    this.currentImages = [];

    // 记录当前提示词列表的快照（用于导航，避免保存后排序变化影响导航）
    // 如果有筛选后的列表，使用筛选后的列表；否则使用完整列表
    if (options.filteredList && options.filteredList.length > 0) {
      this.editModalPromptsSnapshot = [...options.filteredList];
    } else {
      this.editModalPromptsSnapshot = [...this.prompts];
    }

    // 记录当前编辑的提示词索引（在快照中查找）
    if (prompt && prompt.id) {
      // 在快照中查找索引
      this.currentEditIndex = this.editModalPromptsSnapshot.findIndex(p => p.id === prompt.id);
    } else {
      // 新建模式
      this.currentEditIndex = -1;
    }

    // 更新导航按钮状态（使用 setTimeout 确保在 DOM 更新后执行）
    setTimeout(() => this.updateEditModalNavButtons(), 0);

    if (prompt && prompt.id) {
      document.getElementById('promptId').value = prompt.id;
      document.getElementById('promptTitle').value = prompt.title || '';
      // 过滤掉收藏标签，只显示普通标签
      const normalTags = prompt.tags ? prompt.tags.filter(tag => tag !== PromptManager.FAVORITE_TAG) : [];
      this.editPromptTags = [...normalTags];
      this.renderEditPromptTags();
      document.getElementById('promptContent').value = prompt.content || '';
      document.getElementById('promptContentTranslate').value = prompt.contentTranslate || '';
      document.getElementById('promptNote').value = prompt.note || '';

      // 加载已有图像
      if (prompt.images && prompt.images.length > 0) {
        this.currentImages = [...prompt.images];
      }
    } else {
      form.reset();
      document.getElementById('promptId').value = '';
      this.editPromptTags = [];
      this.renderEditPromptTags();

      // 如果有预填充的图像，添加到当前图像列表
      if (options.prefillImages && options.prefillImages.length > 0) {
        this.currentImages = [...options.prefillImages];
      }
    }

    this.renderImagePreviews();
    modal.classList.add('active');
    document.getElementById('promptTitle').focus();
  }

  /**
   * 更新编辑模态框导航按钮状态
   */
  updateEditModalNavButtons() {
    const firstBtn = document.getElementById('editModalFirstBtn');
    const prevBtn = document.getElementById('editModalPrevBtn');
    const nextBtn = document.getElementById('editModalNextBtn');
    const lastBtn = document.getElementById('editModalLastBtn');

    // 使用快照的长度来判断边界
    const snapshotLength = this.editModalPromptsSnapshot.length;
    const isFirst = this.currentEditIndex <= 0;
    const isLast = this.currentEditIndex >= snapshotLength - 1 || this.currentEditIndex === -1;

    if (firstBtn) {
      firstBtn.disabled = isFirst;
    }
    if (prevBtn) {
      prevBtn.disabled = isFirst;
    }
    if (nextBtn) {
      nextBtn.disabled = isLast;
    }
    if (lastBtn) {
      lastBtn.disabled = isLast;
    }
  }

  /**
   * 导航到上一个/下一个提示词
   * @param {number|string} direction - 导航方向：-1 上一个，1 下一个，'first' 首张，'last' 最后一张
   */
  async navigateEditModal(direction) {
    // 使用快照进行导航，避免保存后排序变化影响导航顺序
    let targetIndex;
    if (direction === 'first') {
      targetIndex = 0;
    } else if (direction === 'last') {
      targetIndex = this.editModalPromptsSnapshot.length - 1;
    } else {
      targetIndex = this.currentEditIndex + direction;
    }

    // 检查边界（使用快照的长度）
    if (targetIndex < 0 || targetIndex >= this.editModalPromptsSnapshot.length) {
      return;
    }

    // 获取目标提示词
    const targetPrompt = this.editModalPromptsSnapshot[targetIndex];
    if (!targetPrompt) return;

    // 先保存当前编辑的内容（不关闭模态框）
    await this.savePromptWithoutClosing();

    // 更新当前编辑索引（在快照中）
    this.currentEditIndex = targetIndex;

    // 更新导航按钮状态（使用 setTimeout 确保在 DOM 更新后执行）
    setTimeout(() => this.updateEditModalNavButtons(), 0);

    // 从最新的 prompts 数组中获取提示词数据（确保数据是最新的）
    const nextPrompt = this.prompts.find(p => p.id === targetPrompt.id) || targetPrompt;
    document.getElementById('promptId').value = nextPrompt.id;
    document.getElementById('promptTitle').value = nextPrompt.title || '';

    // 过滤掉收藏标签，只显示普通标签
    const normalTags = nextPrompt.tags ? nextPrompt.tags.filter(tag => tag !== PromptManager.FAVORITE_TAG) : [];
    this.editPromptTags = [...normalTags];
    this.renderEditPromptTags();
    document.getElementById('promptContent').value = nextPrompt.content || '';
    document.getElementById('promptContentTranslate').value = nextPrompt.contentTranslate || '';
    document.getElementById('promptNote').value = nextPrompt.note || '';

    // 更新图像列表
    this.currentImages = [];
    if (nextPrompt.images && nextPrompt.images.length > 0) {
      this.currentImages = [...nextPrompt.images];
    }
    this.renderImagePreviews();

    // 聚焦标题输入框
    document.getElementById('promptTitle').focus();
  }

  /**
   * 保存提示词但不关闭模态框（用于切换导航）
   */
  async savePromptWithoutClosing() {
    const id = document.getElementById('promptId').value;
    const title = document.getElementById('promptTitle').value.trim();
    const content = document.getElementById('promptContent').value.trim();
    const contentTranslate = document.getElementById('promptContentTranslate').value.trim();
    const note = document.getElementById('promptNote').value.trim();

    if (!title || !content) {
      this.showToast('请填写标题和内容', 'error');
      throw new Error('标题或内容为空');
    }

    // 检查标题是否重复
    const isExists = await window.electronAPI.isTitleExists(title, id || null);
    if (isExists) {
      this.showToast('该提示词标题已存在，请使用其他标题', 'error');
      throw new Error('标题重复');
    }

    const tags = this.editPromptTags || [];
    const images = this.currentImages;

    try {
      // 将新标签添加到提示词标签列表
      if (tags.length > 0) {
        const existingTags = await window.electronAPI.getPromptTags();
        const newTags = tags.filter(tag => !existingTags.includes(tag));
        for (const tag of newTags) {
          await window.electronAPI.addPromptTag(tag);
        }
      }

      if (id) {
        // 更新
        const result = await window.electronAPI.updatePrompt(id, { title, tags, content, contentTranslate, images, note });
        if (result === null) {
          throw new Error('找不到要更新的 Prompt');
        }
      } else {
        // 新建
        await window.electronAPI.addPrompt({ title, tags, content, contentTranslate, images, note });
      }

      // 刷新数据但不关闭模态框
      await this.loadPrompts();
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to save prompt:', error);
      this.showToast('保存失败: ' + error.message, 'error');
      throw error;
    }
  }

  /**
   * 关闭编辑模态框
   * @param {boolean} isCancel - 是否是取消操作
   */
  closeEditModal(isCancel = true) {
    document.getElementById('editModal').classList.remove('active');

    // 如果是从图像详情界面进入的编辑，取消时返回到图像详情界面
    if (isCancel && this.returnToImageDetail) {
      this.returnToImageDetail = false;
      // 恢复图像详情状态
      this.detailImages = this.returnToImageDetailImages || [];
      this.detailCurrentIndex = this.returnToImageDetailIndex || 0;
      // 恢复到原始面板
      if (this.returnToImageDetailPanel && this.returnToImageDetailPanel !== this.currentPanel) {
        if (this.returnToImageDetailPanel === 'image') {
          this.openImageManager();
        } else if (this.returnToImageDetailPanel === 'prompt') {
          this.openPromptManager();
        }
      }
      // 打开图像详情界面
      document.getElementById('imageDetailModal').classList.add('active');
      // 刷新图像显示
      this.updateImageDetailView();
      // 清理临时状态
      this.returnToImageDetailImages = null;
      this.returnToImageDetailIndex = null;
      this.returnToImageDetailPanel = null;
    }
  }

  /**
   * 打开图像详情模态框
   * 显示图像大图和相关信息，支持导航查看临近图像
   * @param {Object} imageInfo - 图像信息对象
   * @param {Object} promptInfo - 所属 Prompt 信息
   * @param {Array} imageList - 图像列表（用于导航）
   * @param {number} currentIndex - 当前图像在列表中的索引
   */
  async openImageDetailModal(imageInfo, promptInfo = null, imageList = null, currentIndex = 0) {
    // Image detail modal opened
    const modal = document.getElementById('imageDetailModal');

    // 保存图像列表、当前索引和提示词信息
    this.detailImages = imageList || [imageInfo];
    this.detailCurrentIndex = currentIndex;
    this.detailPromptInfo = promptInfo; // 保存传入的提示词信息

    // 更新显示
    await this.updateImageDetailView();

    // 显示模态框
    modal.classList.add('active');
  }

  /**
   * 更新图像详情视图
   * 根据当前索引显示图像
   */
  async updateImageDetailView() {
    const imageInfo = this.detailImages[this.detailCurrentIndex];
    if (!imageInfo) {
      console.debug('No imageInfo found');
      return;
    }

    // 获取完整的图像信息
    const fullImageInfo = await window.electronAPI.getImageById(imageInfo.id) || imageInfo;

    // 设置大图
    const imagePath = fullImageInfo.relativePath;
    if (imagePath) {
      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        document.getElementById('imageDetailImg').src = 'file://' + fullPath;
      } catch (error) {
        console.error('Failed to get image path:', error);
      }
    }

    // 绑定双击事件 - 打开全屏查看器
    const imgElement = document.getElementById('imageDetailImg');
    imgElement.onclick = null; // 清除之前的事件
    imgElement.addEventListener('dblclick', () => {
      // 构建图像对象数组，用于全屏查看器
      const viewerImages = this.detailImages.map(img => ({
        path: img.relativePath,
        relativePath: img.relativePath,
        fileName: img.fileName
      }));
      this.openImageViewer(viewerImages, this.detailCurrentIndex);
    });

    // 设置文件名
    const fileNameInput = document.getElementById('imageDetailFileName');
    fileNameInput.value = fullImageInfo.fileName || '';

    // 查找所属的 Prompt 信息
    // 优先使用传入的 promptInfo，如果没有则尝试从数据库获取
    let promptInfo = this.detailPromptInfo || null;
    let allPromptRefs = [];

    // 收集所有引用的提示词信息
    if (fullImageInfo.promptRefs && fullImageInfo.promptRefs.length > 0) {
      allPromptRefs = fullImageInfo.promptRefs.map(ref => {
        // 优先从本地缓存查找
        const cachedPrompt = this.prompts.find(p => p.id === ref.promptId);
        if (cachedPrompt) {
          return cachedPrompt;
        }
        // 如果本地缓存中没有，使用数据库返回的数据
        if (ref.promptContent) {
          return {
            id: ref.promptId,
            title: ref.promptTitle,
            content: ref.promptContent,
            tags: []
          };
        }
        return null;
      }).filter(p => p !== null);
    }

    // 如果没有找到任何引用，使用传入的 promptInfo
    if (allPromptRefs.length === 0 && promptInfo) {
      allPromptRefs = [promptInfo];
    }

    // 设置所属 Prompt 信息
    const editPromptBtn = document.getElementById('editPromptFromImageBtn');
    const editPromptBtnText = document.getElementById('editPromptBtnText');
    const promptTitleContainer = document.getElementById('imageDetailPromptTitle');

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
              const selectedPrompt = allPromptRefs.find(p => p.id === promptId);
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
            const promptRef = allPromptRefs.find(p => p.id === promptId);
            if (promptRef) {
              await this.unlinkImageFromPrompt(fullImageInfo.id, promptId, promptRef.title);
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
            await this.unlinkImageFromPrompt(fullImageInfo.id, p.id, p.title);
          });
        }
      }

      // 显示第一个提示词的详细内容
      const firstPrompt = allPromptRefs[0];
      document.getElementById('imageDetailPromptContent').textContent = firstPrompt.content || '-';
      document.getElementById('imageDetailPromptTranslate').textContent = firstPrompt.contentTranslate || '-';
      document.getElementById('imageDetailPromptNote').textContent = firstPrompt.note || '-';

      // 设置标签
      const tagsContainer = document.getElementById('imageDetailTags');
      if (firstPrompt.tags && firstPrompt.tags.length > 0) {
        tagsContainer.innerHTML = firstPrompt.tags.map(tag =>
          `<span class="tag">${this.escapeHtml(tag)}</span>`
        ).join('');
      } else {
        tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
      }

      // 显示编辑按钮，设置文本为"编辑提示词"，并保存当前提示词ID
      editPromptBtn.style.display = 'flex';
      editPromptBtnText.textContent = allPromptRefs.length > 1 ? '编辑提示词 (1)' : '编辑提示词';
      this.currentDetailPromptId = firstPrompt.id;
      this.currentDetailPromptRefs = allPromptRefs; // 保存所有引用供后续使用
    } else {
      promptTitleContainer.textContent = '-';
      document.getElementById('imageDetailPromptContent').textContent = '-';
      document.getElementById('imageDetailPromptTranslate').textContent = '-';
      document.getElementById('imageDetailPromptNote').textContent = '-';
      document.getElementById('imageDetailTags').innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';

      // 显示按钮，但文本改为"添加提示词"，清除提示词ID
      editPromptBtn.style.display = 'flex';
      editPromptBtnText.textContent = '添加提示词';
      this.currentDetailPromptId = null;
      this.currentDetailPromptRefs = [];
    }

    // 设置图像标签
    this.renderImageTags(fullImageInfo.tags || []);

    // 设置收藏按钮状态
    const favoriteBtn = document.getElementById('imageDetailFavoriteBtn');
    if (favoriteBtn) {
      if (fullImageInfo.isFavorite) {
        favoriteBtn.classList.add('active');
        favoriteBtn.title = '取消收藏';
        favoriteBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
      } else {
        favoriteBtn.classList.remove('active');
        favoriteBtn.title = '收藏';
        favoriteBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
      }
      // 绑定点击事件
      favoriteBtn.onclick = async () => {
        const newFavoriteState = !fullImageInfo.isFavorite;
        await this.toggleImageFavorite(fullImageInfo.id, newFavoriteState);
        // 更新本地数据
        fullImageInfo.isFavorite = newFavoriteState;
        // 更新按钮UI
        if (newFavoriteState) {
          favoriteBtn.classList.add('active');
          favoriteBtn.title = '取消收藏';
          favoriteBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        } else {
          favoriteBtn.classList.remove('active');
          favoriteBtn.title = '收藏';
          favoriteBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        }
      };
    }

    // 设置图像元信息
    let metaHtml = '';
    if (fullImageInfo.md5) {
      metaHtml += `<div>MD5: ${fullImageInfo.md5}</div>`;
    }
    if (fullImageInfo.createdAt) {
      // 将 UTC 时间转换为本地时间显示
      const date = new Date(fullImageInfo.createdAt);
      metaHtml += `<div>上传时间: ${date.toLocaleString('zh-CN')}</div>`;
    }
    document.getElementById('imageDetailMeta').innerHTML = metaHtml || '-';

    // 设置图像尺寸信息
    let sizeHtml = '';
    if (fullImageInfo.width && fullImageInfo.height) {
      sizeHtml += `<div>图像尺寸: ${fullImageInfo.width} x ${fullImageInfo.height} 像素</div>`;
    } else {
      sizeHtml += '<div>图像尺寸: 未知</div>';
    }
    document.getElementById('imageDetailSize').innerHTML = sizeHtml;

    // 设置备注
    const noteTextarea = document.getElementById('imageDetailNote');
    if (noteTextarea) {
      noteTextarea.value = fullImageInfo.note || '';
    }

    // 更新计数器
    document.getElementById('imageDetailCounter').textContent = 
      `${this.detailCurrentIndex + 1} / ${this.detailImages.length}`;

    // 更新导航按钮状态
    const firstBtn = document.getElementById('firstImageBtn');
    const prevBtn = document.getElementById('prevImageBtn');
    const nextBtn = document.getElementById('nextImageBtn');
    const lastBtn = document.getElementById('lastImageBtn');

    const isFirst = this.detailCurrentIndex === 0;
    const isLast = this.detailCurrentIndex === this.detailImages.length - 1;

    if (firstBtn) firstBtn.disabled = isFirst;
    if (prevBtn) prevBtn.disabled = isFirst;
    if (nextBtn) nextBtn.disabled = isLast;
    if (lastBtn) lastBtn.disabled = isLast;
  }

  /**
   * 显示首张图像（图像详情页）
   */
  async showFirstDetailImage() {
    if (this.detailCurrentIndex > 0) {
      this.detailCurrentIndex = 0;
      this.detailPromptInfo = null;
      await this.updateImageDetailView();
    }
  }

  /**
   * 显示上一张图像（图像详情页）
   */
  async showPrevDetailImage() {
    if (this.detailCurrentIndex > 0) {
      this.detailCurrentIndex--;
      this.detailPromptInfo = null; // 清除之前的提示词信息，让 updateImageDetailView 从数据库获取
      await this.updateImageDetailView();
    }
  }

  /**
   * 显示下一张图像（图像详情页）
   */
  async showNextDetailImage() {
    if (this.detailCurrentIndex < this.detailImages.length - 1) {
      this.detailCurrentIndex++;
      this.detailPromptInfo = null; // 清除之前的提示词信息，让 updateImageDetailView 从数据库获取
      await this.updateImageDetailView();
    }
  }

  /**
   * 显示最后一张图像（图像详情页）
   */
  async showLastDetailImage() {
    if (this.detailCurrentIndex < this.detailImages.length - 1) {
      this.detailCurrentIndex = this.detailImages.length - 1;
      this.detailPromptInfo = null;
      await this.updateImageDetailView();
    }
  }

  /**
   * 从图像详情界面编辑或添加提示词
   * 有提示词时编辑，无提示词时创建并关联当前图像
   */
  async editPromptFromImageDetail() {
    // 保存当前图像详情状态，以便编辑/创建完成后返回
    this.returnToImageDetail = true;
    this.returnToImageDetailIndex = this.detailCurrentIndex;
    this.returnToImageDetailImages = [...this.detailImages];
    this.returnToImageDetailPanel = this.currentPanel;

    // 关闭图像详情界面
    document.getElementById('imageDetailModal').classList.remove('active');
    document.getElementById('imageDetailImg').src = '';

    if (this.currentDetailPromptId) {
      // 有提示词，编辑模式
      const prompt = this.prompts.find(p => p.id === this.currentDetailPromptId);
      if (!prompt) {
        this.showToast('提示词不存在', 'error');
        return;
      }
      // 使用当前的筛选列表（如果有）
      const filteredList = this.filteredPrompts && this.filteredPrompts.length > 0 ? this.filteredPrompts : null;
      this.openEditModal(prompt, { filteredList });
    } else {
      // 无提示词，创建模式，预填充当前图像
      const currentImage = this.detailImages[this.detailCurrentIndex];
      this.openEditModal(null, {
        prefillImages: currentImage ? [{
          id: currentImage.id,
          fileName: currentImage.fileName
        }] : []
      });
    }
  }

  /**
   * 关闭图像详情模态框
   * 关闭时返回到原始面板（提示词管理或图像管理）
   */
  async closeImageDetailModal() {
    document.getElementById('imageDetailModal').classList.remove('active');
    document.getElementById('imageDetailImg').src = '';

    // 如果当前在图像管理界面，刷新标签筛选
    if (this.currentPanel === 'image') {
      await this.renderImageTagFilters();
      await this.renderImageGrid();
    }
  }

  /**
   * 从图像详情界面显示指定提示词的详细信息
   * 用于多引用情况下切换显示不同提示词的内容
   * @param {Object} promptInfo - 提示词信息对象
   */
  showPromptDetailFromImage(promptInfo) {
    if (!promptInfo) return;

    // 更新当前选中的提示词ID
    this.currentDetailPromptId = promptInfo.id;

    // 更新提示词标题区域的选中状态
    const promptTitleContainer = document.getElementById('imageDetailPromptTitle');
    promptTitleContainer.querySelectorAll('.prompt-ref-item').forEach(item => {
      if (item.dataset.promptId === promptInfo.id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 更新提示词内容
    document.getElementById('imageDetailPromptContent').textContent = promptInfo.content || '-';
    document.getElementById('imageDetailPromptTranslate').textContent = promptInfo.contentTranslate || '-';
    document.getElementById('imageDetailPromptNote').textContent = promptInfo.note || '-';

    // 更新标签
    const tagsContainer = document.getElementById('imageDetailTags');
    if (promptInfo.tags && promptInfo.tags.length > 0) {
      tagsContainer.innerHTML = promptInfo.tags.map(tag =>
        `<span class="tag">${this.escapeHtml(tag)}</span>`
      ).join('');
    } else {
      tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
    }

    // 更新编辑按钮文本
    const editPromptBtnText = document.getElementById('editPromptBtnText');
    const allRefs = this.currentDetailPromptRefs || [];
    const currentIndex = allRefs.findIndex(p => p.id === promptInfo.id);
    if (currentIndex >= 0) {
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

      // 刷新提示词缓存（因为提示词的图像关联已改变）
      await this.loadPrompts();

      // 重新获取最新的图像数据
      if (this.detailImages && this.detailImages[this.detailCurrentIndex]) {
        const refreshedImage = await window.electronAPI.getImageById(imageId);
        if (refreshedImage) {
          this.detailImages[this.detailCurrentIndex] = refreshedImage;
        }
      }

      // 清除旧的提示词信息缓存，强制从数据库重新获取
      this.detailPromptInfo = null;

      // 刷新图像详情视图
      await this.updateImageDetailView();

      // 如果在图像管理界面，刷新网格
      if (this.currentPanel === 'image') {
        await this.renderImageGrid();
        await this.renderImageTagFilters();
      }

      // 如果在提示词管理界面，刷新列表
      if (this.currentPanel === 'prompt') {
        this.renderPromptList();
      }
    } catch (error) {
      console.error('Failed to unlink image from prompt:', error);
      this.showToast('解除关联失败: ' + error.message, 'error');
    }
  }

  /**
   * 渲染图像标签
   * @param {Array} tags - 标签数组
   */
  renderImageTags(tags) {
    const container = document.getElementById('imageDetailImageTags');
    if (tags && tags.length > 0) {
      container.innerHTML = tags.map(tag =>
        `<span class="tag tag-removable" data-tag="${this.escapeHtml(tag)}">
          ${this.escapeHtml(tag)}
          <span class="tag-remove-btn" title="删除标签">×</span>
        </span>`
      ).join('');
      
      // 绑定删除事件
      container.querySelectorAll('.tag-remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tagElement = btn.closest('.tag-removable');
          const tagName = tagElement.dataset.tag;
          await this.removeImageTag(tagName);
        });
      });
    } else {
      container.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
    }
  }

  /**
   * 从自动完成列表添加图像标签
   * 点击下拉列表项时直接保存，不需要二次确认
   * @param {string} tagName - 标签名称
   */
  async addImageTagFromAutocomplete(tagName) {
    const input = document.getElementById('imageTagInput');

    // 获取当前图像的完整信息
    const currentImage = this.detailImages[this.detailCurrentIndex];
    if (!currentImage || !currentImage.id) {
      this.showToast('无法获取当前图像信息', 'error');
      return;
    }

    // 获取当前图像的完整信息
    const fullImageInfo = await window.electronAPI.getImageById(currentImage.id);
    if (!fullImageInfo) {
      this.showToast('无法获取图像信息', 'error');
      return;
    }

    // 检查标签是否已存在
    const currentTags = fullImageInfo.tags || [];
    if (currentTags.includes(tagName)) {
      this.showToast('该标签已存在', 'error');
      input.value = '';
      return;
    }

    // 添加新标签
    const newTags = [...currentTags, tagName];

    try {
      await window.electronAPI.updateImageTags(currentImage.id, newTags);

      // 添加到全局图像标签列表
      const existingTags = await window.electronAPI.getImageTags();
      if (!existingTags.includes(tagName)) {
        await window.electronAPI.addImageTag(tagName);
      }

      // 更新显示
      this.renderImageTags(newTags);
      input.value = '';
      this.showToast('标签已添加');
    } catch (error) {
      console.error('Add image tag error:', error);
      this.showToast('添加标签失败', 'error');
    }
  }

  /**
   * 添加图像标签
   */
  async addImageTag() {
    const input = document.getElementById('imageTagInput');
    const tagName = input.value.trim();

    if (!tagName) {
      this.showToast('请输入标签名称', 'error');
      return;
    }

    // 获取当前图像的完整信息
    const currentImage = this.detailImages[this.detailCurrentIndex];
    if (!currentImage || !currentImage.id) {
      this.showToast('无法获取当前图像信息', 'error');
      return;
    }

    // 获取当前图像的完整信息
    const fullImageInfo = await window.electronAPI.getImageById(currentImage.id);
    if (!fullImageInfo) {
      this.showToast('无法获取图像信息', 'error');
      return;
    }

    // 检查标签是否已存在
    const currentTags = fullImageInfo.tags || [];
    if (currentTags.includes(tagName)) {
      this.showToast('该标签已存在', 'error');
      return;
    }

    // 添加新标签
    const newTags = [...currentTags, tagName];

    try {
      await window.electronAPI.updateImageTags(currentImage.id, newTags);

      // 添加到全局图像标签列表
      const existingTags = await window.electronAPI.getImageTags();
      if (!existingTags.includes(tagName)) {
        await window.electronAPI.addImageTag(tagName);
      }

      // 更新显示
      this.renderImageTags(newTags);
      input.value = '';
      this.hideImageTagAutocomplete();
      this.showToast('标签已添加');
    } catch (error) {
      console.error('Add image tag error:', error);
      this.showToast('添加标签失败', 'error');
    }
  }

  /**
   * 删除图像标签
   * @param {string} tagName - 要删除的标签名称
   */
  async removeImageTag(tagName) {
    const currentImage = this.detailImages[this.detailCurrentIndex];
    if (!currentImage || !currentImage.id) {
      this.showToast('无法获取当前图像信息', 'error');
      return;
    }

    // 确认删除
    const confirmed = await this.showConfirmDialog('确认删除标签', `确定要从当前图像中删除标签 "${tagName}" 吗？`);
    if (!confirmed) return;

    // 获取当前图像的完整信息
    const fullImageInfo = await window.electronAPI.getImageById(currentImage.id);
    if (!fullImageInfo) {
      this.showToast('无法获取图像信息', 'error');
      return;
    }

    // 过滤掉要删除的标签
    const currentTags = fullImageInfo.tags || [];
    const newTags = currentTags.filter(tag => tag !== tagName);

    try {
      await window.electronAPI.updateImageTags(currentImage.id, newTags);
      
      // 更新本地数据
      const img = this.imageGridImages.find(i => i.id === currentImage.id);
      if (img) {
        img.tags = newTags;
      }
      
      // 更新显示
      this.renderImageTags(newTags);
      this.renderImageTagFilters();
      this.showToast('标签已删除');
    } catch (error) {
      console.error('Remove image tag error:', error);
      this.showToast('删除标签失败', 'error');
    }
  }

  /**
   * 保存图像备注
   * 将备注内容保存到 extra1 字段
   */
  async saveImageNote() {
    const currentImage = this.detailImages[this.detailCurrentIndex];
    if (!currentImage || !currentImage.id) {
      this.showToast('无法获取当前图像信息', 'error');
      return;
    }

    const noteTextarea = document.getElementById('imageDetailNote');
    const note = noteTextarea.value.trim();

    try {
      await window.electronAPI.updateImageNote(currentImage.id, note);
      this.showToast('备注已保存');
    } catch (error) {
      console.error('Save image note error:', error);
      this.showToast('保存备注失败', 'error');
    }
  }

  /**
   * 保存图像文件名
   */
  async saveImageFileName() {
    const currentImage = this.detailImages[this.detailCurrentIndex];
    if (!currentImage || !currentImage.id) {
      this.showToast('无法获取当前图像信息', 'error');
      return;
    }

    const fileNameInput = document.getElementById('imageDetailFileName');
    const newFileName = fileNameInput.value.trim();

    if (!newFileName) {
      this.showToast('文件名不能为空', 'error');
      return;
    }

    // 检查文件名是否包含非法字符
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(newFileName)) {
      this.showToast('文件名包含非法字符', 'error');
      return;
    }

    try {
      await window.electronAPI.updateImageFileName(currentImage.id, newFileName);
      // 更新本地数据
      currentImage.fileName = newFileName;
      // 隐藏保存按钮
      document.getElementById('saveImageFileNameBtn').style.display = 'none';
      this.showToast('文件名已保存');
      // 刷新图像列表
      await this.renderImageGrid();
    } catch (error) {
      console.error('Save image file name error:', error);
      this.showToast('保存文件名失败: ' + error.message, 'error');
    }
  }

  /**
   * 设置缩略图尺寸控制
   */
  setupThumbnailSizeControl() {
    const slider = document.getElementById('thumbnailSizeSlider');

    // 从本地存储读取默认值
    const savedSize = localStorage.getItem('thumbnailGridSize');
    const defaultSize = savedSize ? parseInt(savedSize) : 180;

    // 设置滑杆初始值
    slider.value = defaultSize;
    this.setThumbnailGridSize(defaultSize);

    // 监听滑杆变化
    slider.addEventListener('input', (e) => {
      const size = parseInt(e.target.value);
      this.setThumbnailGridSize(size);
    });

    // 保存最终值
    slider.addEventListener('change', (e) => {
      localStorage.setItem('thumbnailGridSize', e.target.value);
    });
  }

  /**
   * 设置缩略图网格尺寸
   * @param {number} size - 网格项宽度/高度（像素），保持1:1方形
   */
  setThumbnailGridSize(size) {
    const imageGrid = document.getElementById('imageGrid');
    if (imageGrid) {
      imageGrid.style.gridTemplateColumns = `repeat(auto-fill, ${size}px)`;
      imageGrid.style.gridAutoRows = `${size}px`;
    }
  }

  /**
   * 设置提示词卡片尺寸控制
   */
  setupPromptCardSizeControl() {
    const slider = document.getElementById('promptCardSizeSlider');

    // 从本地存储读取默认值
    const savedSize = localStorage.getItem('promptCardSize');
    const defaultSize = savedSize ? parseInt(savedSize) : 260;

    // 设置滑杆初始值
    slider.value = defaultSize;
    this.setPromptCardSize(defaultSize);

    // 监听滑杆变化
    slider.addEventListener('input', (e) => {
      const size = parseInt(e.target.value);
      this.setPromptCardSize(size);
    });

    // 保存最终值
    slider.addEventListener('change', (e) => {
      localStorage.setItem('promptCardSize', e.target.value);
    });
  }

  /**
   * 设置提示词卡片尺寸
   * @param {number} size - 卡片宽度/高度（像素），保持1:1方形
   */
  setPromptCardSize(size) {
    const promptList = document.getElementById('promptList');
    if (promptList) {
      // 使用固定列宽，每列大小等于滑杆值
      promptList.style.gridTemplateColumns = `repeat(auto-fill, ${size}px)`;
      promptList.style.gridAutoRows = `${size}px`;
    }
  }

  /**
   * 设置图像标签自动补全
   */
  setupImageTagAutocomplete() {
    const input = document.getElementById('imageTagInput');
    const dropdown = document.getElementById('imageTagAutocomplete');

    input.addEventListener('input', async () => {
      const value = input.value.trim();
      if (!value) {
        this.hideImageTagAutocomplete();
        return;
      }

      // 获取所有图像标签
      const allTags = await window.electronAPI.getImageTags();

      // 过滤匹配的标签
      const matchedTags = allTags.filter(tag =>
        tag.toLowerCase().startsWith(value.toLowerCase()) &&
        tag.toLowerCase() !== value.toLowerCase()
      );

      if (matchedTags.length === 0) {
        this.hideImageTagAutocomplete();
        return;
      }

      // 显示下拉框
      dropdown.innerHTML = matchedTags.map((tag, index) =>
        `<div class="autocomplete-item" data-index="${index}" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</div>`
      ).join('');
      dropdown.classList.add('active');

      // 绑定点击事件 - 点击直接添加标签
      dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', async () => {
          const tagName = item.dataset.tag;
          input.value = '';
          this.hideImageTagAutocomplete();
          // 直接调用添加标签方法
          await this.addImageTagFromAutocomplete(tagName);
        });
      });
    });

    // 键盘导航
    input.addEventListener('keydown', async (e) => {
      const items = dropdown.querySelectorAll('.autocomplete-item');
      const selectedItem = dropdown.querySelector('.autocomplete-item.selected');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!selectedItem) {
          items[0]?.classList.add('selected');
        } else {
          selectedItem.classList.remove('selected');
          const nextItem = selectedItem.nextElementSibling;
          if (nextItem) {
            nextItem.classList.add('selected');
          } else {
            items[0]?.classList.add('selected');
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!selectedItem) {
          items[items.length - 1]?.classList.add('selected');
        } else {
          selectedItem.classList.remove('selected');
          const prevItem = selectedItem.previousElementSibling;
          if (prevItem) {
            prevItem.classList.add('selected');
          } else {
            items[items.length - 1]?.classList.add('selected');
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // 重新获取当前选中的项（因为可能刚用方向键选择）
        const currentSelectedItem = dropdown.querySelector('.autocomplete-item.selected');
        if (currentSelectedItem) {
          // 如果有选中的项，使用选中的标签
          const tagName = currentSelectedItem.dataset.tag;
          input.value = '';
          this.hideImageTagAutocomplete();
          await this.addImageTagFromAutocomplete(tagName);
        } else {
          // 否则使用输入框的内容
          await this.addImageTag();
        }
      } else if (e.key === 'Tab' && selectedItem) {
        e.preventDefault();
        input.value = selectedItem.dataset.tag;
        this.hideImageTagAutocomplete();
      } else if (e.key === 'Escape') {
        this.hideImageTagAutocomplete();
      }
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.image-tag-input-area')) {
        this.hideImageTagAutocomplete();
      }
    });
  }

  /**
   * 隐藏图像标签自动补全下拉框
   */
  hideImageTagAutocomplete() {
    const dropdown = document.getElementById('imageTagAutocomplete');
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
  }

  /**
   * 设置提示词标签自动补全
   */
  setupPromptTagAutocomplete() {
    const input = document.getElementById('promptTagsInput');
    const dropdown = document.getElementById('promptTagAutocomplete');

    input.addEventListener('input', async () => {
      const value = input.value.trim();
      if (!value) {
        this.hidePromptTagAutocomplete();
        return;
      }

      // 获取所有提示词标签
      const allTags = await window.electronAPI.getPromptTags();

      // 过滤匹配的标签（排除已添加的标签）
      const matchedTags = allTags.filter(tag =>
        tag.toLowerCase().startsWith(value.toLowerCase()) &&
        tag.toLowerCase() !== value.toLowerCase() &&
        !this.editPromptTags.includes(tag)
      );

      if (matchedTags.length === 0) {
        this.hidePromptTagAutocomplete();
        return;
      }

      // 显示下拉框
      dropdown.innerHTML = matchedTags.map((tag, index) =>
        `<div class="autocomplete-item" data-index="${index}" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</div>`
      ).join('');
      dropdown.classList.add('active');

      // 绑定点击事件 - 点击直接添加标签
      dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          const tagName = item.dataset.tag;
          this.addEditPromptTag(tagName);
          input.value = '';
          this.hidePromptTagAutocomplete();
        });
      });
    });

    // 键盘导航
    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.autocomplete-item');
      const selectedItem = dropdown.querySelector('.autocomplete-item.selected');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!selectedItem) {
          items[0]?.classList.add('selected');
        } else {
          selectedItem.classList.remove('selected');
          const nextItem = selectedItem.nextElementSibling;
          if (nextItem) {
            nextItem.classList.add('selected');
          } else {
            items[0]?.classList.add('selected');
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!selectedItem) {
          items[items.length - 1]?.classList.add('selected');
        } else {
          selectedItem.classList.remove('selected');
          const prevItem = selectedItem.previousElementSibling;
          if (prevItem) {
            prevItem.classList.add('selected');
          } else {
            items[items.length - 1]?.classList.add('selected');
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // 重新获取当前选中的项（因为可能刚用方向键选择）
        const currentSelectedItem = dropdown.querySelector('.autocomplete-item.selected');
        if (currentSelectedItem) {
          // 如果有选中的项，使用选中的标签
          const tagName = currentSelectedItem.dataset.tag;
          this.addEditPromptTag(tagName);
          input.value = '';
          this.hidePromptTagAutocomplete();
        } else {
          // 否则使用输入框的内容
          const tag = input.value.trim();
          if (tag) {
            // 支持逗号分隔添加多个标签
            const tags = tag.split(',').map(t => t.trim()).filter(t => t);
            tags.forEach(t => this.addEditPromptTag(t));
            input.value = '';
          }
        }
      } else if (e.key === 'Tab' && selectedItem) {
        e.preventDefault();
        input.value = selectedItem.dataset.tag;
        this.hidePromptTagAutocomplete();
      } else if (e.key === 'Escape') {
        this.hidePromptTagAutocomplete();
      }
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.prompt-tag-input-area')) {
        this.hidePromptTagAutocomplete();
      }
    });
  }

  /**
   * 隐藏提示词标签自动补全下拉框
   */
  hidePromptTagAutocomplete() {
    const dropdown = document.getElementById('promptTagAutocomplete');
    if (dropdown) {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
    }
  }

  /**
   * 保存 Prompt
   * 创建新 Prompt 或更新现有 Prompt
   */
  async savePrompt() {
    const id = document.getElementById('promptId').value;
    const title = document.getElementById('promptTitle').value.trim();
    const content = document.getElementById('promptContent').value.trim();
    const contentTranslate = document.getElementById('promptContentTranslate').value.trim();
    const note = document.getElementById('promptNote').value.trim();

    if (!title || !content) {
      this.showToast('请填写标题和内容', 'error');
      return;
    }

    // 检查标题是否重复（排除当前编辑的提示词）
    const isExists = await window.electronAPI.isTitleExists(title, id || null);
    if (isExists) {
      // 查找已存在的提示词
      const existingPrompt = this.prompts.find(p => p.title === title && p.id !== id);
      if (existingPrompt) {
        // 询问是否覆盖
        const confirmed = await this.showConfirmDialog(
          '标题已存在',
          `提示词 "${title}" 已存在，是否覆盖？`
        );
        if (!confirmed) {
          return;
        }

        const tags = this.editPromptTags || [];
        const images = this.currentImages;

        try {
          // 将新标签添加到提示词标签列表
          if (tags.length > 0) {
            const existingTags = await window.electronAPI.getPromptTags();
            const newTags = tags.filter(tag => !existingTags.includes(tag));
            for (const tag of newTags) {
              await window.electronAPI.addPromptTag(tag);
            }
          }

          // 如果是编辑模式，先删除原提示词（移动到回收站）
          if (id) {
            await window.electronAPI.deletePrompt(id);
          }

          // 使用已存在提示词的ID进行更新（覆盖）
          const coverId = existingPrompt.id;
          const result = await window.electronAPI.updatePrompt(coverId, { title, tags, content, contentTranslate, images, note });
          if (result === null) {
            throw new Error('找不到要更新的 Prompt');
          }
          this.showToast('Prompt 已覆盖');

          this.closeEditModal(false);
          await this.loadPrompts();
          this.renderTagFilters();
          return;
        } catch (error) {
          console.error('Cover save error:', error);
          this.showToast('覆盖失败: ' + error.message, 'error');
          return;
        }
      }
    }

    const tags = this.editPromptTags || [];
    const images = this.currentImages;

    try {
      // 将新标签添加到提示词标签列表
      if (tags.length > 0) {
        const existingTags = await window.electronAPI.getPromptTags();
        const newTags = tags.filter(tag => !existingTags.includes(tag));
        for (const tag of newTags) {
          await window.electronAPI.addPromptTag(tag);
        }
      }

      if (id) {
        // 更新
        const result = await window.electronAPI.updatePrompt(id, { title, tags, content, contentTranslate, images, note });
        if (result === null) {
          throw new Error('找不到要更新的 Prompt');
        }
        this.showToast('Prompt 已更新');
      } else {
        // 新建
        await window.electronAPI.addPrompt({ title, tags, content, contentTranslate, images, note });
        this.showToast('Prompt 已创建');
      }

      this.closeEditModal(false); // false 表示不是取消操作，不清理返回标志
      await this.loadPrompts();
      this.renderTagFilters();

      // 如果是从图像详情界面打开的编辑，保存成功后返回到图像详情界面
      if (this.returnToImageDetail) {
        this.returnToImageDetail = false;
        // 恢复图像详情状态
        this.detailImages = this.returnToImageDetailImages || [];
        this.detailCurrentIndex = this.returnToImageDetailIndex || 0;
        // 恢复原来的面板
        const originalPanel = this.returnToImageDetailPanel;
        // 清理临时状态
        this.returnToImageDetailImages = null;
        this.returnToImageDetailIndex = null;
        this.returnToImageDetailPanel = null;
        // 如果原来在图像管理界面，切换回去
        if (originalPanel === 'image' && this.currentPanel !== 'image') {
          this.openImageManager();
        }
        // 重新打开图像详情界面
        if (this.detailImages.length > 0) {
          const currentImage = this.detailImages[this.detailCurrentIndex];
          await this.openImageDetailModal(currentImage, null, this.detailImages, this.detailCurrentIndex);
        }
      }
    } catch (error) {
      console.error('Save error:', error);
      this.showToast('保存失败: ' + error.message, 'error');
    }
  }
  
  /**
   * 删除 Prompt
   * 将 Prompt 移动到回收站
   * @param {string} id - 要删除的 Prompt ID
   */
  async deletePrompt(id) {
    try {
      await window.electronAPI.deletePrompt(id);
      this.showToast('Prompt 已删除');
      await this.loadPrompts();
    } catch (error) {
      console.error('deletePrompt error:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 切换收藏状态
   * @param {string} id - Prompt ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleFavorite(id, isFavorite) {
    try {
      await window.electronAPI.toggleFavoritePrompt(id, isFavorite);
      // 更新本地数据
      const prompt = this.prompts.find(p => p.id === id);
      if (prompt) {
        prompt.isFavorite = isFavorite;
        // 更新标签列表
        if (isFavorite) {
          if (!prompt.tags.includes(PromptManager.FAVORITE_TAG)) {
            prompt.tags.unshift(PromptManager.FAVORITE_TAG);
          }
        } else {
          prompt.tags = prompt.tags.filter(tag => tag !== PromptManager.FAVORITE_TAG);
        }
      }
      this.showToast(isFavorite ? '已收藏' : '已取消收藏', 'success');
      // 只更新单个卡片的UI，避免重新渲染整个列表
      this.updateFavoriteUI(id, isFavorite);
      // 重新渲染标签筛选器以更新计数
      this.renderTagFilters();
    } catch (error) {
      console.error('toggleFavorite error:', error);
      this.showToast('操作失败: ' + error.message, 'error');
    }
  }

  /**
   * 更新收藏按钮UI
   * @param {string} id - Prompt ID
   * @param {boolean} isFavorite - 是否收藏
   */
  updateFavoriteUI(id, isFavorite) {
    const card = document.querySelector(`.prompt-card[data-id="${id}"]`);
    if (!card) return;

    const favoriteBtn = card.querySelector('.favorite-btn');
    if (!favoriteBtn) return;

    // 更新按钮样式
    if (isFavorite) {
      favoriteBtn.classList.add('active');
      favoriteBtn.title = '取消收藏';
      favoriteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    } else {
      favoriteBtn.classList.remove('active');
      favoriteBtn.title = '收藏';
      favoriteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    }

    // 更新卡片边框样式
    if (isFavorite) {
      card.classList.add('is-favorite');
    } else {
      card.classList.remove('is-favorite');
    }

    // 更新事件监听器
    favoriteBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleFavorite(id, !isFavorite);
    };
  }

  /**
   * 复制当前查看的 Prompt 内容到剪贴板
   */
  /**
   * 导入 Prompts
   * 从 JSON 文件导入 Prompt 数据
   */
  async importPrompts() {
    try {
      const result = await window.electronAPI.importPrompts();
      if (result) {
        this.prompts = result;
        this.render();
        this.showToast('导入成功');
      }
    } catch (error) {
      this.showToast('导入失败: ' + error.message, 'error');
    }
  }

  /**
   * 导出 Prompts
   * 将 Prompt 数据导出为 JSON 文件
   */
  async exportPrompts() {
    try {
      const result = await window.electronAPI.exportPrompts(this.prompts);
      if (result) {
        this.showToast('导出成功');
      }
    } catch (error) {
      this.showToast('导出失败: ' + error.message, 'error');
    }
  }

  /**
   * 恢复面板状态
   * 根据保存的状态打开对应的面板
   */
  restorePanelState() {
    if (this.currentPanel === 'image') {
      this.openImageManager();
    } else {
      this.openPromptManager();
    }
  }

  /**
   * 保存面板状态
   * 将当前面板状态保存到 localStorage
   */
  savePanelState() {
    localStorage.setItem('currentPanel', this.currentPanel);
  }

  /**
   * 打开提示词管理面板
   * 显示提示词列表，隐藏图像面板
   */
  openPromptManager() {
    this.currentPanel = 'prompt';
    document.getElementById('promptPanel').style.display = 'flex';
    document.getElementById('imagePanel').style.display = 'none';
    this.updateSidebarButtonState();
    this.savePanelState();
  }

  /**
   * 打开图像管理面板
   * 显示图像列表，隐藏提示词面板
   */
  async openImageManager() {
    this.currentPanel = 'image';
    document.getElementById('promptPanel').style.display = 'none';
    document.getElementById('imagePanel').style.display = 'flex';
    await this.renderImageTagFilters();
    await this.renderImageGrid();
    this.updateSidebarButtonState();
    this.savePanelState();
  }

  /**
   * 渲染图像标签筛选器
   * 获取所有图像标签并显示在筛选区域
   */
  async renderImageTagFilters() {
    try {
      const tags = await window.electronAPI.getImageTags();
      const container = document.getElementById('imageTagFilterList');
      const clearBtn = document.getElementById('clearImageTagFilter');

      // Get all images to count tags
      const allImages = await window.electronAPI.getImages();

      // 计算收藏数量
      const favoriteCount = allImages.filter(img => img.isFavorite).length;

      // 计算未引用数量（没有被任何提示词引用）
      const unreferencedCount = allImages.filter(img => !img.promptRefs || img.promptRefs.length === 0).length;

      // 计算多引用数量（被多个提示词引用）
      const multiRefCount = allImages.filter(img => img.promptRefs && img.promptRefs.length > 1).length;

      // Count images for each tag
      const tagCounts = {};
      tags.forEach(tag => {
        tagCounts[tag] = allImages.filter(img => img.tags && img.tags.includes(tag)).length;
      });

      // 构建标签列表：收藏 -> 未引用 -> 多引用 -> 普通标签
      const allTags = [];
      // 收藏作为第一个（仅当收藏数量大于0时）
      if (favoriteCount > 0) {
        allTags.push(PromptManager.FAVORITE_TAG);
        tagCounts[PromptManager.FAVORITE_TAG] = favoriteCount;
      }
      // 未引用作为第二个（仅当未引用数量大于0时）
      if (unreferencedCount > 0) {
        allTags.push(PromptManager.UNREFERENCED_TAG);
        tagCounts[PromptManager.UNREFERENCED_TAG] = unreferencedCount;
      }
      // 多引用作为第三个（仅当多引用数量大于0时）
      if (multiRefCount > 0) {
        allTags.push(PromptManager.MULTI_REF_TAG);
        tagCounts[PromptManager.MULTI_REF_TAG] = multiRefCount;
      }
      // 只添加计数大于0的普通标签
      tags.forEach(tag => {
        if (tagCounts[tag] > 0) {
          allTags.push(tag);
        }
      });

      // 如果没有任何标签，显示暂无标签
      if (allTags.length === 0) {
        container.innerHTML = '<span style="color: var(--text-secondary); font-size: 13px;">暂无标签</span>';
        clearBtn.style.display = 'none';
        return;
      }

      container.innerHTML = allTags.map(tag => {
        const isActive = this.selectedImageTags.includes(tag);
        const count = tagCounts[tag] || 0;
        let tagName;
        let specialClass = '';
        if (tag === PromptManager.FAVORITE_TAG) {
          // 只保留文字，不显示图标
          tagName = PromptManager.FAVORITE_TAG;
          specialClass = 'favorite-tag';
        } else if (tag === PromptManager.UNREFERENCED_TAG) {
          tagName = PromptManager.UNREFERENCED_TAG;
          specialClass = 'unreferenced-tag';
        } else if (tag === PromptManager.MULTI_REF_TAG) {
          tagName = PromptManager.MULTI_REF_TAG;
          specialClass = 'multi-ref-tag';
        } else {
          tagName = this.escapeHtml(tag);
        }
        return `<span class="tag-filter-item ${isActive ? 'active' : ''} ${specialClass}" data-tag="${this.escapeHtml(tag)}"><span class="tag-name">${tagName}</span><span class="tag-badge">${count}</span></span>`;
      }).join('');

      // 绑定标签点击事件
      container.querySelectorAll('.tag-filter-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const tag = item.dataset.tag;
          if (e.shiftKey) {
            // Shift+点击：添加到多选（同时符合）
            if (this.selectedImageTags.includes(tag)) {
              // 已选中则移除
              this.selectedImageTags = this.selectedImageTags.filter(t => t !== tag);
            } else {
              // 未选中则添加
              this.selectedImageTags.push(tag);
            }
          } else {
            // 普通点击：单选模式
            if (this.selectedImageTags.includes(tag) && this.selectedImageTags.length === 1) {
              // 如果只选中了这个标签，则取消选择
              this.selectedImageTags = [];
            } else {
              // 否则只选中这个标签
              this.selectedImageTags = [tag];
            }
          }
          this.renderImageTagFilters();
          this.renderImageGrid();
        });
      });

      // 显示/隐藏清除按钮
      clearBtn.style.display = this.selectedImageTags.length > 0 ? 'block' : 'none';
    } catch (error) {
      console.error('Failed to render image tag filters:', error);
    }
  }

  /**
   * 清除图像标签筛选
   * 重置筛选状态并重新渲染图像列表
   */
  clearImageTagFilter() {
    this.selectedImageTags = [];
    this.renderImageTagFilters();
    this.renderImageGrid();
  }

  /**
   * 更新侧边栏按钮状态
   * 根据当前面板高亮对应按钮
   */
  updateSidebarButtonState() {
    const promptBtn = document.getElementById('promptManagerBtn');
    const imageBtn = document.getElementById('imageManagerBtn');

    if (this.currentPanel === 'prompt') {
      promptBtn.classList.add('active');
      imageBtn.classList.remove('active');
    } else {
      promptBtn.classList.remove('active');
      imageBtn.classList.add('active');
    }
  }

  /**
   * 渲染图像网格
   * 显示所有保存的图像（每张图像只显示一次）
   * 支持按图像标签筛选
   */
  async renderImageGrid() {
    const imageGrid = document.getElementById('imageGrid');
    const imageEmptyState = document.getElementById('imageEmptyState');

    try {
      // 获取所有图像信息（每张图像只返回一条记录），传入排序参数
      const allImages = await window.electronAPI.getImages(this.imageSortBy, this.imageSortOrder);

      // 根据选中的标签筛选图像（多选时同时符合）
      let filteredImages = allImages;
      if (this.selectedImageTags.length > 0) {
        filteredImages = allImages.filter(img =>
          this.selectedImageTags.every(tag => {
            if (tag === PromptManager.FAVORITE_TAG) {
              return img.isFavorite;
            } else if (tag === PromptManager.UNREFERENCED_TAG) {
              return !img.promptRefs || img.promptRefs.length === 0;
            } else if (tag === PromptManager.MULTI_REF_TAG) {
              return img.promptRefs && img.promptRefs.length > 1;
            } else {
              return img.tags && img.tags.includes(tag);
            }
          })
        );
      }

      // 根据搜索关键词筛选图像
      if (this.imageSearchQuery) {
        const lowerQuery = this.imageSearchQuery.toLowerCase();
        filteredImages = filteredImages.filter(img =>
          img.fileName.toLowerCase().includes(lowerQuery) ||
          (img.tags && img.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
        );
      }

      // 保存图像列表到实例变量，供详情页使用
      this.imageGridImages = filteredImages;

      if (filteredImages.length === 0) {
        imageGrid.innerHTML = '';
        imageEmptyState.style.display = 'flex';
        return;
      }

      imageEmptyState.style.display = 'none';

      // 异步获取所有图像的完整路径
      const imageCards = await Promise.all(
        filteredImages.map(async (img, index) => {
          const imagePath = img.thumbnailPath || img.relativePath;
          if (!imagePath) return '';

          try {
            const fullPath = await window.electronAPI.getImagePath(imagePath);
            // 获取关联的提示词信息（取第一个关联的提示词）
            const promptRef = img.promptRefs && img.promptRefs.length > 0 ? img.promptRefs[0] : null;
            // 判断是否未引用
            const isUnreferenced = !img.promptRefs || img.promptRefs.length === 0;
            // 收藏按钮图标
            const favoriteIcon = img.isFavorite
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
              : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
            // 未引用标记
            const unreferencedBadge = isUnreferenced
              ? `<div class="image-card-unreferenced-badge" title="未引用图像">未引用</div>`
              : '';
            // 获取提示词内容（用于hover显示）
            let promptContent = '';
            if (promptRef && promptRef.promptContent) {
              promptContent = promptRef.promptContent;
            } else if (img.promptContent) {
              promptContent = img.promptContent;
            }
            const displayPrompt = promptContent || (isUnreferenced ? '未引用图像' : '无提示词');
            return `
              <div class="image-card ${img.isFavorite ? 'is-favorite' : ''} ${isUnreferenced ? 'is-unreferenced' : ''}" data-index="${index}" data-prompt-id="${promptRef ? promptRef.promptId : ''}" data-image-id="${img.id}" data-prompt-content="${this.escapeAttr(displayPrompt)}">
                <div class="image-card-thumbnail-wrapper">
                  <img src="file://${fullPath}" alt="${img.fileName}" class="image-card-thumbnail">
                  ${unreferencedBadge}
                  <button type="button" class="image-card-favorite-btn ${img.isFavorite ? 'active' : ''}" data-image-id="${img.id}" title="${img.isFavorite ? '取消收藏' : '收藏'}">
                    ${favoriteIcon}
                  </button>
                  <button type="button" class="image-card-delete-btn" data-image-id="${img.id}" title="删除图像">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            `;
          } catch (error) {
            console.error('Failed to get image path:', error);
            return '';
          }
        })
      );

      imageGrid.innerHTML = imageCards.filter(card => card).join('');

      // 绑定点击事件 - 打开图像详情
      imageGrid.querySelectorAll('.image-card').forEach((card, index) => {
        card.addEventListener('click', async () => {
          const img = this.imageGridImages[index];
          if (!img) return;

          // 查找所属的 Prompt 信息（取第一个关联的提示词）
          let promptInfo = null;
          if (img.promptRefs && img.promptRefs.length > 0) {
            const promptRef = img.promptRefs[0];
            // 优先从本地缓存查找，如果没有则使用数据库返回的数据
            promptInfo = this.prompts.find(p => p.id === promptRef.promptId);
            if (!promptInfo && promptRef.promptContent) {
              promptInfo = {
                title: promptRef.promptTitle,
                content: promptRef.promptContent,
                tags: []
              };
            }
          }

          // 打开图像详情模态框，传递图像列表和当前索引以支持导航
          await this.openImageDetailModal(img, promptInfo, this.imageGridImages, index);
        });
      });

      // 绑定收藏按钮事件
      imageGrid.querySelectorAll('.image-card-favorite-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation(); // 阻止冒泡，避免打开详情
          const imageId = e.currentTarget.dataset.imageId;
          const img = this.imageGridImages.find(i => i.id === imageId);
          if (img) {
            await this.toggleImageFavorite(imageId, !img.isFavorite);
          }
        });
      });

      // 绑定删除按钮事件
      imageGrid.querySelectorAll('.image-card-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation(); // 阻止冒泡，避免打开详情
          const imageId = e.currentTarget.dataset.imageId;
          await this.deleteImage(imageId);
        });
      });

      // 绑定图像卡片 hover 事件 - 显示浮动提示框
      const tooltip = document.getElementById('imagePromptTooltip');
      const tooltipContent = document.getElementById('imagePromptTooltipContent');
      imageGrid.querySelectorAll('.image-card').forEach(card => {
        card.addEventListener('mouseenter', (e) => {
          const promptContent = card.dataset.promptContent;
          if (tooltip && tooltipContent && promptContent) {
            tooltipContent.textContent = promptContent;
            tooltip.classList.add('show');
          }
        });
        card.addEventListener('mousemove', (e) => {
          if (tooltip && tooltip.classList.contains('show')) {
            // 计算位置：鼠标右下方，留出边距
            let left = e.clientX + 16;
            let top = e.clientY + 16;
            
            // 防止超出视口右边界
            const tooltipRect = tooltip.getBoundingClientRect();
            if (left + tooltipRect.width > window.innerWidth - 16) {
              left = e.clientX - tooltipRect.width - 16;
            }
            // 防止超出视口下边界
            if (top + tooltipRect.height > window.innerHeight - 16) {
              top = e.clientY - tooltipRect.height - 16;
            }
            
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
          }
        });
        card.addEventListener('mouseleave', () => {
          if (tooltip) {
            tooltip.classList.remove('show');
          }
        });
      });
    } catch (error) {
      console.error('Failed to render image grid:', error);
      this.showToast('加载图像失败', 'error');
    }
  }

  /**
   * 删除图像（移动到回收站）
   * @param {string} imageId - 要删除的图像 ID
   */
  async deleteImage(imageId) {
    const confirmed = await this.showConfirmDialog('确认删除图像', '确定要将这个图像移动到回收站吗？');
    if (!confirmed) return;

    try {
      await window.electronAPI.softDeleteImage(imageId);
      this.showToast('图像已移动到回收站');
      await this.renderImageGrid();
    } catch (error) {
      console.error('Failed to delete image:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 切换图像收藏状态
   * @param {string} id - 图像ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleImageFavorite(id, isFavorite) {
    try {
      await window.electronAPI.toggleFavoriteImage(id, isFavorite);
      // 更新本地数据
      const img = this.imageGridImages.find(i => i.id === id);
      if (img) {
        img.isFavorite = isFavorite;
        // 更新标签列表
        if (isFavorite) {
          if (!img.tags.includes(PromptManager.FAVORITE_TAG)) {
            img.tags.unshift(PromptManager.FAVORITE_TAG);
          }
        } else {
          img.tags = img.tags.filter(tag => tag !== PromptManager.FAVORITE_TAG);
        }
      }
      this.showToast(isFavorite ? '已收藏' : '已取消收藏', 'success');
      // 只更新单个卡片的UI
      this.updateImageFavoriteUI(id, isFavorite);
      // 重新渲染标签筛选器以更新计数
      this.renderImageTagFilters();
    } catch (error) {
      console.error('toggleImageFavorite error:', error);
      this.showToast('操作失败: ' + error.message, 'error');
    }
  }

  /**
   * 更新图像收藏按钮UI
   * @param {string} id - 图像ID
   * @param {boolean} isFavorite - 是否收藏
   */
  updateImageFavoriteUI(id, isFavorite) {
    const card = document.querySelector(`.image-card[data-image-id="${id}"]`);
    if (!card) return;

    const favoriteBtn = card.querySelector('.image-card-favorite-btn');
    if (!favoriteBtn) return;

    // 更新按钮样式
    if (isFavorite) {
      favoriteBtn.classList.add('active');
      favoriteBtn.title = '取消收藏';
      favoriteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
      card.classList.add('is-favorite');
    } else {
      favoriteBtn.classList.remove('active');
      favoriteBtn.title = '收藏';
      favoriteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
      card.classList.remove('is-favorite');
    }
  }

  /**
   * 从缓存渲染图像网格
   */
  async renderImageGridFromCache() {
    const imageGrid = document.getElementById('imageGrid');
    const imageEmptyState = document.getElementById('imageEmptyState');

    if (this.imageGridImages.length === 0) {
      imageGrid.innerHTML = '';
      imageEmptyState.style.display = 'flex';
      return;
    }

    imageEmptyState.style.display = 'none';

    // 异步获取所有图像的完整路径
    const imageCards = await Promise.all(
      this.imageGridImages.map(async (img, index) => {
        const imagePath = img.thumbnailPath || img.relativePath;
        if (!imagePath) return '';

        try {
          const fullPath = await window.electronAPI.getImagePath(imagePath);
          const promptRef = img.promptRefs && img.promptRefs.length > 0 ? img.promptRefs[0] : null;
          const favoriteIcon = img.isFavorite
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
          return `
            <div class="image-card ${img.isFavorite ? 'is-favorite' : ''}" data-index="${index}" data-prompt-id="${promptRef ? promptRef.promptId : ''}" data-image-id="${img.id}">
              <div class="image-card-thumbnail-wrapper">
                <img src="file://${fullPath}" alt="${img.fileName}" class="image-card-thumbnail">
                <button type="button" class="image-card-favorite-btn ${img.isFavorite ? 'active' : ''}" data-image-id="${img.id}" title="${img.isFavorite ? '取消收藏' : '收藏'}">
                  ${favoriteIcon}
                </button>
                <button type="button" class="image-card-delete-btn" data-image-id="${img.id}" title="删除图像">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          `;
        } catch (error) {
          console.error('Failed to get image path:', error);
          return '';
        }
      })
    );

    imageGrid.innerHTML = imageCards.filter(card => card).join('');

    // 绑定点击事件
    imageGrid.querySelectorAll('.image-card').forEach((card, index) => {
      card.addEventListener('click', async () => {
        const img = this.imageGridImages[index];
        if (!img) return;

        let promptInfo = null;
        if (img.promptRefs && img.promptRefs.length > 0) {
          const promptRef = img.promptRefs[0];
          promptInfo = this.prompts.find(p => p.id === promptRef.promptId);
          if (!promptInfo && promptRef.promptContent) {
            promptInfo = {
              title: promptRef.promptTitle,
              content: promptRef.promptContent,
              tags: []
            };
          }
        }

        await this.openImageDetailModal(img, promptInfo, this.imageGridImages, index);
      });
    });

    // 绑定收藏按钮事件
    imageGrid.querySelectorAll('.image-card-favorite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const imageId = e.currentTarget.dataset.imageId;
        const img = this.imageGridImages.find(i => i.id === imageId);
        if (img) {
          await this.toggleImageFavorite(imageId, !img.isFavorite);
        }
      });
    });

    // 绑定删除按钮事件
    imageGrid.querySelectorAll('.image-card-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const imageId = e.currentTarget.dataset.imageId;
        await this.deleteImage(imageId);
      });
    });
  }

  /**
   * 打开图像上传模态框
   */
  openImageUploadModal() {
    this.selectedUploadImage = null;
    document.getElementById('imageUploadForm').reset();
    document.getElementById('modalUploadPlaceholder').style.display = 'block';
    document.getElementById('modalImagePreviewSingle').style.display = 'none';
    document.getElementById('modalSinglePreviewImg').src = '';
    document.getElementById('imageUploadModal').classList.add('active');
  }

  /**
   * 关闭图像上传模态框
   */
  closeImageUploadModal() {
    document.getElementById('imageUploadModal').classList.remove('active');
    this.selectedUploadImage = null;
  }

  /**
   * 绑定图像上传模态框事件
   */
  bindImageUploadModalEvents() {
    // 关闭按钮
    document.getElementById('closeImageUploadModal').addEventListener('click', () => this.closeImageUploadModal());
    document.getElementById('cancelImageUploadBtn').addEventListener('click', () => this.closeImageUploadModal());

    // 点击外部关闭
    document.getElementById('imageUploadModal').addEventListener('click', (e) => {
      if (e.target.id === 'imageUploadModal') this.closeImageUploadModal();
    });

    // 点击上传区域选择文件
    document.getElementById('modalImageUploadArea').addEventListener('click', (e) => {
      if (e.target.closest('.remove-image')) return;
      document.getElementById('modalSingleImageInput').click();
    });

    // 文件选择
    document.getElementById('modalSingleImageInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleSingleImageSelect(file);
      }
    });

    // 删除已选图像
    document.getElementById('modalRemoveSingleImage').addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectedUploadImage = null;
      document.getElementById('modalUploadPlaceholder').style.display = 'block';
      document.getElementById('modalImagePreviewSingle').style.display = 'none';
      document.getElementById('modalSinglePreviewImg').src = '';
      document.getElementById('modalSingleImageInput').value = '';
    });

    // 确认上传
    document.getElementById('confirmImageUploadBtn').addEventListener('click', () => this.confirmImageUpload());
  }

  /**
   * 处理单张图像选择
   * @param {File} file - 选择的图像文件
   */
  handleSingleImageSelect(file) {
    if (!file.type.startsWith('image/')) {
      this.showToast('请选择图像文件', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.selectedUploadImage = file;
      document.getElementById('modalSinglePreviewImg').src = e.target.result;
      document.getElementById('modalUploadPlaceholder').style.display = 'none';
      document.getElementById('modalImagePreviewSingle').style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  /**
   * 确认上传图像
   */
  async confirmImageUpload() {
    if (!this.selectedUploadImage) {
      this.showToast('请先选择图像', 'error');
      return;
    }

    const prompt = document.getElementById('uploadImagePrompt').value.trim();
    const tagsInput = document.getElementById('uploadImageTags').value.trim();
    const note = document.getElementById('uploadImageNote').value.trim();
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

    // 保存文件名，因为 closeImageUploadModal 会将 selectedUploadImage 设为 null
    const fileName = this.selectedUploadImage.name;

    try {
      // 将文件保存到临时位置并上传
      const arrayBuffer = await this.selectedUploadImage.arrayBuffer();
      const tempPath = await window.electronAPI.saveTempFile(fileName, arrayBuffer);

      // 保存图像文件
      const imageInfo = await window.electronAPI.saveImageFile(tempPath, fileName);

      if (imageInfo.isDuplicate) {
        this.showToast(imageInfo.duplicateMessage || '图像已存在', 'info');
        // 更新重复图像的备注
        if (note) {
          await window.electronAPI.updateImageNote(imageInfo.id, note);
        }
      } else {
        // 添加图像标签
        if (tags.length > 0) {
          await window.electronAPI.updateImageTags(imageInfo.id, tags);
        }

        // 添加图像备注
        if (note) {
          await window.electronAPI.updateImageNote(imageInfo.id, note);
        }

        // 生成唯一的时间戳标题
        let title = this.generateUniqueTimestamp();

        // 检查标题是否已存在，如果存在则添加随机后缀
        let isExists = await window.electronAPI.isTitleExists(title);
        while (isExists) {
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          title = `${title}_${randomSuffix}`;
          isExists = await window.electronAPI.isTitleExists(title);
        }

        // 创建一个新的提示词（无论是否填写了提示词内容）
        await window.electronAPI.addPrompt({
          title: title,
          tags: [],
          content: prompt || '(无提示词内容)', // 如果没有输入提示词，显示默认文本
          images: [{ id: imageInfo.id, fileName: imageInfo.fileName }]
        });

        this.showToast('图像上传成功');
      }

      this.closeImageUploadModal();
      // 刷新提示词列表，确保新创建的提示词能正确显示
      await this.loadPrompts();
      this.renderImageGrid();
      this.renderImageTagFilters();
    } catch (error) {
      console.error('Failed to upload image:', error);
      this.showToast('上传图像失败: ' + error.message, 'error');
    }
  }

  /**
   * 上传图像到图像库（旧方法，保留用于兼容）
   * 独立上传图像，不与特定 Prompt 关联
   */
  async uploadImageToLibrary() {
    try {
      const filePaths = await window.electronAPI.selectImageFiles();

      if (filePaths && filePaths.length > 0) {
        let uploadedCount = 0;
        let duplicateCount = 0;

        for (const filePath of filePaths) {
          const fileName = filePath.split(/[\\/]/).pop();
          const imageInfo = await window.electronAPI.saveImageFile(filePath, fileName);

          // 检查是否是重复图像
          if (imageInfo.isDuplicate) {
            duplicateCount++;
            if (imageInfo.duplicateMessage) {
              this.showToast(imageInfo.duplicateMessage, 'info');
            }
          } else {
            uploadedCount++;
          }
        }

        if (uploadedCount > 0) {
          this.showToast(`成功上传 ${uploadedCount} 张图像${duplicateCount > 0 ? `，${duplicateCount} 张已存在` : ''}`);
        } else if (duplicateCount > 0) {
          this.showToast(`${duplicateCount} 张图像已存在，直接使用已保存的版本`, 'info');
        }
        this.renderImageGrid();
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      this.showToast('上传图像失败: ' + error.message, 'error');
    }
  }

  /**
   * 显示确认对话框
   * @param {string} title - 对话框标题
   * @param {string} message - 对话框消息
   * @returns {Promise<boolean>} - 用户是否点击确定
   */
  showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      this.confirmResolve = resolve;
      document.getElementById('confirmModalTitle').textContent = title;
      document.getElementById('confirmModalMessage').textContent = message;
      document.getElementById('confirmModal').classList.add('active');
    });
  }

  /**
   * 关闭确认对话框
   */
  closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    if (this.confirmResolve) {
      this.confirmResolve(false);
      this.confirmResolve = null;
    }
  }

  /**
   * 处理确认对话框确定按钮
   */
  handleConfirmOk() {
    document.getElementById('confirmModal').classList.remove('active');
    if (this.confirmResolve) {
      this.confirmResolve(true);
      this.confirmResolve = null;
    }
  }

  /**
   * 显示 Toast 提示消息
   * @param {string} message - 提示消息内容
   * @param {string} type - 消息类型 ('success' | 'error')
   */
  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    if (!toast || !toastMessage) {
      console.error('Toast elements not found');
      return;
    }

    toastMessage.textContent = message;

    // 移除之前的类型类
    toast.classList.remove('error', 'success', 'info');
    // 添加新的类型类
    if (type === 'error') {
      toast.classList.add('error');
    } else if (type === 'success') {
      toast.classList.add('success');
    } else if (type === 'info') {
      toast.classList.add('info');
    }

    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  /**
   * HTML 转义
   * 防止 XSS 攻击
   * @param {string} text - 要转义的文本
   * @returns {string} 转义后的 HTML 字符串
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 转义 HTML 属性值
   * 处理引号、换行等特殊字符，用于 data-* 属性
   */
  escapeAttr(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '&#10;')
      .replace(/\r/g, '&#13;');
  }

  /**
   * 打开统计模态框
   * 获取并显示数据库统计信息
   */
  async openStatisticsModal() {
    const modal = document.getElementById('statisticsModal');

    try {
      const stats = await window.electronAPI.getStatistics();

      // 更新统计数据
      document.getElementById('statPromptsTotal').textContent = stats.prompts.total;
      document.getElementById('statPromptsActive').textContent = stats.prompts.active;
      document.getElementById('statPromptsDeleted').textContent = stats.prompts.deleted;
      document.getElementById('statImagesTotal').textContent = stats.images.total;
      document.getElementById('statImagesReferenced').textContent = stats.images.referenced;
      document.getElementById('statImagesUnreferenced').textContent = stats.images.unreferenced;
      document.getElementById('statTagsTotal').textContent = stats.tags.total;
      document.getElementById('statPromptsWithImages').textContent = stats.relations.promptsWithImages;
    } catch (error) {
      console.error('Failed to get statistics:', error);
      this.showToast('Failed to load statistics', 'error');
    }

    modal.classList.add('active');
  }

  /**
   * 关闭统计模态框
   */
  closeStatisticsModal() {
    document.getElementById('statisticsModal').classList.remove('active');
  }

  /**
   * 打开图像选择器（用于提示词编辑）
   * 显示图像选择器模态框，允许从图像管理中选择图像
   */
  async openImageSelectorForPrompt() {
    const modal = document.getElementById('imageSelectorModal');
    modal.classList.add('active');

    // 初始化选择状态
    this.selectedImagesForPrompt = [];
    document.getElementById('confirmImageSelectorBtn').disabled = true;

    // 重置搜索和筛选状态
    const searchInput = document.getElementById('imageSelectorSearchInput');
    const tagFilter = document.getElementById('imageSelectorTagFilter');
    if (searchInput) searchInput.value = '';
    if (tagFilter) tagFilter.value = '';

    // 加载图像列表
    await this.renderImageSelectorGrid();
    await this.renderImageSelectorTagFilters();

    // 绑定事件
    this.bindImageSelectorEvents();
  }

  /**
   * 关闭图像选择器
   */
  closeImageSelectorModal() {
    document.getElementById('imageSelectorModal').classList.remove('active');
    this.selectedImagesForPrompt = [];
  }

  /**
   * 渲染图像选择器网格
   */
  async renderImageSelectorGrid() {
    const grid = document.getElementById('imageSelectorGrid');
    const emptyState = document.getElementById('imageSelectorEmpty');
    const searchInput = document.getElementById('imageSelectorSearchInput');
    const tagFilter = document.getElementById('imageSelectorTagFilter');

    try {
      // 获取所有图像
      let images = await window.electronAPI.getImages();

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
          this.selectedImagesForPrompt = [{ id: imageId, path: imagePath }];
          document.getElementById('confirmImageSelectorBtn').disabled = false;
        });
      });
    } catch (error) {
      console.error('Failed to render image selector:', error);
      grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">加载失败</p>';
    }
  }

  /**
   * 渲染图像选择器标签筛选器
   */
  async renderImageSelectorTagFilters() {
    const tagFilter = document.getElementById('imageSelectorTagFilter');
    if (!tagFilter) return;

    try {
      const tags = await window.electronAPI.getImageTags();
      tagFilter.innerHTML = '<option value="">所有标签</option>' +
        tags.map(tag => `<option value="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</option>`).join('');
    } catch (error) {
      console.error('Failed to render image selector tag filters:', error);
    }
  }

  /**
   * 绑定图像选择器事件
   */
  bindImageSelectorEvents() {
    // 关闭按钮
    document.getElementById('closeImageSelectorModal').addEventListener('click', () => this.closeImageSelectorModal());
    document.getElementById('cancelImageSelectorBtn').addEventListener('click', () => this.closeImageSelectorModal());

    // 搜索输入
    const searchInput = document.getElementById('imageSelectorSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.renderImageSelectorGrid();
      });
    }

    // 标签筛选
    const tagFilter = document.getElementById('imageSelectorTagFilter');
    if (tagFilter) {
      tagFilter.addEventListener('change', () => {
        this.renderImageSelectorGrid();
      });
    }

    // 确认选择
    document.getElementById('confirmImageSelectorBtn').addEventListener('click', () => {
      this.confirmImageSelectionForPrompt();
    });

    // 点击外部关闭
    document.getElementById('imageSelectorModal').addEventListener('click', (e) => {
      if (e.target.id === 'imageSelectorModal') this.closeImageSelectorModal();
    });
  }

  /**
   * 确认图像选择（用于提示词编辑）
   */
  async confirmImageSelectionForPrompt() {
    if (!this.selectedImagesForPrompt || this.selectedImagesForPrompt.length === 0) return;

    const selectedImage = this.selectedImagesForPrompt[0];

    // 添加到当前提示词的图像列表
    if (!this.currentImages) {
      this.currentImages = [];
    }

    // 检查是否已存在
    if (!this.currentImages.some(img => img.id === selectedImage.id)) {
      this.currentImages.push({
        id: selectedImage.id,
        path: selectedImage.path,
        isExisting: true // 标记为已存在的图像
      });
      this.renderImagePreviews();
      this.showToast('图像已添加');
    } else {
      this.showToast('该图像已存在', 'info');
    }

    this.closeImageSelectorModal();
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new PromptManager();
});
