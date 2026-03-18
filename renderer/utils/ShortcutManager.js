/**
 * 快捷键管理器
 * 提供全局快捷键支持，包括编辑导航、保存等操作
 */
export class ShortcutManager {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 主应用引用
   */
  constructor(options) {
    this.app = options.app;
    this.shortcuts = new Map();
    this.enabled = true;
    this.initDefaultShortcuts();
  }

  /**
   * 初始化默认快捷键
   */
  initDefaultShortcuts() {
    // 编辑导航
    this.register('Ctrl+ArrowLeft', 'editorPrev', '上一个项目');
    this.register('Ctrl+ArrowRight', 'editorNext', '下一个项目');
    this.register('Ctrl+ArrowUp', 'editorFirst', '第一个项目');
    this.register('Ctrl+ArrowDown', 'editorLast', '最后一个项目');

    // 保存操作
    this.register('Ctrl+S', 'save', '保存');
    this.register('Ctrl+Shift+S', 'saveAndClose', '保存并关闭');

    // 搜索
    this.register('Ctrl+F', 'focusSearch', '聚焦搜索框');
    this.register('Escape', 'clearSearch', '清除搜索');

    // 视图切换
    this.register('Ctrl+1', 'viewGrid', '网格视图');
    this.register('Ctrl+2', 'viewList', '列表视图');
    this.register('Ctrl+3', 'viewCompact', '紧凑视图');

    // 标签管理
    this.register('Ctrl+T', 'toggleTags', '切换标签面板');
    this.register('Ctrl+Shift+T', 'createTagGroup', '创建标签组');

    // 回收站
    this.register('Ctrl+Shift+Delete', 'openTrash', '打开回收站');

    // 刷新
    this.register('F5', 'refresh', '刷新数据');
  }

  /**
   * 注册快捷键
   * @param {string} keyCombo - 快捷键组合（如 'Ctrl+S'）
   * @param {string} action - 动作名称
   * @param {string} description - 描述
   */
  register(keyCombo, action, description = '') {
    this.shortcuts.set(keyCombo.toLowerCase(), { action, description });
  }

  /**
   * 注销快捷键
   * @param {string} keyCombo - 快捷键组合
   */
  unregister(keyCombo) {
    this.shortcuts.delete(keyCombo.toLowerCase());
  }

  /**
   * 启用快捷键
   */
  enable() {
    this.enabled = true;
  }

  /**
   * 禁用快捷键
   */
  disable() {
    this.enabled = false;
  }

