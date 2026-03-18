/**
 * 标签管理器
 * 管理标签组、标签的创建、编辑、删除等操作
 */
export class TagManager {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 主应用引用
   * @param {Object} options.eventBus - 事件总线
   */
  constructor(options) {
    this.app = options.app;
    this.eventBus = options.eventBus;
    this.tagGroups = [];
    this.selectedTagGroup = null;
    this.draggedTag = null;
  }

  /**
   * 初始化标签管理器
   */
  async init() {
    await this.loadTagGroups();
    this.bindEvents();
    this.renderTagGroupsList();
  }

  /**
   * 加载标签组列表
   */
  async loadTagGroups() {
    try {
      this.tagGroups = await window.electronAPI.getTagGroups();
      this.eventBus.emit('tagGroupsLoaded', { tagGroups: this.tagGroups });
    } catch (error) {
      console.error('Failed to load tag groups:', error);
      this.app.showToast('加载标签组失败', 'error');
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 新建标签组按钮
    const createBtn = document.getElementById('createTagGroupBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.showCreateTagGroupModal());
    }

    // 标签组列表拖拽排序
    this.bindTagGroupSort();
  }

  /**
   * 渲染标签组列表
   */
  renderTagGroupsList() {
    const container = document.getElementById('tagGroupsList');
    if (!container) return;

    if (this.tagGroups.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>暂无标签组</p>
          <button class="btn btn-primary" onclick="app.showCreateTagGroupModal()">创建第一个标签组</button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.tagGroups.map(group => this.renderTagGroupItem(group)).join('');
    this.bindTagGroupItemEvents();
  }

  /**
   * 渲染标签组项
   * @param {Object} group - 标签组对象
   * @returns {string} HTML 字符串
   */
  renderTagGroupItem(group) {
    const isSelected = this.selectedTagGroup && isSameId(group.id, this.selectedTagGroup.id);
    const tagCount = group.tags ? group.tags.length : 0;

    return `
      <div class="tag-group-item ${isSelected ? 'selected' : ''}" data-group-id="${group.id}">
        <div class="tag-group-header">
          <div class="tag-group-drag-handle" title="拖拽排序">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          </div>
          <span class="tag-group-name">${group.name}</span>
          <span class="tag-group-count">${tagCount}个标签</span>
          <div class="tag-group-actions">
            <button class="btn-icon btn-edit" title="编辑" data-action="edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-icon btn-delete" title="删除" data-action="delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="tag-group-tags">
          ${(group.tags || []).slice(0, 10).map(tag => 
            `<span class="tag-badge-sm">${tag}</span>`
          ).join('')}
          ${tagCount > 10 ? `<span class="tag-more">+${tagCount - 10}</span>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * 绑定标签组项事件
   */
  bindTagGroupItemEvents() {
    const items = document.querySelectorAll('.tag-group-item');
    
    items.forEach(item => {
      // 点击选择
      item.addEventListener('click', (e) => {
        if (e.target.closest('.tag-group-actions')) return;
        
        const groupId = item.dataset.groupId;
        const group = this.tagGroups.find(g => isSameId(g.id, groupId));
        if (group) {
          this.selectTagGroup(group);
        }
      });

      // 编辑按钮
      const editBtn = item.querySelector('[data-action="edit"]');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const groupId = item.dataset.groupId;
          const group = this.tagGroups.find(g => isSameId(g.id, groupId));
          if (group) {
            this.showEditTagGroupModal(group);
          }
        });
      }

      // 删除按钮
      const deleteBtn = item.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const groupId = item.dataset.groupId;
          const group = this.tagGroups.find(g => isSameId(g.id, groupId));
          if (group) {
            this.confirmDeleteTagGroup(group);
          }
        });
      }
    });
  }

  /**
   * 选择标签组
   * @param {Object} group - 标签组对象
   */
  selectTagGroup(group) {
    this.selectedTagGroup = group;
    this.renderTagGroupsList();
    this.eventBus.emit('tagGroupSelected', { group });
  }

  /**
   * 显示创建标签组模态框
   */
  showCreateTagGroupModal() {
    const modal = document.getElementById('tagGroupModal');
    if (!modal) {
      console.error('Tag group modal not found');
      return;
    }

    // 清空表单
    document.getElementById('tagGroupId').value = '';
    document.getElementById('tagGroupName').value = '';
    document.getElementById('tagGroupDescription').value = '';
    document.getElementById('tagGroupTags').value = '';

    // 设置标题
    const title = document.querySelector('#tagGroupModal .modal-title');
    if (title) {
      title.textContent = '创建标签组';
    }

    modal.classList.add('active');
  }

  /**
   * 显示编辑标签组模态框
   * @param {Object} group - 标签组对象
   */
  showEditTagGroupModal(group) {
    const modal = document.getElementById('tagGroupModal');
    if (!modal) {
      console.error('Tag group modal not found');
      return;
    }

    // 填充表单
    document.getElementById('tagGroupId').value = group.id || '';
    document.getElementById('tagGroupName').value = group.name || '';
    document.getElementById('tagGroupDescription').value = group.description || '';
    document.getElementById('tagGroupTags').value = (group.tags || []).join('\n');

    // 设置标题
    const title = document.querySelector('#tagGroupModal .modal-title');
    if (title) {
      title.textContent = '编辑标签组';
    }

    modal.classList.add('active');
  }

  /**
   * 保存标签组
   */
  async saveTagGroup() {
    const id = document.getElementById('tagGroupId').value;
    const name = document.getElementById('tagGroupName').value.trim();
    const description = document.getElementById('tagGroupDescription').value.trim();
    const tagsText = document.getElementById('tagGroupTags').value.trim();

    // 验证
    if (!name) {
      this.app.showToast('标签组名称不能为空', 'error');
      return;
    }

    // 解析标签
    const tags = tagsText.split('\n').map(t => t.trim()).filter(t => t);

    try {
      const tagGroup = {
        id: id || undefined,
        name,
        description,
        tags
      };

      if (id) {
        // 更新
        await window.electronAPI.updateTagGroup(id, tagGroup);
        this.app.showToast('标签组已更新', 'success');
      } else {
        // 创建
        await window.electronAPI.createTagGroup(tagGroup);
        this.app.showToast('标签组已创建', 'success');
      }

      // 关闭模态框
      const modal = document.getElementById('tagGroupModal');
      if (modal) {
        modal.classList.remove('active');
      }

      // 重新加载
      await this.loadTagGroups();
    } catch (error) {
      console.error('Failed to save tag group:', error);
      this.app.showToast('保存失败', 'error');
    }
  }

  /**
   * 确认删除标签组
   * @param {Object} group - 标签组对象
   */
  async confirmDeleteTagGroup(group) {
    const confirmed = await this.app.showConfirm(
      `确定要删除标签组"${group.name}"吗？\n此操作不会删除标签关联的提示词和图像。`
    );

    if (!confirmed) return;

    try {
      await window.electronAPI.deleteTagGroup(group.id);
      this.app.showToast('标签组已删除', 'success');
      
      // 重新加载
      await this.loadTagGroups();
    } catch (error) {
      console.error('Failed to delete tag group:', error);
      this.app.showToast('删除失败', 'error');
    }
  }

  /**
   * 绑定标签组拖拽排序
   */
  bindTagGroupSort() {
    const container = document.getElementById('tagGroupsList');
    if (!container) return;

    let draggedItem = null;

    container.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.tag-group-item');
      if (item) {
        draggedItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const item = e.target.closest('.tag-group-item');
      if (item && item !== draggedItem) {
        const rect = item.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) {
          item.insertBefore(draggedItem, item.firstChild);
        } else {
          item.insertBefore(draggedItem, item.nextSibling);
        }
      }
    });

    container.addEventListener('dragend', async () => {
      if (draggedItem) {
        draggedItem.classList.remove('dragging');
        
        // 获取新的顺序
        const items = container.querySelectorAll('.tag-group-item');
        const newOrder = Array.from(items).map(item => item.dataset.groupId);
        
        // 保存新顺序
        await this.saveTagGroupOrder(newOrder);
        
        draggedItem = null;
      }
    });
  }

  /**
   * 保存标签组顺序
   * @param {Array} order - 新的顺序
   */
  async saveTagGroupOrder(order) {
    try {
      await window.electronAPI.reorderTagGroups(order);
      // 重新加载
      await this.loadTagGroups();
    } catch (error) {
      console.error('Failed to reorder tag groups:', error);
    }
  }

  /**
   * 获取选中的标签组
   * @returns {Object|null} 选中的标签组
   */
  getSelectedTagGroup() {
    return this.selectedTagGroup;
  }

  /**
   * 获取所有标签组
   * @returns {Array} 标签组列表
   */
  getTagGroups() {
    return this.tagGroups;
  }

  /**
   * 根据 ID 查找标签组
   * @param {string} groupId - 标签组 ID
   * @returns {Object|null} 标签组对象
   */
  findTagGroupById(groupId) {
    return this.tagGroups.find(g => isSameId(g.id, groupId));
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.tagGroups = [];
    this.selectedTagGroup = null;
    this.draggedTag = null;
  }
}

// 导入 isSameId
import { isSameId } from '../utils/isSameId.js';

export default TagManager;
