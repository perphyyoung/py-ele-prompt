import { ImageUploadService } from './ImageUploadService.js';
import { UploadNotificationService } from './UploadNotificationService.js';

/**
 * 上传策略基类
 * 纯策略逻辑，不包含 UI 操作
 */
export class UploadStrategy {
  constructor(app) {
    this.app = app;
    this.imageUploadService = new ImageUploadService(app);
    this.notificationService = new UploadNotificationService(app);
  }

  /**
   * 选择文件后的处理
   * @param {string[]} filePaths - 文件路径数组
   * @returns {Promise<Object>} 处理结果
   */
  async selectFiles(filePaths) {
    throw new Error('selectFiles must be implemented by subclass');
  }

  /**
   * 移除文件
   * @param {number} index - 文件索引
   * @returns {Promise<Object>|Object} 处理结果
   */
  async removeFile(index) {
    throw new Error('removeFile must be implemented by subclass');
  }

  /**
   * 获取当前文件列表
   * @returns {string[]} 文件路径数组
   */
  getFilePaths() {
    throw new Error('getFilePaths must be implemented by subclass');
  }

  /**
   * 清理状态
   */
  clear() {
    throw new Error('clear must be implemented by subclass');
  }
}

/**
 * 延迟保存策略
 * 选择文件后只记录路径，确认后才保存到数据目录
 */
export class DelaySaveStrategy extends UploadStrategy {
  constructor(app) {
    super(app);
    this.selectedFilePaths = [];
    this.savedImages = [];
  }

  /**
   * 选择文件（仅记录路径，不保存）
   * @param {string[]} filePaths - 文件路径数组
   * @returns {Promise<Object>} 处理结果
   */
  async selectFiles(filePaths) {
    if (!filePaths || filePaths.length === 0) {
      return { success: false, message: 'No files selected' };
    }

    this.selectedFilePaths = [...this.selectedFilePaths, ...filePaths];
    return {
      success: true,
      filePaths: [...this.selectedFilePaths],
      count: this.selectedFilePaths.length
    };
  }

  /**
   * 确认保存（保存到数据目录）
   * @param {string} source - 来源标识
   * @param {Function} onProgress - 进度回调 (current, total) => void
   * @returns {Promise<Object>} 保存结果
   */
  async confirm(source = 'upload', onProgress) {
    if (this.selectedFilePaths.length === 0) {
      return { success: false, message: 'No files to save' };
    }

    const fileInfos = this.selectedFilePaths.map(path => ({
      path,
      name: path.split(/[\\/]/).pop()
    }));

    try {
      const results = await this.imageUploadService.uploadBatch(fileInfos, {
        source,
        onProgress
      });

      this.savedImages = results;

      // 通知成功
      this.notificationService.notifyBatchComplete(results.length);

      return {
        success: true,
        images: [...this.savedImages],
        count: this.savedImages.length
      };
    } catch (error) {
      this.notificationService.notifyError(error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * 移除选择的文件
   * @param {number} index - 文件索引
   * @returns {Object} 处理结果
   */
  removeFile(index) {
    if (index >= 0 && index < this.selectedFilePaths.length) {
      this.selectedFilePaths.splice(index, 1);
      return { success: true, filePaths: [...this.selectedFilePaths] };
    }
    return { success: false, message: 'Invalid index' };
  }

  /**
   * 设为首张（重排文件顺序）
   * @param {number} index - 文件索引
   * @returns {Object} 处理结果
   */
  setFirst(index) {
    if (index <= 0 || index >= this.selectedFilePaths.length) {
      return { success: false, filePaths: [...this.selectedFilePaths] };
    }

    const item = this.selectedFilePaths.splice(index, 1)[0];
    this.selectedFilePaths.unshift(item);
    return { success: true, filePaths: [...this.selectedFilePaths] };
  }

  /**
   * 获取当前选择的文件路径
   * @returns {string[]}
   */
  getFilePaths() {
    return [...this.selectedFilePaths];
  }

  /**
   * 获取已保存的图像
   * @returns {Object[]}
   */
  getSavedImages() {
    return [...this.savedImages];
  }

  /**
   * 清理状态
   */
  clear() {
    this.selectedFilePaths = [];
    this.savedImages = [];
  }
}

/**
 * 直接保存策略
 * 选择文件后立即保存到数据目录
 */
export class DirectSaveStrategy extends UploadStrategy {
  constructor(app) {
    super(app);
    this.savedImages = [];
  }

  /**
   * 选择文件并立即保存
   * @param {string[]} filePaths - 文件路径数组
   * @param {string} source - 来源标识
   * @returns {Promise<Object>} 处理结果
   */
  async selectFiles(filePaths, source = 'upload') {
    if (!filePaths || filePaths.length === 0) {
      return { success: false, message: 'No files selected' };
    }

    const fileInfos = filePaths.map(path => ({
      path,
      name: path.split(/[\\/]/).pop()
    }));

    try {
      const results = await this.imageUploadService.uploadBatch(fileInfos, { source });

      this.savedImages = [...this.savedImages, ...results];

      // 通知成功
      this.notificationService.notifyBatchComplete(results.length);

      return {
        success: true,
        images: results,
        count: results.length
      };
    } catch (error) {
      this.notificationService.notifyError(error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * 移除已保存的图像
   * @param {number} index - 图像索引
   * @returns {Promise<Object>} 处理结果
   */
  async removeFile(index) {
    if (index >= 0 && index < this.savedImages.length) {
      const image = this.savedImages[index];
      try {
        await this.imageUploadService.delete(image.id);
        this.savedImages.splice(index, 1);
        return { success: true, images: [...this.savedImages] };
      } catch (error) {
        return { success: false, message: error.message };
      }
    }
    return { success: false, message: 'Invalid index' };
  }

  /**
   * 设为首张（重排图像顺序）
   * @param {number} index - 图像索引
   * @returns {Object} 处理结果
   */
  setFirst(index) {
    if (index <= 0 || index >= this.savedImages.length) {
      return { success: false, images: [...this.savedImages] };
    }

    const item = this.savedImages.splice(index, 1)[0];
    this.savedImages.unshift(item);
    return { success: true, images: [...this.savedImages] };
  }

  /**
   * 获取已保存的图像
   * @returns {Object[]}
   */
  getSavedImages() {
    return [...this.savedImages];
  }

  /**
   * 获取当前文件路径（直接保存策略返回空数组，因为文件已保存）
   * @returns {string[]}
   */
  getFilePaths() {
    return [];
  }

  /**
   * 清理状态
   */
  clear() {
    this.savedImages = [];
  }
}
