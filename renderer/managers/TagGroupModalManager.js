/**
 * 标签组模态框管理器
 * 专门负责标签组编辑模态框的显示、隐藏和交互
 */
export class TagGroupModalManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options) {
    this.app = options.app;
    this.activeModal = false;
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
    document.getElementById('closeTagGroupEditModal')?.addEventListener('click', () => this.closeEdit());
    document.getElementById('cancelTagGroupEditBtn')?.addEventListener('click', () => this.closeEdit());
    document.getElementById('saveTagGroupBtn')?.addEventListener('click', () => this.handleSave());
  }

  /**
   * 打开标签组编辑模态框
   * @param {string} type - 类型 ('prompt' | 'image')
   * @param {number|null} groupId - 标签组ID，null表示新建
   */
  async openEdit(type, groupId = null) {
    const modal = document.getElementById('tagGroupEditModal');
    if (!modal) return;

    document.getElementById('tagGroupEditType').value = type;
    document.getElementById('tagGroupEditId').value = groupId || '';
    document.getElementById('tagGroupEditName').value = '';
    document.getElementById('tagGroupEditSelectType').value = 'multi';
    document.getElementById('tagGroupEditSortOrder').value = '0';

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
    this.activeModal = true;
  }

  /**
   * 关闭标签组编辑模态框
   */
  closeEdit() {
    const modal = document.getElementById('tagGroupEditModal');
    if (modal) {
      modal.classList.remove('active');
    }
    this.activeModal = false;
  }

  /**
   * 处理标签组编辑保存
   * @private
   */
  async handleSave() {
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
        await tagRegistry.render();
        await tagRegistry.refreshPanel();
      }

      this.closeEdit();
      this.app.showToast(groupId ? '标签组已更新' : '标签组已创建', 'success');
    } catch (error) {
      window.electronAPI.logError('TagGroupModalManager.js', 'Failed to save tag group:', error);
      this.app.showToast('保存失败: ' + error.message, 'error');
    }
  }

  /**
   * 检查模态框是否处于活动状态
   * @returns {boolean}
   */
  isActive() {
    return this.activeModal;
  }
}

export default TagGroupModalManager;
