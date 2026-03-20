import { isSameId } from '../utils/isSameId.js';
import { cacheManager } from '../utils/CacheManager.js';

/**
 * 图像上传管理器
 * 负责管理图像上传流程和预览
 */
export class ImageUploadManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;
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
  close() {
    const modal = document.getElementById('imageUploadModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /**
   * 绑定图像上传事件
   * 支持点击上传和拖拽上传
   */
  bindEvents() {
    // 提示词详情页上传区域
    const uploadArea = document.getElementById('imageUploadArea');
    const imageInput = document.getElementById('imageInput');
    const selectFromManagerBtn = document.getElementById('selectFromImageManagerBtn');

    if (uploadArea && imageInput) {
      // 点击上传区域触发文件选择
      uploadArea.addEventListener('click', () => imageInput.click());

      // 文件选择变化
      imageInput.addEventListener('change', (e) => {
        this.handleFiles(e.target.files);
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
        this.handleFiles(e.dataTransfer.files);
      });
    }

    // 从图像管理选择按钮
    if (selectFromManagerBtn) {
      selectFromManagerBtn.addEventListener('click', () => {
        this.app.imageSelectorManager.open({
          onConfirm: async (selectedImage) => {
            await this.app.addImageToCurrentPrompt(selectedImage);
          }
        });
      });
    }

    // 模态框上传区域
    this.bindModalUploadEvents();

    // 模态框按钮事件
    this.bindModalButtonEvents();
  }

  /**
   * 绑定模态框上传事件
   */
  bindModalUploadEvents() {
    const modalUploadArea = document.getElementById('modalImageUploadArea');
    const modalImageInput = document.getElementById('modalSingleImageInput');
    const modalUploadPlaceholder = document.getElementById('modalUploadPlaceholder');
    const modalImagePreviewSingle = document.getElementById('modalImagePreviewSingle');
    const modalSinglePreviewImg = document.getElementById('modalSinglePreviewImg');
    const modalRemoveSingleImage = document.getElementById('modalRemoveSingleImage');

    if (!modalUploadArea || !modalImageInput) return;

    // 点击上传区域触发文件选择
    modalUploadArea.addEventListener('click', (e) => {
      // 如果点击的是删除按钮，不触发文件选择
      if (e.target.closest('.remove-image')) return;
      modalImageInput.click();
    });

    // 文件选择变化
    modalImageInput.addEventListener('change', (e) => {
      this.handleModalFileSelect(e.target.files[0]);
    });

    // 删除按钮
    if (modalRemoveSingleImage) {
      modalRemoveSingleImage.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearModalPreview();
      });
    }

    // 拖拽上传
    modalUploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      modalUploadArea.classList.add('dragover');
    });

    modalUploadArea.addEventListener('dragleave', () => {
      modalUploadArea.classList.remove('dragover');
    });

    modalUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      modalUploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.handleModalFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  /**
   * 处理模态框文件选择
   * @param {File} file - 选中的文件
   */
  handleModalFileSelect(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const modalUploadPlaceholder = document.getElementById('modalUploadPlaceholder');
    const modalImagePreviewSingle = document.getElementById('modalImagePreviewSingle');
    const modalSinglePreviewImg = document.getElementById('modalSinglePreviewImg');

    // 显示预览
    const reader = new FileReader();
    reader.onload = (e) => {
      if (modalSinglePreviewImg) modalSinglePreviewImg.src = e.target.result;
      if (modalUploadPlaceholder) modalUploadPlaceholder.style.display = 'none';
      if (modalImagePreviewSingle) modalImagePreviewSingle.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // 保存文件引用供上传使用
    this.selectedModalFile = file;

    // 启用上传按钮
    const confirmBtn = document.getElementById('confirmImageUploadBtn');
    if (confirmBtn) confirmBtn.disabled = false;
  }

  /**
   * 清除模态框预览
   */
  clearModalPreview() {
    const modalUploadPlaceholder = document.getElementById('modalUploadPlaceholder');
    const modalImagePreviewSingle = document.getElementById('modalImagePreviewSingle');
    const modalImageInput = document.getElementById('modalSingleImageInput');

    if (modalUploadPlaceholder) modalUploadPlaceholder.style.display = 'flex';
    if (modalImagePreviewSingle) modalImagePreviewSingle.style.display = 'none';
    if (modalImageInput) modalImageInput.value = '';

    this.selectedModalFile = null;

    // 禁用上传按钮
    const confirmBtn = document.getElementById('confirmImageUploadBtn');
    if (confirmBtn) confirmBtn.disabled = true;
  }

  /**
   * 绑定模态框按钮事件
   */
  bindModalButtonEvents() {
    const cancelBtn = document.getElementById('cancelImageUploadBtn');
    const confirmBtn = document.getElementById('confirmImageUploadBtn');
    const closeBtn = document.getElementById('closeImageUploadModal');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.clearModalPreview();
        this.close();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.clearModalPreview();
        this.close();
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.handleModalUpload());
    }
  }

  /**
   * 处理模态框上传
   */
  async handleModalUpload() {
    if (!this.selectedModalFile) return;

    const confirmBtn = document.getElementById('confirmImageUploadBtn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '上传中...';
    }

    try {
      const file = this.selectedModalFile;

      // 获取文件的临时路径
      let filePath = file.path;
      if (!filePath) {
        const arrayBuffer = await file.arrayBuffer();
        const tempPath = await this.saveTempFile(arrayBuffer, file.name);
        filePath = tempPath;
      }

      // 保存到数据目录
      const imageInfo = await window.electronAPI.saveImageFile(filePath, file.name);

      if (imageInfo.isDuplicate && imageInfo.duplicateMessage) {
        this.app.showToast(imageInfo.duplicateMessage, 'info');
      } else {
        this.app.showToast('图像上传成功', 'success');
        this.app.eventBus?.emit('imagesChanged');
      }

      // 获取提示词内容
      const promptContent = document.getElementById('uploadImagePrompt')?.value?.trim();

      // 如果有关联提示词内容，创建提示词
      if (promptContent) {
        const title = this.generateTimestampTitle();
        await window.electronAPI.addPrompt({
          title,
          content: promptContent,
          images: [imageInfo]
        });
        this.app.showToast('提示词创建成功', 'success');
        this.app.eventBus?.emit('promptsChanged');
      }

      // 刷新提示词面板
      await this.app.loadData(true);

      // 关闭模态框并清理
      this.clearModalPreview();
      document.getElementById('uploadImagePrompt').value = '';
      this.close();

    } catch (error) {
      console.error('Failed to upload image:', error);
      this.app.showToast('上传失败: ' + error.message, 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = !this.selectedModalFile;
        confirmBtn.textContent = '上传';
      }
    }
  }

  /**
   * 生成时间戳标题
   */
  generateTimestampTitle() {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    return `Prompt_${timestamp}`;
  }

  /**
   * 处理图像文件上传
   * 保存图像到数据目录并生成缩略图
   * @param {FileList} fileList - 要处理的图像文件列表
   */
  async handleFiles(fileList) {
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
          this.app.showToast(imageInfo.duplicateMessage, 'info');
        }

        // 保存图像 ID 到当前图像缓存
        this.app.currentImagesCache.set(String(imageInfo.id), {
          id: imageInfo.id,
          fileName: imageInfo.fileName
        });

        // 立即保存到数据库
        const promptId = document.getElementById('promptId').value;
        if (promptId) {
          const updatedImages = Array.from(this.app.currentImagesCache.values());
          await this.app.savePromptField('images', updatedImages);
        }
      } catch (error) {
        console.error('Failed to save image:', error);
        this.app.showToast('Failed to save image: ' + error.message, 'error');
      }
    }
    this.app.renderImagePreviews();
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
}
