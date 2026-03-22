import { DelaySaveStrategy } from '../services/UploadStrategies.js';
import { ImagePreviewManager } from './ImagePreviewManager.js';

/**
 * 图像上传管理器
 * 使用延迟保存策略：选择 → 预览 → 确认保存
 * 职责：协调策略、预览管理和 UI 交互
 */
export class ImageUploadManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;
    this.strategy = new DelaySaveStrategy(this.app);
    this.previewManager = new ImagePreviewManager({
      containerId: 'modalImagePreviewList',
      onRemove: (index) => this.handleRemoveImage(index)
    });
    // 绑定事件委托（只需执行一次）
    this.previewManager.bindEvents();
  }

  /**
   * 打开上传图像模态框
   */
  open() {
    const modal = document.getElementById('imageUploadModal');
    if (modal) {
      modal.classList.add('active');
    }
  }

  /**
   * 关闭上传图像模态框
   */
  async close() {
    const modal = document.getElementById('imageUploadModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /**
   * 绑定图像上传事件
   */
  bindEvents() {
    this.bindModalUploadEvents();
    this.bindModalButtonEvents();
  }

  /**
   * 绑定模态框上传事件
   */
  bindModalUploadEvents() {
    const modalUploadArea = document.getElementById('modalImageUploadArea');
    if (!modalUploadArea) return;

    // 点击上传区域 - 选择多图
    modalUploadArea.addEventListener('click', async (e) => {
      if (e.target.closest('.remove-image')) return;
      await this.handleSelectImages();
    });

    // 禁止拖拽上传
    modalUploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
    });
    modalUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
    });
  }

  /**
   * 绑定模态框按钮事件
   */
  bindModalButtonEvents() {
    const cancelBtn = document.getElementById('cancelImageUploadBtn');
    const confirmBtn = document.getElementById('confirmImageUploadBtn');
    const closeBtn = document.getElementById('closeImageUploadModal');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.handleCancel());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.handleCancel());
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.handleConfirm());
    }
  }

  /**
   * 处理选择多图
   */
  async handleSelectImages() {
    // 打开安全文件对话框（支持多选）
    const filePaths = await window.electronAPI.openImageFiles();

    const result = await this.strategy.selectFiles(filePaths);
    if (!result.success) return;

    // 显示预览
    this.previewManager.render(this.strategy.getFilePaths());

    // 启用确定按钮
    const confirmBtn = document.getElementById('confirmImageUploadBtn');
    if (confirmBtn) {
      confirmBtn.disabled = false;
    }
  }

  /**
   * 处理删除图像
   * @param {number} index - 图像索引
   */
  handleRemoveImage(index) {
    const result = this.strategy.removeFile(index);
    if (result.success) {
      this.previewManager.render(result.filePaths);
    }
  }

  /**
   * 确认上传（延迟保存）
   */
  async handleConfirm() {
    // 显示进度提示
    const progressToast = this.app.showToast('正在保存图像...', 'info', 0);

    const result = await this.strategy.confirm('image-manager', (current, total) => {
      // 更新进度
      this.app.showToast(`正在保存图像... (${current}/${total})`, 'info', 0);
    });

    // 关闭进度提示
    if (progressToast) {
      progressToast.remove();
    }

    if (!result.success) {
      this.app.showToast(result.message, 'error');
      return;
    }

    this.app.showToast(`成功保存 ${result.count} 张图像`, 'success');

    // 清理
    this.previewManager.clear();
    this.strategy.clear();

    // 触发事件
    this.app.eventBus?.emit('imagesChanged');
    this.close();
  }

  /**
   * 取消上传
   */
  async handleCancel() {
    this.previewManager.clear();
    this.strategy.clear();
    this.close();
  }
}
