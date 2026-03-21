import { DialogService, DialogConfig } from '../services/DialogService.js';
import { ImageUploadHandler } from '../services/ImageUploadHandler.js';

/**
 * 新建提示词管理器
 * 负责管理新建提示词页面的完整生命周期
 */
export class NewPromptManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;

    // 状态
    this.pendingTitle = null;
    this.currentId = null;
    this.prefillImages = [];
    this.newImages = [];
  }

  /**
   * 打开新建提示词页面
   * @param {Array} prefillImages - 预填充的图像列表
   */
  async open(prefillImages = []) {
    try {
      // 不生成默认标题，让 main.js 自动生成
      this.pendingTitle = null;
      this.currentId = null;

      // 初始化新建页面表单
      document.getElementById('newPromptContent').value = '';

      // 初始化图像列表（预填充图像和新上传图像分开存储）
      this.prefillImages = prefillImages || [];
      this.newImages = [];
      await this.renderImages();

      // 显示新建页面
      document.getElementById('newPromptPage').classList.add('active');
      document.getElementById('newPromptDoneBtn').disabled = true;

      // 绑定事件
      this.bindEvents();

      // 聚焦内容输入框
      document.getElementById('newPromptContent').focus();

    } catch (error) {
      window.electronAPI.logError('NewPromptManager.js', 'Failed to open new prompt page:', error);
      this.app.showToast('Failed to open new prompt page', 'error');
    }
  }

  /**
   * 关闭新建提示词页面
   * @param {boolean} save - 是否保存（true=完成，false=取消）
   */
  async close(save = true) {
    const modal = document.getElementById('newPromptPage');

    if (!save) {
      // 取消时只删除本次新上传的图像（预填充图像不删除）
      if (this.newImages && this.newImages.length > 0) {
        for (const img of this.newImages) {
          try {
            await window.electronAPI.permanentDeleteImage(img.id);
          } catch (error) {
            window.electronAPI.logError('NewPromptManager.js', 'Failed to delete image:', error);
          }
        }
      }
      this.app.showToast('Cancelled');
    } else {
      // 完成时创建提示词
      const content = document.getElementById('newPromptContent').value.trim();
      if (!content) {
        this.app.showToast('Prompt content cannot be empty', 'error');
        return;
      }

      try {
        // 合并预填充图像和新上传图像
        const allImages = [...(this.prefillImages || []), ...(this.newImages || [])];
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

    // 关闭页面
    modal.classList.remove('active');

    // 清理状态
    this.resetState();

    // 刷新列表
    await this.app.loadPrompts();
    if (this.app.promptPanelManager) {
      await this.app.promptPanelManager.renderView();
      await this.app.promptPanelManager.renderTagFilters();
    }
  }

  /**
   * 处理图像文件上传
   * @param {FileList} files - 要处理的图像文件列表
   */
  async handleImageUpload(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      try {
        const imageInfo = await window.electronAPI.saveImageFile(file.path, file.name);
        // 获取完整图像信息（包含 relativePath）
        const fullImageInfo = await window.electronAPI.getImageById(imageInfo.id);
        if (fullImageInfo) {
          this.newImages.push(fullImageInfo);
        }
      } catch (error) {
        window.electronAPI.logError('NewPromptManager.js', 'Failed to upload image:', error);
        this.app.showToast('Failed to upload image: ' + file.name, 'error');
      }
    }

    // 重新渲染图像列表
    await this.renderImages();
  }

  /**
   * 渲染图像列表
   */
  async renderImages() {
    const container = document.getElementById('newPromptImagePreviewList');
    const allImages = [...(this.prefillImages || []), ...(this.newImages || [])];

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
          ? `<button type="button" class="remove-image" data-index="${index - prefillCount}" title="Remove image">×</button>`
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
      btn.onclick = () => this.removeImage(parseInt(btn.dataset.index));
    });
  }

  /**
   * 删除新上传的图像
   * @param {number} index - 图像索引
   */
  async removeImage(index) {
    const confirmed = await DialogService.showConfirmDialogByConfig(DialogConfig.REMOVE_NEW_IMAGE);
    if (!confirmed) return;

    if (index >= 0 && index < this.newImages.length) {
      this.newImages.splice(index, 1);
      this.renderImages();
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 取消按钮
    document.getElementById('newPromptCancelBtn').onclick = () => this.close(false);

    // 完成按钮
    document.getElementById('newPromptDoneBtn').onclick = () => this.close(true);

    // 关闭按钮
    document.getElementById('closeNewPromptPage').onclick = () => this.close(false);

    // 内容输入 - 实时更新完成按钮状态
    const contentInput = document.getElementById('newPromptContent');
    contentInput.oninput = () => {
      const hasContent = contentInput.value.trim().length > 0;
      document.getElementById('newPromptDoneBtn').disabled = !hasContent;
      this.app.autoResizeTextarea(contentInput);
    };

    // 图像上传
    this.imageUploadHandler = new ImageUploadHandler('newPromptImageUploadArea', 'newPromptImageInput', {
      onFilesSelected: (files) => this.handleImageUpload(files)
    });
    this.imageUploadHandler.bind();
  }

  /**
   * 重置状态
   */
  resetState() {
    this.pendingTitle = null;
    this.currentId = null;
    this.prefillImages = [];
    this.newImages = [];
  }

  /**
   * 生成唯一时间戳
   * @returns {string} - 时间戳字符串
   * @private
   */
  generateUniqueTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}_${ms}`;
  }
}
