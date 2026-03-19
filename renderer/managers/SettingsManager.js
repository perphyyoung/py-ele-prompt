import { Constants } from '../constants.js';

/**
 * 设置管理器
 * 负责处理应用设置相关操作
 */
export class SettingsManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options = {}) {
    this.app = options.app;

    // 设置状态
    this.currentTheme = 'light';
    this.viewMode = 'all';
  }

  /**
   * 初始化
   */
  init() {
    this.loadSettings();
    this.bindEvents();
  }

  /**
   * 加载设置
   * @private
   */
  loadSettings() {
    // 加载主题设置
    const savedTheme = localStorage.getItem(Constants.LocalStorageKey.THEME);
    if (savedTheme) {
      this.setTheme(savedTheme, false);
    }

    // 加载视图模式
    const savedViewMode = localStorage.getItem(Constants.LocalStorageKey.VIEW_MODE);
    if (savedViewMode) {
      this.viewMode = savedViewMode;
      if (this.app.promptPanelManager) {
        this.app.promptPanelManager.viewMode = savedViewMode;
      }
      if (this.app.imagePanelManager) {
        this.app.imagePanelManager.viewMode = savedViewMode;
      }
    }
  }

  /**
   * 绑定事件
   * @private
   */
  bindEvents() {
    // 数据路径更改
    document.getElementById('changeDataPathBtn')?.addEventListener('click', () => this.changeDataPath());

    // 清空数据
    document.getElementById('clearAllDataBtn')?.addEventListener('click', () => this.clearAllData());

    // 视图模式
    const viewModeSelect = document.getElementById('viewModeSelect');
    if (viewModeSelect) {
      viewModeSelect.value = this.viewMode;
      viewModeSelect.addEventListener('change', () => this.handleViewModeChange(viewModeSelect.value));
    }

    // 主题切换
    document.getElementById('settingsThemeToggle')?.addEventListener('click', () => this.toggleTheme());
  }

  /**
   * 更改数据存储目录
   */
  async changeDataPath() {
    try {
      const newPath = await window.electronAPI.selectDataPath();
      if (newPath) {
        const currentDataPathEl = document.getElementById('currentDataPath');
        if (currentDataPathEl) {
          currentDataPathEl.textContent = newPath;
        }
        this.app.showToast?.('数据目录已更改，重启应用后生效', 'success');
      }
    } catch (error) {
      console.error('Failed to change data path:', error);
      this.app.showToast?.('更改失败：' + error.message, 'error');
    }
  }

  /**
   * 清空所有数据
   */
  async clearAllData() {
    try {
      const confirmed = await this.app.showConfirmDialog?.(
        '⚠️ 危险操作',
        '确定要清空所有数据吗？\n\n此操作将永久删除\n<图像文件>\n以外的所有数据，不可恢复！'
      );

      if (!confirmed) return;

      await window.electronAPI.clearAllData();
      this.app.showToast?.('所有数据已清空', 'success');

      // 重新加载数据
      if (this.app.promptPanelManager) {
        await this.app.promptPanelManager.loadItems();
        await this.app.promptPanelManager.render();
      }
      if (this.app.imagePanelManager) {
        await this.app.imagePanelManager.loadItems();
        await this.app.imagePanelManager.render();
      }
    } catch (error) {
      console.error('Failed to clear all data:', error);
      this.app.showToast?.('清空失败：' + error.message, 'error');
    }
  }

  /**
   * 处理视图模式变更
   * @param {string} mode - 视图模式 (safe/all)
   * @private
   */
  async handleViewModeChange(mode) {
    this.viewMode = mode;
    localStorage.setItem(Constants.LocalStorageKey.VIEW_MODE, mode);

    this.app.showToast?.(mode === 'safe' ? '已切换到安全模式' : '已切换到 NSFW 模式', 'info');

    // 更新面板管理器
    if (this.app.promptPanelManager) {
      this.app.promptPanelManager.viewMode = mode;
      await this.app.promptPanelManager.render();
      await this.app.promptPanelManager.renderTagFilters();
    }
    if (this.app.imagePanelManager) {
      this.app.imagePanelManager.viewMode = mode;
      await this.app.imagePanelManager.render();
      await this.app.imagePanelManager.renderTagFilters();
    }

    // 更新统计
    if (this.app.renderStatistics) {
      await this.app.renderStatistics();
    }
  }

  /**
   * 切换主题
   * @param {string} theme - 主题名称 (light/dark), 不传则切换当前主题
   * @param {boolean} showToast - 是否显示提示
   */
  toggleTheme(theme = null, showToast = true) {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = theme || (currentTheme === 'light' ? 'dark' : 'light');

    this.setTheme(newTheme, showToast);
  }

  /**
   * 设置主题
   * @param {string} theme - 主题名称 (light/dark)
   * @param {boolean} showToast - 是否显示提示
   */
  setTheme(theme, showToast = true) {
    const html = document.documentElement;

    html.setAttribute('data-theme', theme);
    localStorage.setItem(Constants.LocalStorageKey.THEME, theme);
    this.currentTheme = theme;

    // 更新主题切换按钮文本
    const themeToggle = document.getElementById('settingsThemeToggle');
    if (themeToggle) {
      themeToggle.innerHTML = theme === 'dark'
        ? '<span>☀️</span> 明亮'
        : '<span>🌙</span> 暗黑';
    }

    if (showToast) {
      this.app.showToast?.(theme === 'dark' ? '已切换到黑暗模式' : '已切换到明亮模式', 'success');
    }
  }

  /**
   * 获取当前主题
   * @returns {string}
   */
  getTheme() {
    return this.currentTheme;
  }

  /**
   * 获取视图模式
   * @returns {string}
   */
  getViewMode() {
    return this.viewMode;
  }

  /**
   * 设置视图模式
   * @param {string} mode - 视图模式 (safe/all)
   */
  async setViewMode(mode) {
    await this.handleViewModeChange(mode);

    // 更新选择框
    const viewModeSelect = document.getElementById('viewModeSelect');
    if (viewModeSelect) {
      viewModeSelect.value = mode;
    }
  }

  /**
   * 重置所有设置
   */
  async resetSettings() {
    // 重置主题
    this.setTheme('light');

    // 重置视图模式
    await this.setViewMode('all');

    this.app.showToast?.('设置已重置', 'success');
  }
}
