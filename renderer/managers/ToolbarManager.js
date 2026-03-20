/**
 * 工具栏管理器
 * 负责处理工具栏按钮事件和操作
 */
import { DialogService, DialogConfig } from '../services/DialogService.js';

export class ToolbarManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;
  }

  /**
   * 初始化
   */
  init() {
    this.bindEvents();
  }

  /**
   * 绑定事件
   * @private
   */
  bindEvents() {
    this.bindRefreshEvents();
    this.bindPromptToolbarEvents();
    this.bindImageToolbarEvents();
    this.bindTagFilterEvents();
    this.bindTagManagerEvents();
  }

  /**
   * 绑定刷新事件
   * @private
   */
  bindRefreshEvents() {
    document.getElementById('reloadBtn')?.addEventListener('click', () => this.refreshData());
    document.getElementById('refreshBtn')?.addEventListener('click', () => this.relaunchApp());
  }

  /**
   * 绑定提示词工具栏事件
   * @private
   */
  bindPromptToolbarEvents() {
    document.getElementById('promptAddBtn')?.addEventListener('click', () => this.app.openNewPromptPage?.());
  }

  /**
   * 绑定图像工具栏事件
   * @private
   */
  bindImageToolbarEvents() {
    document.getElementById('imageAddBtn')?.addEventListener('click', () => this.app.openUploadImageModal?.());

    // 绑定图像上传事件
    this.bindImageUploadEvents();
  }

  /**
   * 绑定标签筛选事件
   * @private
   */
  bindTagFilterEvents() {
    document.getElementById('clearPromptTagFilter')?.addEventListener('click', () => this.app.promptPanelManager?.clearTagFilter());
    document.getElementById('clearImageTagFilter')?.addEventListener('click', () => this.app.imagePanelManager?.clearTagFilter());
  }

  /**
   * 绑定标签管理器事件
   * @private
   */
  bindTagManagerEvents() {
    document.getElementById('promptTagManagerBtn')?.addEventListener('click', () => this.app.openPromptTagManagerModal?.());
    document.getElementById('imageTagManagerBtn')?.addEventListener('click', () => this.app.openImageTagManagerModal?.());
  }

  /**
   * 绑定图像上传事件
   * 支持点击上传和拖拽上传
   * @private
   */
  bindImageUploadEvents() {
    const uploadArea = document.getElementById('imageUploadArea');
    const imageInput = document.getElementById('imageInput');
    const selectFromManagerBtn = document.getElementById('selectFromImageManagerBtn');

    if (!uploadArea || !imageInput) return;

    // 点击上传区域触发文件选择
    uploadArea.addEventListener('click', (e) => {
      if (e.target !== selectFromManagerBtn) {
        imageInput.click();
      }
    });

    // 文件选择变化处理
    imageInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleImageFiles(e.target.files);
        imageInput.value = ''; // 清空选择，允许重复选择相同文件
      }
    });

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.remove('dragover');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleImageFiles(files);
      }
    });

    // 从图像管理器选择按钮
    if (selectFromManagerBtn) {
      selectFromManagerBtn.addEventListener('click', () => {
        this.app.openImageSelector?.();
      });
    }
  }

  /**
   * 处理图像文件
   * @param {FileList} files - 文件列表
   * @private
   */
  async handleImageFiles(files) {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      this.app.showToast?.('请选择图像文件', 'error');
      return;
    }

    for (const file of imageFiles) {
      try {
        await this.uploadImage(file);
      } catch (error) {
        console.error('Failed to upload image:', error);
        this.app.showToast?.(`上传失败: ${file.name}`, 'error');
      }
    }
  }

  /**
   * 上传单个图像
   * @param {File} file - 图像文件
   * @private
   */
  async uploadImage(file) {
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onload = async (e) => {
        try {
          const base64Data = e.target.result;
          const result = await window.electronAPI.importImage(base64Data, file.name);

          if (result.success) {
            this.app.showToast?.(`已添加: ${file.name}`, 'success');

            // 刷新图像列表
            if (this.app.imagePanelManager) {
              await this.app.imagePanelManager.loadData();
              await this.app.imagePanelManager.renderView();
            }

            resolve(result);
          } else {
            reject(new Error(result.message || 'Upload failed'));
          }
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * 刷新数据
   */
  async refreshData() {
    try {
      window.electronAPI.logDebug('ToolbarManager', 'User clicked refresh');
      if (this.app.promptPanelManager) {
        await this.app.promptPanelManager.loadData();
        await this.app.promptPanelManager.renderView();
      }
      if (this.app.imagePanelManager) {
        await this.app.imagePanelManager.loadData();
        await this.app.imagePanelManager.renderView();
      }

      this.app.showToast?.('数据已刷新', 'success');
    } catch (error) {
      window.electronAPI.logError('ToolbarManager', 'Failed to refresh data', { error: error.message });
      this.app.showToast?.('刷新失败', 'error');
    }
  }

  /**
   * 重启应用
   */
  async relaunchApp() {
    const confirmed = await DialogService.showConfirmDialogByConfig?.(DialogConfig.RELAUNCH_APP);
    if (!confirmed) return;

    try {
      this.app.showToast?.('正在重启应用...', 'info');
      await window.electronAPI.relaunchApp();
    } catch (error) {
      console.error('Failed to relaunch app:', error);
      this.app.showToast?.('重启失败', 'error');
    }
  }
}
