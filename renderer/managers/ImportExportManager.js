/**
 * 导入导出管理器
 * 负责处理数据导入导出功能
 */
export class ImportExportManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;

    // 导出状态
    this.isExporting = false;
    this.isImporting = false;
  }

  /**
   * 初始化
   */
  init() {
    // 初始化时无需特殊操作
  }

  /**
   * 导入提示词
   * @returns {Promise<boolean>} 是否成功
   */
  async importPrompts() {
    if (this.isImporting) {
      this.app.showToast?.('导入正在进行中，请稍候', 'warning');
      return false;
    }

    this.isImporting = true;

    try {
      const result = await window.electronAPI.importPrompts();

      if (result && result.success) {
        // 刷新提示词列表
        if (this.app.promptPanelManager) {
          await this.app.promptPanelManager.loadData();
          await this.app.promptPanelManager.renderView();
        }

        this.app.showToast?.(`成功导入 ${result.count || 0} 个提示词`, 'success');
        return true;
      } else if (result && result.cancelled) {
        // 用户取消，不显示错误
        return false;
      } else {
        throw new Error(result?.message || '导入失败');
      }
    } catch (error) {
      console.error('Failed to import prompts:', error);
      this.app.showToast?.('导入失败：' + error.message, 'error');
      return false;
    } finally {
      this.isImporting = false;
    }
  }

  /**
   * 导出提示词
   * @returns {Promise<boolean>} 是否成功
   */
  async exportPrompts() {
    if (this.isExporting) {
      this.app.showToast?.('导出正在进行中，请稍候', 'warning');
      return false;
    }

    this.isExporting = true;

    try {
      const prompts = this.app.promptPanelManager?.prompts || [];

      if (prompts.length === 0) {
        this.app.showToast?.('没有可导出的提示词', 'warning');
        return false;
      }

      const result = await window.electronAPI.exportPrompts(prompts);

      if (result && result.success) {
        this.app.showToast?.(`成功导出 ${result.count || prompts.length} 个提示词`, 'success');
        return true;
      } else if (result && result.cancelled) {
        // 用户取消，不显示错误
        return false;
      } else {
        throw new Error(result?.message || '导出失败');
      }
    } catch (error) {
      console.error('Failed to export prompts:', error);
      this.app.showToast?.('导出失败：' + error.message, 'error');
      return false;
    } finally {
      this.isExporting = false;
    }
  }

  /**
   * 导出图像
   * @returns {Promise<boolean>} 是否成功
   */
  async exportImages() {
    if (this.isExporting) {
      this.app.showToast?.('导出正在进行中，请稍候', 'warning');
      return false;
    }

    this.isExporting = true;

    try {
      const images = this.app.imagePanelManager?.images || [];

      if (images.length === 0) {
        this.app.showToast?.('没有可导出的图像', 'warning');
        return false;
      }

      const result = await window.electronAPI.exportImages(images);

      if (result && result.success) {
        this.app.showToast?.(`成功导出 ${result.count || images.length} 个图像`, 'success');
        return true;
      } else if (result && result.cancelled) {
        return false;
      } else {
        throw new Error(result?.message || '导出失败');
      }
    } catch (error) {
      console.error('Failed to export images:', error);
      this.app.showToast?.('导出失败：' + error.message, 'error');
      return false;
    } finally {
      this.isExporting = false;
    }
  }

  /**
   * 导出孤儿文件
   * @returns {Promise<boolean>} 是否成功
   */
  async exportOrphanFiles() {
    if (this.isExporting) {
      this.app.showToast?.('导出正在进行中，请稍候', 'warning');
      return false;
    }

    this.isExporting = true;

    try {
      // 先选择导出目录
      const exportDir = await window.electronAPI.selectDirectory();
      if (!exportDir) {
        return false; // 用户取消选择
      }

      this.app.showToast?.('正在扫描孤儿文件...', 'info');

      // 扫描孤儿文件
      const scanResult = await window.electronAPI.scanOrphanFiles();

      if (scanResult.totalCount === 0) {
        this.app.showToast?.('没有发现孤儿文件', 'info');
        return false;
      }

      this.app.showToast?.(`发现 ${scanResult.totalCount} 个孤儿文件，正在导出...`, 'info');

      // 导出孤儿文件
      const result = await window.electronAPI.exportOrphanFiles(exportDir);

      if (result && result.successCount > 0) {
        this.app.showToast?.(`成功导出 ${result.successCount} 个孤儿文件`, 'success');
        return true;
      } else if (result && result.failedCount > 0) {
        throw new Error(`${result.failedCount} 个文件导出失败`);
      } else {
        throw new Error('导出失败');
      }
    } catch (error) {
      console.error('Failed to export orphan files:', error);
      this.app.showToast?.('导出失败：' + error.message, 'error');
      return false;
    } finally {
      this.isExporting = false;
    }
  }

  /**
   * 备份所有数据
   * @returns {Promise<boolean>} 是否成功
   */
  async backupAllData() {
    if (this.isExporting) {
      this.app.showToast?.('备份正在进行中，请稍候', 'warning');
      return false;
    }

    this.isExporting = true;

    try {
      const result = await window.electronAPI.backupAllData();

      if (result && result.success) {
        this.app.showToast?.('数据备份成功', 'success');
        return true;
      } else if (result && result.cancelled) {
        return false;
      } else {
        throw new Error(result?.message || '备份失败');
      }
    } catch (error) {
      console.error('Failed to backup data:', error);
      this.app.showToast?.('备份失败：' + error.message, 'error');
      return false;
    } finally {
      this.isExporting = false;
    }
  }

  /**
   * 从备份恢复数据
   * @returns {Promise<boolean>} 是否成功
   */
  async restoreFromBackup() {
    if (this.isImporting) {
      this.app.showToast?.('恢复正在进行中，请稍候', 'warning');
      return false;
    }

    this.isImporting = true;

    try {
      const result = await window.electronAPI.restoreFromBackup();

      if (result && result.success) {
        // 刷新所有数据
        if (this.app.promptPanelManager) {
          await this.app.promptPanelManager.loadData();
          await this.app.promptPanelManager.renderView();
        }
        if (this.app.imagePanelManager) {
          await this.app.imagePanelManager.loadData();
          await this.app.imagePanelManager.renderView();
        }

        this.app.showToast?.('数据恢复成功', 'success');
        return true;
      } else if (result && result.cancelled) {
        return false;
      } else {
        throw new Error(result?.message || '恢复失败');
      }
    } catch (error) {
      console.error('Failed to restore data:', error);
      this.app.showToast?.('恢复失败：' + error.message, 'error');
      return false;
    } finally {
      this.isImporting = false;
    }
  }

  /**
   * 获取导出状态
   * @returns {boolean}
   */
  getIsExporting() {
    return this.isExporting;
  }

  /**
   * 获取导入状态
   * @returns {boolean}
   */
  getIsImporting() {
    return this.isImporting;
  }
}
