/**
 * Prompt Manager 主应用逻辑
 * 管理 Prompt 的增删改查、标签管理、图像处理等功能
 */
class PromptManager {
  /**
   * 构造函数 - 初始化应用状态和配置
   */
  constructor() {
    this.prompts = [];              // 所有 Prompt 数据
    this.searchQuery = '';          // 当前搜索关键词
    this.selectedTags = new Set();  // 当前选中的提示词标签集合
    this.selectedImageTag = null;   // 当前选中的图像标签
    this.selectedUploadImage = null; // 当前选择的待上传图像
    this.currentTheme = localStorage.getItem('theme') || 'light';  // 当前主题
    this.currentImages = [];        // 当前编辑的图像列表
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
    this.returnToImageDetailPanel = null;   // 返回图像详情时的面板状态

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

    // 更新图标
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    const themeText = document.getElementById('themeText');
    if (sunIcon && moonIcon) {
      if (theme === 'dark') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      }
    }
    if (themeText) {
      themeText.textContent = theme === 'dark' ? '明亮' : '暗黑';
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
    // 新建按钮
    document.getElementById('addBtn').addEventListener('click', () => this.openEditModal());
    
    // 搜索
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.debounceSearch();
    });

    // 清除标签筛选
    document.getElementById('clearTagFilter').addEventListener('click', () => this.clearTagFilter());

    // Modal 关闭
    document.getElementById('closeModal').addEventListener('click', () => this.closeEditModal());
    document.getElementById('cancelBtn').addEventListener('click', () => this.closeEditModal());

    // 保存
    document.getElementById('saveBtn').addEventListener('click', () => this.savePrompt());
    
    // 导入导出（现在在设置中）
    document.getElementById('importBtn').addEventListener('click', () => this.importPrompts());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportPrompts());

    // 提示词管理和图像管理按钮
    document.getElementById('promptManagerBtn').addEventListener('click', () => this.openPromptManager());
    document.getElementById('imageManagerBtn').addEventListener('click', () => this.openImageManager());

    // 上传图像按钮
    document.getElementById('uploadImageBtn').addEventListener('click', () => this.openImageUploadModal());

    // 图像上传模态框
    this.bindImageUploadModalEvents();

    // 主题切换
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

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
    document.getElementById('prevImageBtn').addEventListener('click', () => this.showPrevDetailImage());
    document.getElementById('nextImageBtn').addEventListener('click', () => this.showNextDetailImage());

    // 从图像详情界面编辑提示词
    document.getElementById('editPromptFromImageBtn').addEventListener('click', () => this.editPromptFromImageDetail());

    // 图像标签添加
    document.getElementById('addImageTagBtn').addEventListener('click', () => this.addImageTag());
    document.getElementById('imageTagInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addImageTag();
      }
    });

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
      // 图像详情页面左右键导航
      if (document.getElementById('imageDetailModal').classList.contains('active')) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.showPrevDetailImage();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.showNextDetailImage();
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
    document.getElementById('closeSettingsBtn').addEventListener('click', () => this.closeSettingsModal());

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
    document.getElementById('addPromptTagBtn').addEventListener('click', () => this.addNewPromptTag());
    document.getElementById('newPromptTagInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addNewPromptTag();
    });

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
    const confirmed = await window.electronAPI.showConfirmDialog(
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
    const confirmed = await window.electronAPI.showConfirmDialog('确认重启', '确定要重启应用吗？未保存的数据可能会丢失。');
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
      items.sort((a, b) => b.deletedAt - a.deletedAt);

      listContainer.innerHTML = items.map(item => {
        const deletedDate = new Date(item.deletedAt).toLocaleString('zh-CN');
        return `
          <div class="recycle-bin-item" data-id="${item.id}">
            <div class="recycle-bin-item-info">
              <div class="recycle-bin-item-title">${this.escapeHtml(item.title)}</div>
              <div class="recycle-bin-item-date">删除时间: ${deletedDate}</div>
            </div>
            <div class="recycle-bin-item-actions">
              <button class="btn btn-primary btn-sm recycle-action-btn" data-id="${item.id}">恢复</button>
              <button class="btn btn-danger btn-sm recycle-action-btn" data-id="${item.id}">彻底删除</button>
            </div>
          </div>
        `;
      }).join('');

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
    const confirmed = await window.electronAPI.showConfirmDialog('确认彻底删除', '确定要彻底删除这个 Prompt 吗？此操作不可恢复。');
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
    const confirmed = await window.electronAPI.showConfirmDialog('确认清空回收站', '确定要清空回收站吗？所有项目将被彻底删除，此操作不可恢复。');
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

      listContainer.innerHTML = items.map(item => {
        const deletedDate = new Date(item.deletedAt).toLocaleString('zh-CN');
        return `
          <div class="recycle-bin-item" data-id="${item.id}">
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
      }).join('');

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
    const confirmed = await window.electronAPI.showConfirmDialog('确认彻底删除', '确定要彻底删除这个图像吗？此操作不可恢复。');
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
    const confirmed = await window.electronAPI.showConfirmDialog('确认清空图像回收站', '确定要清空图像回收站吗？所有图像将被彻底删除，此操作不可恢复。');
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
  async renderPromptTagManager() {
    try {
      const tags = await window.electronAPI.getPromptTags();
      const listContainer = document.getElementById('promptTagManagerList');
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

      if (tags.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
      }

      listContainer.style.display = 'flex';
      emptyState.style.display = 'none';

      listContainer.innerHTML = tags.map(tag => {
        const count = tagCounts[tag] || 0;
        return `
          <div class="tag-manager-item" data-tag="${this.escapeHtml(tag)}">
            <div class="tag-manager-item-name">
              <span class="tag-name-text">${this.escapeHtml(tag)}</span>
            </div>
            <span class="tag-manager-item-count">${count} 个 Prompt</span>
            <div class="tag-manager-item-actions">
              <button class="btn btn-secondary btn-sm rename-tag-btn" data-tag="${this.escapeHtml(tag)}">重命名</button>
              <button class="btn btn-danger btn-sm delete-tag-btn" data-tag="${this.escapeHtml(tag)}">删除</button>
            </div>
          </div>
        `;
      }).join('');

      // 绑定重命名按钮事件
      listContainer.querySelectorAll('.rename-tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tag = e.target.dataset.tag;
          this.startRenamePromptTag(tag);
        });
      });

      // 绑定删除按钮事件
      listContainer.querySelectorAll('.delete-tag-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tag = e.target.dataset.tag;
          await this.deletePromptTag(tag);
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
      <button class="btn btn-primary btn-sm confirm-rename-btn">确认</button>
      <button class="btn btn-secondary btn-sm cancel-rename-btn">取消</button>
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
      await this.renderPromptTagManager();
      await this.loadPrompts();
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
    const confirmed = await window.electronAPI.showConfirmDialog('确认删除提示词标签', `确定要删除提示词标签 "${tag}" 吗？此标签将从所有 Prompt 中移除。`);
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
   * 添加新提示词标签
   * 将新标签添加到标签列表
   */
  async addNewPromptTag() {
    const input = document.getElementById('newPromptTagInput');
    const tag = input.value.trim();

    if (!tag) {
      this.showToast('请输入提示词标签名称', 'error');
      return;
    }

    try {
      await window.electronAPI.addPromptTag(tag);
      this.showToast('提示词标签已添加');
      input.value = '';
      await this.renderPromptTagManager();
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to add prompt tag:', error);
      this.showToast('添加失败: ' + error.message, 'error');
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
   * 绑定图像上传事件
   * 支持点击上传和拖拽上传
   */
  bindImageUploadEvents() {
    const uploadArea = document.getElementById('imageUploadArea');
    const imageInput = document.getElementById('imageInput');

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
  }

  // 绑定图像查看器事件
  bindImageViewerEvents() {
    const viewer = document.getElementById('imageViewer');
    const closeBtn = document.getElementById('imageViewerClose');
    const prevBtn = document.getElementById('imageViewerPrev');
    const nextBtn = document.getElementById('imageViewerNext');
    const clickLeft = document.getElementById('imageViewerClickLeft');
    const clickRight = document.getElementById('imageViewerClickRight');
    const wrapper = document.getElementById('imageViewerWrapper');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeImageViewer());
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.showPrevImage());
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.showNextImage());
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
      } else if (e.key === 'ArrowLeft') {
        this.showPrevImage();
      } else if (e.key === 'ArrowRight') {
        this.showNextImage();
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

  // 更新查看器显示
  async updateImageViewer() {
    const img = document.getElementById('imageViewerImg');
    const counter = document.getElementById('imageViewerCounter');
    const prevBtn = document.getElementById('imageViewerPrev');
    const nextBtn = document.getElementById('imageViewerNext');

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
    prevBtn.disabled = this.viewerCurrentIndex === 0;
    nextBtn.disabled = this.viewerCurrentIndex === this.viewerImages.length - 1;
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
      this.prompts = await window.electronAPI.getPrompts();
      console.debug('Loaded prompts:', this.prompts.length);
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

    // 按数量排序
    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1]);

    if (sortedTags.length === 0) {
      container.innerHTML = '<span class="tag-filter-empty">暂无标签</span>';
      clearBtn.style.display = 'none';
      return;
    }

    // 渲染标签
    container.innerHTML = sortedTags.map(([tag, count]) => {
      const isActive = this.selectedTags.has(tag);
      return `
        <button class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}">
          <span>${this.escapeHtml(tag)}</span>
          <span class="count">${count}</span>
        </button>
      `;
    }).join('');

    // 显示/隐藏清除按钮
    clearBtn.style.display = this.selectedTags.size > 0 ? 'block' : 'none';

    // 绑定点击事件
    container.querySelectorAll('.tag-filter-item').forEach(item => {
      item.addEventListener('click', () => {
        const tag = item.dataset.tag;
        if (this.selectedTags.has(tag)) {
          this.selectedTags.delete(tag);
        } else {
          this.selectedTags.add(tag);
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

    // 标签筛选
    if (this.selectedTags.size > 0) {
      filtered = filtered.filter(prompt => {
        if (!prompt.tags || prompt.tags.length === 0) return false;
        return prompt.tags.some(tag => this.selectedTags.has(tag));
      });
    }

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
            this.openEditModal(prompt);
          }
        });

        const copyBtn = card.querySelector('.copy-btn');
        const editBtn = card.querySelector('.edit-btn');
        const deleteBtn = card.querySelector('.delete-btn');

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
            this.openEditModal(prompt);
          });
        }

        if (deleteBtn) {
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            // 弹出确认对话框
            const confirmed = await window.electronAPI.showConfirmDialog('确认删除', '确定要删除这个 Prompt 吗？此操作不可恢复。');
            if (confirmed) {
              await this.deletePrompt(prompt.id);
            }
          });
        }
      }

      // 异步加载缩略图
      if (prompt.images && prompt.images.length > 0) {
        this.loadCardThumbnails(prompt);
      }
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

    return `
      <div class="prompt-card" data-id="${prompt.id}">
        <div class="prompt-card-header">
          <div class="prompt-card-title">${this.escapeHtml(prompt.title)}</div>
          <div class="prompt-card-actions">
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
        ${hasImages ? `<div class="prompt-card-thumbnails" data-prompt-id="${prompt.id}"></div>` : ''}
        <div class="prompt-card-content">${this.escapeHtml(prompt.content)}</div>
        <div class="prompt-card-footer">
          <div class="prompt-card-tags">${tags}</div>
        </div>
      </div>
    `;
  }

  /**
   * 异步加载卡片缩略图
   * 为 Prompt 卡片加载图像缩略图
   * @param {Object} prompt - Prompt 数据对象
   */
  async loadCardThumbnails(prompt) {
    if (!prompt.images || prompt.images.length === 0) return;

    const container = document.querySelector(`.prompt-card-thumbnails[data-prompt-id="${prompt.id}"]`);
    if (!container) return;

    // 获取所有图像信息
    const allImages = await window.electronAPI.getImages();

    // 只显示前3张缩略图
    const imagesToShow = prompt.images.slice(0, 3);
    const remainingCount = prompt.images.length - imagesToShow.length;

    const thumbnails = await Promise.all(
      imagesToShow.map(async (imgRef) => {
        // 从 images.json 获取完整图像信息
        const img = allImages.find(i => i.id === imgRef.id);
        if (!img) return '';

        // 优先使用缩略图，如果没有则使用原图
        const imagePath = img.thumbnailPath || img.relativePath;
        if (!imagePath) return '';

        const fullPath = await window.electronAPI.getImagePath(imagePath);
        return `<div class="thumbnail-item"><img src="file://${fullPath}" alt="${img.fileName || ''}"></div>`;
      })
    );

    let html = thumbnails.filter(t => t).join('');
    if (remainingCount > 0) {
      html += `<div class="thumbnail-more">+${remainingCount}</div>`;
    }

    container.innerHTML = html;
  }
  
  openEditModal(prompt = null) {
    const modal = document.getElementById('editModal');
    const form = document.getElementById('promptForm');

    // 重置图像
    this.currentImages = [];

    if (prompt && prompt.id) {
      document.getElementById('promptId').value = prompt.id;
      document.getElementById('promptTitle').value = prompt.title || '';
      document.getElementById('promptTags').value = prompt.tags ? prompt.tags.join(', ') : '';
      document.getElementById('promptContent').value = prompt.content || '';

      // 加载已有图像
      if (prompt.images && prompt.images.length > 0) {
        this.currentImages = [...prompt.images];
      }
    } else {
      form.reset();
      document.getElementById('promptId').value = '';
    }

    this.renderImagePreviews();
    modal.classList.add('active');
    document.getElementById('promptTitle').focus();
  }

  /**
   * 关闭编辑模态框
   * @param {boolean} isCancel - 是否是取消操作
   */
  closeEditModal(isCancel = true) {
    document.getElementById('editModal').classList.remove('active');
    
    // 只有在取消编辑时才清理返回图像详情的标志
    // 保存成功时由 savePrompt 处理
    if (isCancel && this.returnToImageDetail) {
      this.returnToImageDetail = false;
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
    console.debug('openImageDetailModal called');
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
    document.getElementById('imageDetailFileName').textContent = fullImageInfo.fileName || '-';

    // 查找所属的 Prompt 信息
    // 优先使用传入的 promptInfo，如果没有则尝试从数据库获取
    let promptInfo = this.detailPromptInfo || null;
    
    // 如果没有传入的 promptInfo，尝试从数据库获取
    if (!promptInfo && fullImageInfo.promptRefs && fullImageInfo.promptRefs.length > 0) {
      const promptRef = fullImageInfo.promptRefs[0];
      // 优先从数据库返回的数据中获取，如果没有则从本地缓存查找
      promptInfo = this.prompts.find(p => p.id === promptRef.promptId);
      // 如果本地缓存中没有，使用数据库返回的数据
      if (!promptInfo && promptRef.promptContent) {
        promptInfo = {
          title: promptRef.promptTitle,
          content: promptRef.promptContent,
          tags: []
        };
      }
    }

    // 设置所属 Prompt 信息
    const editPromptBtn = document.getElementById('editPromptFromImageBtn');
    if (promptInfo) {
      document.getElementById('imageDetailPromptTitle').textContent = promptInfo.title || '-';
      document.getElementById('imageDetailPromptContent').textContent = promptInfo.content || '-';

      // 设置标签
      const tagsContainer = document.getElementById('imageDetailTags');
      if (promptInfo.tags && promptInfo.tags.length > 0) {
        tagsContainer.innerHTML = promptInfo.tags.map(tag =>
          `<span class="tag">${this.escapeHtml(tag)}</span>`
        ).join('');
      } else {
        tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
      }

      // 显示编辑按钮，并保存当前提示词ID
      editPromptBtn.style.display = 'flex';
      this.currentDetailPromptId = promptInfo.id;
    } else {
      document.getElementById('imageDetailPromptTitle').textContent = '图像库';
      document.getElementById('imageDetailPromptContent').textContent = '独立上传的图像';
      document.getElementById('imageDetailTags').innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';

      // 隐藏编辑按钮
      editPromptBtn.style.display = 'none';
      this.currentDetailPromptId = null;
    }

    // 设置图像标签
    this.renderImageTags(fullImageInfo.tags || []);

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

    // 更新计数器
    document.getElementById('imageDetailCounter').textContent = 
      `${this.detailCurrentIndex + 1} / ${this.detailImages.length}`;

    // 更新导航按钮状态
    document.getElementById('prevImageBtn').disabled = this.detailCurrentIndex === 0;
    document.getElementById('nextImageBtn').disabled = 
      this.detailCurrentIndex === this.detailImages.length - 1;
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
   * 从图像详情界面编辑提示词
   * 关闭图像详情界面，打开提示词编辑界面
   */
  async editPromptFromImageDetail() {
    if (!this.currentDetailPromptId) {
      this.showToast('没有可编辑的提示词', 'error');
      return;
    }

    // 查找提示词信息
    const prompt = this.prompts.find(p => p.id === this.currentDetailPromptId);
    if (!prompt) {
      this.showToast('提示词不存在', 'error');
      return;
    }

    // 保存当前图像详情状态，以便编辑完成后返回
    this.returnToImageDetail = true;
    this.returnToImageDetailIndex = this.detailCurrentIndex;
    this.returnToImageDetailImages = [...this.detailImages];
    this.returnToImageDetailPanel = this.currentPanel; // 保存当前面板状态

    // 关闭图像详情界面
    this.closeImageDetailModal();

    // 如果当前不在提示词管理界面，切换到提示词管理界面
    if (this.currentPanel !== 'prompt') {
      this.openPromptManager();
    }

    // 打开编辑界面
    this.openEditModal(prompt);
  }

  /**
   * 关闭图像详情模态框
   * 关闭时刷新图像管理界面的标签筛选
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
   * 渲染图像标签
   * @param {Array} tags - 标签数组
   */
  renderImageTags(tags) {
    const container = document.getElementById('imageDetailImageTags');
    if (tags && tags.length > 0) {
      container.innerHTML = tags.map(tag =>
        `<span class="tag">${this.escapeHtml(tag)}</span>`
      ).join('');
    } else {
      container.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
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
      this.showToast('标签已添加');
    } catch (error) {
      console.error('Add image tag error:', error);
      this.showToast('添加标签失败', 'error');
    }
  }

  /**
   * 保存 Prompt
   * 创建新 Prompt 或更新现有 Prompt
   */
  async savePrompt() {
    const id = document.getElementById('promptId').value;
    const title = document.getElementById('promptTitle').value.trim();
    const tagsInput = document.getElementById('promptTags').value.trim();
    const content = document.getElementById('promptContent').value.trim();

    if (!title || !content) {
      this.showToast('请填写标题和内容', 'error');
      return;
    }

    // 检查标题是否重复
    const isExists = await window.electronAPI.isTitleExists(title, id || null);
    if (isExists) {
      this.showToast('该提示词标题已存在，请使用其他标题', 'error');
      return;
    }

    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
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
        const result = await window.electronAPI.updatePrompt(id, { title, tags, content, images });
        if (result === null) {
          throw new Error('找不到要更新的 Prompt');
        }
        this.showToast('Prompt 已更新');
      } else {
        // 新建
        await window.electronAPI.addPrompt({ title, tags, content, images });
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

      if (!tags || tags.length === 0) {
        container.innerHTML = '<span style="color: var(--text-secondary); font-size: 13px;">暂无标签</span>';
        clearBtn.style.display = 'none';
        return;
      }

      container.innerHTML = tags.map(tag => {
        const isActive = this.selectedImageTag === tag;
        return `<span class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</span>`;
      }).join('');

      // 绑定标签点击事件
      container.querySelectorAll('.tag-filter-item').forEach(item => {
        item.addEventListener('click', () => {
          const tag = item.dataset.tag;
          if (this.selectedImageTag === tag) {
            // 取消选择
            this.selectedImageTag = null;
          } else {
            // 选择新标签
            this.selectedImageTag = tag;
          }
          this.renderImageTagFilters();
          this.renderImageGrid();
        });
      });

      // 显示/隐藏清除按钮
      clearBtn.style.display = this.selectedImageTag ? 'block' : 'none';
    } catch (error) {
      console.error('Failed to render image tag filters:', error);
    }
  }

  /**
   * 清除图像标签筛选
   * 重置筛选状态并重新渲染图像列表
   */
  clearImageTagFilter() {
    this.selectedImageTag = null;
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
      // 获取所有图像信息（每张图像只返回一条记录）
      const allImages = await window.electronAPI.getImages();

      // 根据选中的标签筛选图像
      let filteredImages = allImages;
      if (this.selectedImageTag) {
        filteredImages = allImages.filter(img =>
          img.tags && img.tags.includes(this.selectedImageTag)
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
            return `
              <div class="image-card" data-index="${index}" data-prompt-id="${promptRef ? promptRef.promptId : ''}" data-image-id="${img.id}">
                <div class="image-card-thumbnail-wrapper">
                  <img src="file://${fullPath}" alt="${img.fileName}" class="image-card-thumbnail">
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

      // 绑定删除按钮事件
      imageGrid.querySelectorAll('.image-card-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation(); // 阻止冒泡，避免打开详情
          const imageId = e.currentTarget.dataset.imageId;
          await this.deleteImage(imageId);
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
    const confirmed = await window.electronAPI.showConfirmDialog('确认删除图像', '确定要将这个图像移动到回收站吗？');
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
      } else {
        // 添加图像标签
        if (tags.length > 0) {
          await window.electronAPI.updateImageTags(imageInfo.id, tags);
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
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new PromptManager();
});
