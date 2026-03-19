/**
 * 回收站管理器
 * 负责统一管理提示词和图像的回收站功能
 */
export class RecycleBinManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;
    this.currentType = 'prompt'; // 'prompt' | 'image'
  }

  /**
   * 打开回收站
   * @param {string} type - 类型 ('prompt' | 'image')
   */
  async open(type = 'prompt') {
    this.currentType = type;

    // 加载回收站数据
    if (this.app.trashManager) {
      await this.app.trashManager.loadTrash();
    }

    // 打开对应模态框
    if (type === 'prompt') {
      this.app.modalManager?.openRecycleBin();
    } else {
      this.app.modalManager?.openImageRecycleBin();
    }
  }

  /**
   * 关闭回收站
   */
  close() {
    if (this.currentType === 'prompt') {
      this.app.modalManager?.closeRecycleBin();
    } else {
      this.app.modalManager?.closeImageRecycleBin();
    }
  }

  /**
   * 清空回收站
   */
  async empty() {
    const typeLabel = this.currentType === 'prompt' ? 'prompt' : 'image';
    const confirmed = await this.app.showConfirmDialog(
      'Confirm Empty Recycle Bin',
      `Are you sure you want to empty the ${typeLabel} recycle bin? All items will be permanently deleted. This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await window.electronAPI.emptyRecycleBin();
      this.app.showToast('Recycle bin emptied');

      // 刷新回收站显示
      if (this.app.trashManager) {
        await this.app.trashManager.loadTrash();
      }
    } catch (error) {
      console.error('Failed to empty recycle bin:', error);
      this.app.showToast('Failed to empty recycle bin', 'error');
    }
  }

  /**
   * 刷新回收站显示
   */
  async refresh() {
    if (this.app.trashManager) {
      await this.app.trashManager.loadTrash();
    }
  }
}
