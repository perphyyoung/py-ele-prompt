/**
 * 工具栏管理器
 * 负责处理工具栏按钮事件和操作
 */
import { DialogService, DialogConfig } from '../services/DialogService.js';

export class ToolbarManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;
  }

  /**
   * 初始化
   */
  init() {
    this.bindEvents();
  }

  /**
   * 绑定事件
   * @private
   */
  bindEvents() {
    this.bindRefreshEvents();
    this.bindPromptToolbarEvents();
    this.bindImageToolbarEvents();
    this.bindTagFilterEvents();
    this.bindTagManagerEvents();
    this.bindModalEvents();
  }

  /**
   * 绑定刷新事件
   * @private
   */
  bindRefreshEvents() {
    document.getElementById('reloadBtn')?.addEventListener('click', () => this.refreshData());
    document.getElementById('refreshBtn')?.addEventListener('click', () => this.relaunchApp());
  }

  /**
   * 绑定提示词工具栏事件
   * @private
   */
  bindPromptToolbarEvents() {
    document.getElementById('promptAddBtn')?.addEventListener('click', () => this.app.openNewPromptPage?.());
  }

  /**
   * 绑定图像工具栏事件
   * @private
   */
  bindImageToolbarEvents() {
    document.getElementById('imageAddBtn')?.addEventListener('click', () => this.app.openUploadImageModal?.());
  }

  /**
   * 绑定标签筛选事件
   * @private
   */
  bindTagFilterEvents() {
    document.getElementById('clearPromptTagFilter')?.addEventListener('click', () => this.app.promptPanelManager?.clearTagFilter());
    document.getElementById('clearImageTagFilter')?.addEventListener('click', () => this.app.imagePanelManager?.clearTagFilter());
  }

  /**
   * 绑定标签管理器事件
   * @private
   */
  bindTagManagerEvents() {
    document.getElementById('promptTagManagerBtn')?.addEventListener('click', () => this.app.openPromptTagManagerModal?.());
    document.getElementById('imageTagManagerBtn')?.addEventListener('click', () => this.app.openImageTagManagerModal?.());
  }

  /**
   * 绑定模态框事件
   * @private
   */
  bindModalEvents() {
    // 统计按钮
    document.getElementById('statisticsBtn')?.addEventListener('click', () => {
      this.app.openStatisticsModal?.();
    });
  }

  /**
   * 刷新数据
   */
  async refreshData() {
    try {
      if (this.app.promptPanelManager) {
        await this.app.promptPanelManager.loadData();
        await this.app.promptPanelManager.renderView();
      }
      if (this.app.imagePanelManager) {
        await this.app.imagePanelManager.loadData();
        await this.app.imagePanelManager.renderView();
      }

      this.app.showToast?.('数据已刷新', 'success');
    } catch (error) {
      window.electronAPI.logError('ToolbarManager', 'Failed to refresh data', { error: error.message });
      this.app.showToast?.('刷新失败', 'error');
    }
  }

  /**
   * 重启应用
   */
  async relaunchApp() {
    const confirmed = await DialogService.showConfirmDialogByConfig?.(DialogConfig.RELAUNCH_APP);
    if (!confirmed) return;

    try {
      this.app.showToast?.('正在重启应用...', 'info');
      await window.electronAPI.relaunchApp();
    } catch (error) {
      window.electronAPI.logError('ToolbarManager.js', 'Failed to relaunch app:', error);
      this.app.showToast?.('重启失败', 'error');
    }
  }
}
