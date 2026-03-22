/**
 * 模态框管理器
 * 负责管理通用模态框的显示/隐藏和交互
 */
export class ModalManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options) {
    this.app = options.app;

    // 模态框状态
    this.activeModals = new Set();

    // 回调函数存储
    this.confirmCallbacks = new Map();
    this.inputCallbacks = new Map();
    this.selectCallbacks = new Map();
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
    // 输入模态框
    document.getElementById('closeInputModal')?.addEventListener('click', () => this.closeInput());
    document.getElementById('inputCancelBtn')?.addEventListener('click', () => this.closeInput());
    document.getElementById('inputOkBtn')?.addEventListener('click', () => this.handleInputOk());

    // 选择模态框
    document.getElementById('closeSelectModal')?.addEventListener('click', () => this.closeSelect());
    document.getElementById('selectCancelBtn')?.addEventListener('click', () => this.closeSelect());
    document.getElementById('selectOkBtn')?.addEventListener('click', () => this.handleSelectOk());

    // 设置模态框
    document.getElementById('closeSettingsModal')?.addEventListener('click', () => this.closeSettings());

    // 回收站模态框
    document.getElementById('closePromptTrashModal')?.addEventListener('click', () => this.closeTrashModal('prompt'));
    document.getElementById('closeImageTrashModal')?.addEventListener('click', () => this.closeTrashModal('image'));

