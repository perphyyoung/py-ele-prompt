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
    // 确认模态框
    document.getElementById('closeConfirmModal')?.addEventListener('click', () => this.closeConfirm());
    document.getElementById('confirmCancelBtn')?.addEventListener('click', () => this.closeConfirm());
    document.getElementById('confirmOkBtn')?.addEventListener('click', () => this.handleConfirmOk());

    // 输入模态框
    document.getElementById('closeInputModal')?.addEventListener('click', () => this.closeInput());
    document.getElementById('inputCancelBtn')?.addEventListener('click', () => this.closeInput());
    document.getElementById('inputOkBtn')?.addEventListener('click', () => this.handleInputOk());

    // 选择模态框
    document.getElementById('closeSelectModal')?.addEventListener('click', () => this.closeSelect());
    document.getElementById('selectCancelBtn')?.addEventListener('click', () => this.closeSelect());
    document.getElementById('selectOkBtn')?.addEventListener('click', () => this.handleSelectOk());

    // 标签组编辑模态框
    document.getElementById('closeTagGroupEditModal')?.addEventListener('click', () => this.closeTagGroupEdit());
    document.getElementById('cancelTagGroupEditBtn')?.addEventListener('click', () => this.closeTagGroupEdit());
    document.getElementById('saveTagGroupBtn')?.addEventListener('click', () => this.handleTagGroupEditSave());

    // 设置模态框
    document.getElementById('closeSettingsModal')?.addEventListener('click', () => this.closeSettings());

    // 回收站模态框
    document.getElementById('closePromptRecycleBinModal')?.addEventListener('click', () => this.closeRecycleBin());
    document.getElementById('closeImageRecycleBinModal')?.addEventListener('click', () => this.closeImageRecycleBin());

    // 标签管理器模态框
    document.getElementById('closePromptTagManagerModal')?.addEventListener('click', () => this.closePromptTagManager());
    document.getElementById('closeImageTagManagerModal')?.addEventListener('click', () => this.closeImageTagManager());
  }

  /**
   * 显示确认对话框
   * @param {string} title - 标题
   * @param {string} message - 消息内容
   * @returns {Promise<boolean>} 用户是否确认
   */
  showConfirm(title, message) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const modalTitle = document.getElementById('confirmModalTitle');
      const modalMessage = document.getElementById('confirmModalMessage');

      if (!modal) {
        resolve(false);
        return;
      }

      if (modalTitle) modalTitle.textContent = title;
      if (modalMessage) modalMessage.textContent = message;

      modal.style.display = 'flex';
      this.activeModals.add('confirmModal');

      // 存储回调
      this.confirmCallbacks.set('confirmModal', resolve);

      // 绑定键盘事件
      this.bindConfirmKeyboardEvents();
    });
  }

  /**
   * 绑定确认对话框键盘事件
   * @private
   */
  bindConfirmKeyboardEvents() {
    const handleKeyDown = (e) => {
      if (!this.activeModals.has('confirmModal')) {
        document.removeEventListener('keydown', handleKeyDown);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleConfirmOk();
        document.removeEventListener('keydown', handleKeyDown);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeConfirm(false);
        document.removeEventListener('keydown', handleKeyDown);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
  }

  /**
   * 关闭确认对话框
   * @param {boolean} result - 结果
   */
  closeConfirm(result = false) {
    const modal = document.getElementById('confirmModal');
    if (modal) {
      modal.style.display = 'none';
    }

    const callback = this.confirmCallbacks.get('confirmModal');
    if (callback) {
      callback(result);
      this.confirmCallbacks.delete('confirmModal');
    }

    this.activeModals.delete('confirmModal');
  }

  /**
   * 处理确认确定
   * @private
   */
  handleConfirmOk() {
    this.closeConfirm(true);
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
  openSettings() {
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
   * 打开回收站模态框
   */
  openRecycleBin() {
    const modal = document.getElementById('promptRecycleBinModal');
    if (modal) {
      modal.style.display = 'flex';
      this.activeModals.add('promptRecycleBinModal');
    }
  }

  /**
   * 关闭回收站模态框
   */
  closeRecycleBin() {
    const modal = document.getElementById('promptRecycleBinModal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.activeModals.delete('promptRecycleBinModal');
  }

  /**
   * 打开图像回收站模态框
   */
  openImageRecycleBin() {
    const modal = document.getElementById('imageRecycleBinModal');
    if (modal) {
      modal.style.display = 'flex';
      this.activeModals.add('imageRecycleBinModal');
    }
  }

  /**
   * 关闭图像回收站模态框
   */
  closeImageRecycleBin() {
    const modal = document.getElementById('imageRecycleBinModal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.activeModals.delete('imageRecycleBinModal');
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
   * 打开标签组编辑模态框
   * @param {string} type - 类型 (prompt/image)
   * @param {string|null} groupId - 标签组ID，null表示新建
   */
  async openTagGroupEdit(type, groupId = null) {
    const modal = document.getElementById('tagGroupEditModal');
    if (!modal) return;

    // 重置表单
    document.getElementById('tagGroupEditType').value = type;
    document.getElementById('tagGroupEditId').value = groupId || '';
    document.getElementById('tagGroupEditName').value = '';
    document.getElementById('tagGroupEditSelectType').value = 'multi';
    document.getElementById('tagGroupEditSortOrder').value = '0';

    // 如果是编辑，加载现有数据
    if (groupId) {
      const tagRegistry = type === 'prompt' ? this.app.tagRegistry : this.app.imageTagRegistry;
      if (tagRegistry) {
        const groups = await tagRegistry.service.getGroups();
        const group = groups.find(g => String(g.id) === String(groupId));
        if (group) {
          document.getElementById('tagGroupEditName').value = group.name || '';
          document.getElementById('tagGroupEditSelectType').value = group.type || 'multi';
          document.getElementById('tagGroupEditSortOrder').value = group.sortOrder || '0';
        }
      }
    }

    modal.classList.add('active');
    this.activeModals.add('tagGroupEditModal');
  }

  /**
   * 关闭标签组编辑模态框
   */
  closeTagGroupEdit() {
    const modal = document.getElementById('tagGroupEditModal');
    if (modal) {
      modal.classList.remove('active');
    }
    this.activeModals.delete('tagGroupEditModal');
  }

  /**
   * 处理标签组编辑保存
   * @private
   */
  async handleTagGroupEditSave() {
    const type = document.getElementById('tagGroupEditType').value;
    const groupId = document.getElementById('tagGroupEditId').value;
    const name = document.getElementById('tagGroupEditName').value.trim();
    const selectType = document.getElementById('tagGroupEditSelectType')?.value || 'multi';
    const sortOrder = parseInt(document.getElementById('tagGroupEditSortOrder')?.value || '0', 10);

    if (!name) {
      this.app.showToast('请输入标签组名称', 'error');
      return;
    }

    try {
      const tagRegistry = type === 'prompt' ? this.app.tagRegistry : this.app.imageTagRegistry;
      if (tagRegistry) {
        if (groupId) {
          await tagRegistry.service.updateGroup(groupId, { name, type: selectType, sortOrder });
        } else {
          await tagRegistry.service.createGroup(name, selectType, sortOrder);
        }
        // 刷新标签注册表
        await tagRegistry.render();
        // 刷新面板标签筛选
        await tagRegistry.refreshPanel();
      }

      this.closeTagGroupEdit();
      this.app.showToast(groupId ? '标签组已更新' : '标签组已创建', 'success');
    } catch (error) {
      console.error('Failed to save tag group:', error);
      this.app.showToast('保存失败', 'error');
    }
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
