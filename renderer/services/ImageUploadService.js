/**
 * 图像上传服务
 * 负责处理图像上传的核心逻辑
 * 遵循单一职责原则：只处理上传，不处理 UI 或通知
 */
export class ImageUploadService {
  /**
   * @param {Object} app - 应用实例
   */
  constructor(app) {
    this.app = app;
  }

  /**
   * 上传图像到数据目录
   * @param {Object} fileInfo - 文件信息
   * @param {string} fileInfo.path - 文件路径
   * @param {string} fileInfo.name - 文件名
   * @param {Object} options - 选项
   * @param {string} options.source - 来源标识
   * @returns {Promise<Object>} 上传结果
   */
  async upload(fileInfo, options = {}) {
    const { path: filePath, name: fileName } = fileInfo;
    const { source = 'unknown' } = options;

    if (!filePath) {
      throw new Error('File path is required');
    }

    const imageInfo = await window.electronAPI.saveImageFile(filePath, fileName);
    const fullImageInfo = await window.electronAPI.getImageById(imageInfo.id);

    return {
      ...fullImageInfo,
      isDuplicate: imageInfo.isDuplicate,
      duplicateMessage: imageInfo.duplicateMessage,
      source
    };
  }

  /**
   * 批量上传图像
   * @param {Object[]} fileInfos - 文件信息数组
   * @param {Object} options - 选项
   * @param {Function} options.onProgress - 进度回调 (current, total) => void
   * @returns {Promise<Object[]>} 上传结果数组
   */
  async uploadBatch(fileInfos, options = {}) {
    const { onProgress } = options;
    const results = [];
    const total = fileInfos.length;

    // 小批量不触发进度回调，减少不必要的 UI 更新
    const shouldReportProgress = onProgress && total > 3;

    for (let i = 0; i < total; i++) {
      const result = await this.upload(fileInfos[i], options);
      results.push(result);

      if (shouldReportProgress) {
        onProgress(i + 1, total);
      }
    }

    return results;
  }

  /**
   * 删除图像
   * @param {string} imageId - 图像 ID
   * @returns {Promise<boolean>}
   */
  async delete(imageId) {
    return await window.electronAPI.permanentDeleteImage(imageId);
  }
}
