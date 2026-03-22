/**
 * 上传通知服务
 * 负责处理上传相关的用户通知和事件触发
 */
export class UploadNotificationService {
  /**
   * @param {Object} app - 应用实例
   */
  constructor(app) {
    this.app = app;
  }

  /**
   * 通知上传成功
   * @param {Object} result - 上传结果
   * @param {Object} options - 选项
   * @param {boolean} options.showToast - 是否显示 Toast
   * @param {boolean} options.refresh - 是否触发刷新事件
   * @returns {Object} 上传结果
   */
  notifySuccess(result, options = {}) {
    const { showToast = true, refresh = false } = options;

    if (showToast) {
      if (result.isDuplicate && result.duplicateMessage) {
        this.app.showToast?.(result.duplicateMessage, 'info');
      } else {
        this.app.showToast?.('图像上传成功', 'success');
      }
    }

    if (refresh) {
      this.app.eventBus?.emit('imagesChanged');
    }

    return result;
  }

  /**
   * 通知批量上传进度
   * @param {number} current - 当前进度
   * @param {number} total - 总数
   * @param {string} message - 自定义消息
   */
  notifyProgress(current, total, message = '正在保存图像') {
    this.app.showToast?.(`${message}... (${current}/${total})`, 'info', 0);
  }

  /**
   * 通知批量上传完成
   * @param {number} count - 成功数量
   */
  notifyBatchComplete(count) {
    this.app.showToast?.(`成功保存 ${count} 张图像`, 'success');
  }

  /**
   * 通知上传失败
   * @param {string} message - 错误信息
   */
  notifyError(message) {
    this.app.showToast?.(message, 'error');
  }

  /**
   * 通知操作取消
   * @param {string} message - 取消消息
   */
  notifyCancel(message = '已取消') {
    this.app.showToast?.(message, 'info');
  }
}