    // 标签管理器模态框
    document.getElementById('closePromptTagManagerModal')?.addEventListener('click', () => this.closePromptTagManager());
    document.getElementById('closeImageTagManagerModal')?.addEventListener('click', () => this.closeImageTagManager());
  }

  /**
   * 显示输入对话框
   * @param {string} title - 标题
   * @param {string} label - 输入标签
   * @param {string} defaultValue - 默认值
   * @param {Object} options - 选项
   * @returns {Promise<string|null>} 输入值，取消返回 null
   */
  showInput(title, label, defaultValue = '', options = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('inputModal');
      const modalTitle = document.getElementById('inputModalTitle');
      const inputLabel = document.getElementById('inputModalLabel');
      const input = document.getElementById('inputModalField');
      const groupSection = document.getElementById('inputModalGroupSection');
      const groupSelect = document.getElementById('inputModalGroupSelect');

      if (!modal || !input) {
        resolve(null);
        return;
      }

      if (modalTitle) modalTitle.textContent = title;
      if (inputLabel) inputLabel.textContent = label;
      input.value = defaultValue;

      // 设置输入类型
      if (options.multiline) {
        input.rows = 4;
      } else {
        input.rows = 1;
      }

      // 处理组选择
      if (options.showGroupSelect && groupSection && groupSelect) {
        groupSection.style.display = 'block';
        // 清空并填充组选项
        groupSelect.innerHTML = '<option value="">未分组</option>';
        if (options.groups) {
          options.groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            groupSelect.appendChild(option);
          });
        }
        // 设置默认选中
        groupSelect.value = options.defaultGroupId || '';
      } else if (groupSection) {
        groupSection.style.display = 'none';
      }

      modal.style.display = 'flex';
      this.activeModals.add('inputModal');

      // 聚焦输入框
      setTimeout(() => input.focus(), 100);

      // 存储回调
      this.inputCallbacks.set('inputModal', resolve);
    });
  }

  /**
   * 关闭输入对话框
   * @param {string|null} value - 输入值
   */
  closeInput(value = null) {
    const modal = document.getElementById('inputModal');
    const groupSection = document.getElementById('inputModalGroupSection');
    const groupSelect = document.getElementById('inputModalGroupSelect');

    if (modal) {
      modal.style.display = 'none';
    }

    const callback = this.inputCallbacks.get('inputModal');
    if (callback) {
      // 如果显示了组选择，返回对象包含 value 和 groupId
      if (groupSection && groupSection.style.display !== 'none' && groupSelect) {
        callback({
          value: value,
          groupId: groupSelect.value ? parseInt(groupSelect.value) : null
        });
      } else {
        callback(value);
      }
      this.inputCallbacks.delete('inputModal');
    }

    this.activeModals.delete('inputModal');
  }

  /**
   * 处理输入确定
   * @private
   */
  handleInputOk() {
    const input = document.getElementById('inputModalField');
    const value = input ? input.value.trim() : '';
    this.closeInput(value);
  }

  /**
   * 显示选择对话框
   * @param {string} title - 标题
   * @param {Array} options - 选项列表 [{value, label}]
   * @param {string} defaultValue - 默认值
   * @returns {Promise<string|null>} 选择的值，取消返回 null
   */
  showSelect(title, options, defaultValue = '') {
    return new Promise((resolve) => {
      const modal = document.getElementById('selectModal');
      const modalTitle = document.getElementById('selectModalTitle');
      const select = document.getElementById('selectModalSelect');

      if (!modal || !select) {
        resolve(null);
        return;
      }

      if (modalTitle) modalTitle.textContent = title;

      // 清空并填充选项
      select.innerHTML = '';
      options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === defaultValue) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      modal.style.display = 'flex';
      this.activeModals.add('selectModal');

      // 存储回调
      this.selectCallbacks.set('selectModal', resolve);
    });
  }

  /**
   * 关闭选择对话框
   * @param {string|null} value - 选择的值
   */
  closeSelect(value = null) {
    const modal = document.getElementById('selectModal');
    if (modal) {
      modal.style.display = 'none';
    }

    const callback = this.selectCallbacks.get('selectModal');
    if (callback) {
      callback(value);
      this.selectCallbacks.delete('selectModal');
    }

    this.activeModals.delete('selectModal');
  }

  /**
   * 处理选择确定
   * @private
   */
  handleSelectOk() {
    const select = document.getElementById('selectModalSelect');
    const value = select ? select.value : null;
    this.closeSelect(value);
  }

  /**
   * 打开设置模态框
   */
  async openSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.add('active');
      this.activeModals.add('settingsModal');
    }
  }

  /**
   * 关闭设置模态框
   */
  closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.remove('active');
    }
    this.activeModals.delete('settingsModal');
  }

  /**
   * 回收站模态框配置
   */
  static TRASH_MODAL_CONFIG = {
    prompt: { modalId: 'promptTrashModal', name: 'promptTrashModal' },
    image: { modalId: 'imageTrashModal', name: 'imageTrashModal' }
  };

  /**
   * 打开回收站模态框
   * @param {string} type - 类型 ('prompt' | 'image')
   */
  openTrashModal(type = 'prompt') {
    const config = ModalManager.TRASH_MODAL_CONFIG[type];
    if (!config) return;

    const modal = document.getElementById(config.modalId);
    if (modal) {
      modal.style.display = 'flex';
      this.activeModals.add(config.name);
    }
  }

  /**
   * 关闭回收站模态框
   * @param {string} type - 类型 ('prompt' | 'image')
   */
  closeTrashModal(type = 'prompt') {
    const config = ModalManager.TRASH_MODAL_CONFIG[type];
    if (!config) return;

    const modal = document.getElementById(config.modalId);
    if (modal) {
      modal.style.display = 'none';
    }
    this.activeModals.delete(config.name);
  }

  /**
   * 打开提示词标签管理器模态框
   */
  openPromptTagManager() {
    const modal = document.getElementById('promptTagManagerModal');
    if (modal) {
      modal.classList.add('active');
      this.activeModals.add('promptTagManagerModal');
    }
  }

  /**
   * 关闭提示词标签管理器模态框
   */
  closePromptTagManager() {
    const modal = document.getElementById('promptTagManagerModal');
    if (modal) {
      modal.classList.remove('active');
    }
    this.activeModals.delete('promptTagManagerModal');
  }

  /**
   * 打开图像标签管理器模态框
   */
  openImageTagManager() {
    const modal = document.getElementById('imageTagManagerModal');
    if (modal) {
      modal.classList.add('active');
      this.activeModals.add('imageTagManagerModal');
    }
  }

  /**
   * 关闭图像标签管理器模态框
   */
  closeImageTagManager() {
    const modal = document.getElementById('imageTagManagerModal');
    if (modal) {
      modal.classList.remove('active');
    }
    this.activeModals.delete('imageTagManagerModal');
  }

  /**
   * 关闭所有模态框
   */
  closeAll() {
    this.activeModals.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
      }
    });

    this.activeModals.clear();
    this.confirmCallbacks.clear();
    this.inputCallbacks.clear();
    this.selectCallbacks.clear();
  }

  /**
   * 检查是否有模态框处于活动状态
   * @returns {boolean}
   */
  hasActiveModal() {
    return this.activeModals.size > 0;
  }
}
