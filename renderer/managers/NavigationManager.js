/**
 * 导航管理器
 * 负责处理面板切换和导航逻辑
 */
export class NavigationManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   * @param {string} options.storageKey - localStorage键名, 默认'currentPanel'
   * @param {string} options.defaultPanel - 默认面板, 默认'prompt'
   */
  constructor(options = {}) {
    this.app = options.app;
    this.storageKey = options.storageKey || 'currentPanel';
    this.defaultPanel = options.defaultPanel || 'prompt';

    this.currentPanel = this.defaultPanel;
    this.panels = new Map();
    this.onPanelChange = null;

    this._unsubscribeImagesChanged = null;
    this._unsubscribePromptsChanged = null;
  }

  /**
   * 初始化
   */
  init() {
    this.registerPanels();
    this.bindEvents();
    this.restorePanelState();
    this._subscribeImageChanges();
    this._subscribePromptChanges();
  }

  _subscribeImageChanges() {
    this._unsubscribeImagesChanged = this.app.eventBus?.on('imagesChanged', async () => {
      await this.app.imagePanelManager.loadData();
      if (this.currentPanel === 'image' && this.app.imagePanelManager) {
        await this.app.imagePanelManager.renderView();
        await this.app.imagePanelManager.renderTagFilters();
      }
    });
  }

  _subscribePromptChanges() {
    this._unsubscribePromptsChanged = this.app.eventBus?.on('promptsChanged', async () => {
      await this.app.promptPanelManager.loadData();
      if (this.currentPanel === 'prompt' && this.app.promptPanelManager) {
        await this.app.promptPanelManager.renderView();
        await this.app.promptPanelManager.renderTagFilters();
      }
    });
  }

  /**
   * 注册面板
   * @private
   */
  registerPanels() {
    this.panels.set('prompt', {
      id: 'promptPanel',
      buttonId: 'promptManagerBtn',
      name: 'prompt',
      onShow: async () => {
        if (this.app.promptPanelManager) {
          this.app.updatePromptViewButtons(this.app.promptPanelManager.viewModeType);
          await this.app.promptPanelManager.renderView();
        }
      }
    });

    this.panels.set('image', {
      id: 'imagePanel',
      buttonId: 'imageManagerBtn',
      name: 'image',
      onShow: async () => {
        if (this.app.imagePanelManager) {
          this.app.updateImageViewButtons(this.app.imagePanelManager.viewModeType);
          await this.app.imagePanelManager.renderView();
        }
      }
    });

    this.panels.set('statistics', {
      id: 'statisticsSection',
      buttonId: 'statisticsBtn',
      name: 'statistics',
      onShow: () => {
        if (this.app.renderStatistics) {
          this.app.renderStatistics();
        }
      }
    });
  }

  /**
   * 绑定事件
   * @private
   */
  bindEvents() {
    // 导航按钮事件
    document.getElementById('promptManagerBtn')?.addEventListener('click', () => this.switchTo('prompt'));
    document.getElementById('imageManagerBtn')?.addEventListener('click', () => this.switchTo('image'));
    document.getElementById('statisticsBtn')?.addEventListener('click', () => this.switchTo('statistics'));
  }

  /**
   * 切换到指定面板
   * @param {string} panelName - 面板名称 (prompt/image/statistics)
   */
  switchTo(panelName) {
    if (!this.panels.has(panelName)) {
      console.warn(`Unknown panel: ${panelName}`);
      return;
    }

    // 隐藏所有面板
    this.panels.forEach((panel) => {
      const element = document.getElementById(panel.id);
      const button = document.getElementById(panel.buttonId);

      if (element) {
        element.style.display = 'none';
      }
      if (button) {
        button.classList.remove('active');
      }
    });

    // 显示目标面板
    const targetPanel = this.panels.get(panelName);
    const targetElement = document.getElementById(targetPanel.id);
    const targetButton = document.getElementById(targetPanel.buttonId);

    if (targetElement) {
      targetElement.style.display = 'flex';
    }
    if (targetButton) {
      targetButton.classList.add('active');
    }

    // 执行面板显示回调
    if (targetPanel.onShow) {
      targetPanel.onShow();
    }

    // 更新当前面板
    this.currentPanel = panelName;

    // 保存状态
    this.savePanelState();

    // 触发回调
    if (this.onPanelChange) {
      this.onPanelChange(panelName, targetPanel);
    }
  }

  /**
   * 切换到提示词管理器
   */
  switchToPromptManager() {
    this.switchTo('prompt');
  }

  /**
   * 切换到图像管理器
   */
  switchToImageManager() {
    this.switchTo('image');
  }

  /**
   * 切换到统计页面
   */
  switchToStatistics() {
    this.switchTo('statistics');
  }

  /**
   * 获取当前面板
   * @returns {string}
   */
  getCurrentPanel() {
    return this.currentPanel;
  }

  /**
   * 检查是否是指定面板
   * @param {string} panelName - 面板名称
   * @returns {boolean}
   */
  isPanel(panelName) {
    return this.currentPanel === panelName;
  }

  /**
   * 恢复面板状态
   */
  restorePanelState() {
    const savedPanel = localStorage.getItem(this.storageKey) || this.defaultPanel;
    this.switchTo(savedPanel);
  }

  /**
   * 重置为默认面板
   */
  reset() {
    this.switchTo(this.defaultPanel);
  }

  /**
   * 注册自定义面板
   * @param {string} name - 面板名称
   * @param {Object} config - 面板配置
   * @param {string} config.id - DOM元素ID
   * @param {string} config.buttonId - 按钮元素ID
   * @param {Function} config.onShow - 显示时的回调
   */
  registerPanel(name, config) {
    this.panels.set(name, {
      ...config,
      name
    });
  }

  /**
   * 注销面板
   * @param {string} name - 面板名称
   */
  unregisterPanel(name) {
    this.panels.delete(name);
  }

  /**
   * 设置面板切换回调
   * @param {Function} callback - 回调函数(panelName, panelConfig)
   */
  setOnPanelChange(callback) {
    this.onPanelChange = callback;
  }

  /**
   * 保存面板状态
   */
  savePanelState() {
    localStorage.setItem(this.storageKey, this.currentPanel);
  }

  /**
   * 销毁
   */
  destroy() {
    if (this._unsubscribeImagesChanged) {
      this._unsubscribeImagesChanged();
    }
    if (this._unsubscribePromptsChanged) {
      this._unsubscribePromptsChanged();
    }
  }
}