  /**
   * 绑定全局键盘事件
   */
  bind() {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;

      const keyCombo = this.getKeyCombo(e);
      const shortcut = this.shortcuts.get(keyCombo.toLowerCase());

      if (shortcut) {
        e.preventDefault();
        this.handleAction(shortcut.action);
      }
    });
  }

  /**
   * 获取快捷键组合
   * @param {KeyboardEvent} e - 键盘事件
   * @returns {string} 快捷键组合
   */
  getKeyCombo(e) {
    const parts = [];

    if (e.ctrlKey) parts.push('Ctrl');
    if (e.metaKey) parts.push('Ctrl'); // Mac 上 Command 键
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    parts.push(e.key);

    return parts.join('+');
  }

  /**
   * 处理快捷键动作
   * @param {string} action - 动作名称
   */
  handleAction(action) {
    try {
      switch (action) {
        // 编辑导航
        case 'editorPrev':
          this.navigateEditor('prev');
          break;
        case 'editorNext':
          this.navigateEditor('next');
          break;
        case 'editorFirst':
          this.navigateEditor('first');
          break;
        case 'editorLast':
          this.navigateEditor('last');
          break;

        // 保存操作
        case 'save':
          this.saveCurrent();
          break;
        case 'saveAndClose':
          this.saveAndClose();
          break;

        // 搜索
        case 'focusSearch':
          this.focusSearch();
          break;
        case 'clearSearch':
          this.clearSearch();
          break;

        // 视图切换
        case 'viewGrid':
          this.setViewMode('grid');
          break;
        case 'viewList':
          this.setViewMode('list');
          break;
        case 'viewCompact':
          this.setViewMode('compact');
          break;

        // 标签管理
        case 'toggleTags':
          this.toggleTagsPanel();
          break;
        case 'createTagGroup':
          this.createTagGroup();
          break;

        // 回收站
        case 'openTrash':
          this.openTrash();
          break;

        // 刷新
        case 'refresh':
          this.refreshData();
          break;

        default:
          console.warn(`Unknown action: ${action}`);
      }
    } catch (error) {
      console.error(`Shortcut action failed: ${action}`, error);
    }
  }

  /**
   * 导航编辑器
   * @param {string} direction - 方向
   */
  navigateEditor(direction) {
    // 检查是否有模态框打开
    const editModal = document.querySelector('#editModal.active');
    const imageEditModal = document.querySelector('#imageEditModal.active');

    if (editModal) {
      // 提示词编辑
      if (this.app.promptNavigator) {
        this.app.promptNavigator.navigateTo(direction);
      }
    } else if (imageEditModal) {
      // 图像编辑
      if (this.app.imageNavigator) {
        this.app.imageNavigator.navigateTo(direction);
      }
    }
  }

  /**
   * 保存当前内容
   */
  async saveCurrent() {
    const editModal = document.querySelector('#editModal.active');
    const imageEditModal = document.querySelector('#imageEditModal.active');

    if (editModal) {
      await this.app.savePromptWithoutClosing();
    } else if (imageEditModal) {
      await this.app.saveImageWithoutClosing();
    }
  }

  /**
   * 保存并关闭
   */
  async saveAndClose() {
    const editModal = document.querySelector('#editModal.active');
    const imageEditModal = document.querySelector('#imageEditModal.active');

    if (editModal) {
      await this.app.saveAndClosePromptEdit();
    } else if (imageEditModal) {
      await this.app.saveAndCloseImageEdit();
    }
  }

  /**
   * 聚焦搜索框
   */
  focusSearch() {
    const activePanel = document.querySelector('.panel.active');
    if (activePanel) {
      const searchInput = activePanel.querySelector('input[type="search"]');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
  }

  /**
   * 清除搜索
   */
  clearSearch() {
    const activePanel = document.querySelector('.panel.active');
    if (activePanel) {
      const searchInput = activePanel.querySelector('input[type="search"]');
      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
      }
    }
  }

  /**
   * 设置视图模式
   * @param {string} mode - 视图模式
   */
  setViewMode(mode) {
    if (this.app.promptPanelManager) {
      this.app.promptPanelManager.viewModeType = mode;
      this.app.promptPanelManager.renderList();
    }
  }

  /**
   * 切换标签面板
   */
  toggleTagsPanel() {
    const tagsPanel = document.getElementById('tagsPanel');
    if (tagsPanel) {
      const isVisible = tagsPanel.style.display !== 'none';
      tagsPanel.style.display = isVisible ? 'none' : 'block';
    }
  }

  /**
   * 创建标签组
   */
  createTagGroup() {
    if (this.app.tagManager) {
      this.app.tagManager.showCreateTagGroupModal();
    }
  }

  /**
   * 打开回收站
   */
  openTrash() {
    const trashPanel = document.getElementById('trashPanel');
    if (trashPanel) {
      trashPanel.classList.add('active');
      if (this.app.trashManager) {
        this.app.trashManager.loadTrash();
      }
    }
  }

  /**
   * 刷新数据
   */
  async refreshData() {
    if (this.app) {
      await this.app.refreshData();
    }
  }

  /**
   * 获取所有快捷键
   * @returns {Array} 快捷键列表
   */
  getShortcuts() {
    return Array.from(this.shortcuts.entries()).map(([key, value]) => ({
      keyCombo: key,
      ...value
    }));
  }

  /**
   * 显示快捷键帮助
   */
  showHelp() {
    const shortcuts = this.getShortcuts();
    const helpContent = shortcuts.map(s => 
      `<div class="shortcut-item">
        <kbd>${s.keyCombo}</kbd>
        <span>${s.description}</span>
      </div>`
    ).join('');

    console.log('快捷键列表:');
    shortcuts.forEach(s => {
      console.log(`${s.keyCombo}: ${s.description}`);
    });

    return helpContent;
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.shortcuts.clear();
    this.enabled = false;
  }
}

export default ShortcutManager;
