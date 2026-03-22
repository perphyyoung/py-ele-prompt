import { DialogService, DialogConfig } from '../services/DialogService.js';
import { DelaySaveStrategy } from '../services/UploadStrategies.js';
import { ImagePreviewManager } from './ImagePreviewManager.js';

/**
 * 新建提示词管理器
 * 使用延迟保存策略：选择 → 预览 → 确认保存
 * 职责：协调策略、预览管理和 UI 交互
 */
export class NewPromptManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;
    this.strategy = new DelaySaveStrategy(this.app);
    this.previewManager = new ImagePreviewManager({
      containerId: 'newPromptImagePreviewList',
      onRemove: (index) => this.handleRemoveImage(index)
    });
    // 绑定事件委托（只需执行一次）
    this.previewManager.bindEvents();

    // 状态
    this.pendingTitle = null;
    this.currentId = null;
    this.prefillImages = [];
  }

  /**
   * 打开新建提示词页面
   * @param {Array} prefillImages - 预填充的图像列表
   */
  async open(prefillImages = []) {
    try {
      this.pendingTitle = null;
      this.currentId = null;
      this.prefillImages = prefillImages || [];
      this.strategy.clear(); // 清理之前的状态

      // 初始化表单
      document.getElementById('newPromptContent').value = '';
      this.previewManager.clear();

      // 显示页面
      document.getElementById('newPromptPage').classList.add('active');

      // 绑定事件
      if (!this.eventsBound) {
        this.bindEvents();
        this.eventsBound = true;
      }

      document.getElementById('newPromptContent').focus();

    } catch (error) {
      window.electronAPI.logError('NewPromptManager.js', 'Failed to open new prompt page:', error);
      this.app.showToast('Failed to open new prompt page', 'error');
    }
  }

  /**
   * 关闭新建提示词页面
   * @param {boolean} save - 是否保存
   */
  async close(save = true) {
    const modal = document.getElementById('newPromptPage');

    if (!save) {
      // 取消时清理
      this.previewManager.clear();
      this.strategy.clear();
      this.app.showToast('Cancelled');
    } else {
      // 完成时保存图像并创建提示词
      const content = document.getElementById('newPromptContent').value.trim();
      if (!content) {
        this.app.showToast('提示词内容不能为空', 'error');
        return;
      }

      // 保存所有选择的图像到数据目录
      const result = await this.strategy.confirm('new-prompt');
      if (!result.success) {
        this.app.showToast(result.message, 'error');
        return;
      }

      try {
        // 合并预填充图像和新保存图像
        const allImages = [...(this.prefillImages || []), ...result.images];
        await window.electronAPI.addPrompt({
          tags: [],
          content: content,
          images: allImages,
          isSafe: 1
        });

        this.app.showToast('Prompt created successfully');
        this.app.eventBus?.emit('imagesChanged');
        this.app.eventBus?.emit('promptsChanged');
      } catch (error) {
        window.electronAPI.logError('NewPromptManager.js', 'Failed to create prompt:', error);
        this.app.showToast('Failed to create prompt', 'error');
        return;
      }
    }

    modal.classList.remove('active');
    this.resetState();

    await this.app.loadPrompts();
    if (this.app.promptPanelManager) {
      await this.app.promptPanelManager.renderView();
      await this.app.promptPanelManager.renderTagFilters();
    }
  }

  /**
   * 处理选择多图
   */
  async handleSelectImages() {
    const filePaths = await window.electronAPI.openImageFiles();

    const result = await this.strategy.selectFiles(filePaths);
    if (!result.success) return;

    // 更新预览
    this.previewManager.render(this.strategy.getFilePaths());
  }

  /**
   * 处理删除图像
   * @param {number} index - 图像索引
   */
  async handleRemoveImage(index) {
    const confirmed = await DialogService.showConfirmDialogByConfig(DialogConfig.REMOVE_NEW_IMAGE);
    if (!confirmed) return;

    const result = this.strategy.removeFile(index);
    if (result.success) {
      this.previewManager.render(result.filePaths);
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    document.getElementById('newPromptCancelBtn').onclick = () => this.close(false);
    document.getElementById('newPromptDoneBtn').onclick = () => this.close(true);
    document.getElementById('closeNewPromptPage').onclick = () => this.close(false);

    const contentInput = document.getElementById('newPromptContent');
    contentInput.oninput = () => {
      this.app.autoResizeTextarea(contentInput);
    };

    // 图像上传区域点击
    const uploadArea = document.getElementById('newPromptImageUploadArea');
    if (uploadArea) {
      uploadArea.addEventListener('click', async (e) => {
        if (e.target.closest('.remove-image')) return;
        await this.handleSelectImages();
      });

      // 禁止拖拽上传
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'none';
      });
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
      });
    }
  }

  /**
   * 重置状态
   */
  resetState() {
    this.pendingTitle = null;
    this.currentId = null;
    this.prefillImages = [];
    this.strategy.clear();
    this.eventsBound = false;
  }
}
