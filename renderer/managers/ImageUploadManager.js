import { isSameId } from '../utils/isSameId.js';

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
    const uploadArea = document.getElementById('imageUploadArea');
    const imageInput = document.getElementById('imageInput');
    const selectFromManagerBtn = document.getElementById('selectFromImageManagerBtn');

    if (!uploadArea || !imageInput) return;

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

        // 只保存图像 ID 到当前图像列表
        this.app.currentImages.push({
          id: imageInfo.id,
          fileName: imageInfo.fileName
        });

        // 立即保存到数据库
        const promptId = document.getElementById('promptId').value;
        if (promptId) {
          await this.app.savePromptField('images', this.app.currentImages);
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
