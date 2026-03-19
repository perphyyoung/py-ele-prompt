import { TagService } from './TagService.js';
import { TagUI } from './TagUI.js';
import { Constants } from '../constants.js';

/**
 * 标签注册表 - 业务逻辑层
 * 管理标签的注册、分组、排序、CRUD 操作
 */
export class TagRegistry {
  /**
   * @param {string} type - 类型 ('prompt' | 'image')
   * @param {Object} context - 上下文对象（app实例）
   */
  constructor(type, context) {
    this.type = type;
    this.context = context;
    this.service = new TagService(type);
    this.ui = new TagUI(type);

    // 排序状态
    this.sortBy = localStorage.getItem(`${type}TagSortBy`) || 'count';
    this.sortOrder = localStorage.getItem(`${type}TagSortOrder`) || 'desc';

    // DOM 元素 ID
    this.containerId = type === 'prompt' ? 'promptTagGroupCards' : 'imageTagGroupCards';
    this.emptyStateId = type === 'prompt' ? 'promptTagManagerEmpty' : 'imageTagManagerEmpty';
    this.searchInputId = type === 'prompt' ? 'promptTagManagerSearchInput' : 'imageTagManagerSearchInput';
  }

  /**
   * 渲染标签管理器
   * @param {string} searchTerm - 搜索词
   */
  async render(searchTerm = '') {
    try {
      const tags = await this.service.getTags();
      const tagsWithGroup = await this.service.getTagsWithGroup();
      const groups = await this.service.getGroups();
      const container = document.getElementById(this.containerId);
      const emptyState = document.getElementById(this.emptyStateId);

      if (!container) return;

      // 计算标签数量
      const { tagCounts, specialTags } = await this.calculateTagCounts(tags);

      // 根据搜索词过滤
      const filteredTags = (searchTerm
        ? tags.filter(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
        : tags).filter(tag => !specialTags.includes(tag));

      if (filteredTags.length === 0 && specialTags.length === 0) {
        container.style.display = 'none';
        if (emptyState) {
          emptyState.style.display = 'flex';
          const emptyText = emptyState.querySelector('p');
          if (emptyText) {
            emptyText.textContent = searchTerm ? '没有找到匹配的标签' : `暂无${this.getTypeLabel()}标签`;
          }
        }
        return;
      }

      container.style.display = 'grid';
      if (emptyState) emptyState.style.display = 'none';

      // 排序和分组
      const sortedTags = this.sortTags(filteredTags, tagCounts);
      const { groupedTags, ungroupedTags } = this.groupTags(sortedTags, tagsWithGroup, groups);

      // 渲染HTML
      const html = this.ui.generateRegistryHtml(groups, groupedTags, ungroupedTags, specialTags, tagCounts, searchTerm);
      container.innerHTML = html;

      // 绑定事件
      this.bindEvents(container);
    } catch (error) {
      console.error(`Failed to render ${this.type} tag registry:`, error);
      this.context.showToast(`加载${this.getTypeLabel()}标签失败`, 'error');
    }
  }

  /**
   * 获取类型标签（用于显示）
   * @returns {string}
   */
  getTypeLabel() {
    return this.type === 'prompt' ? '提示词' : '图像';
  }

  /**
   * 计算标签数量
   * @param {Array} tags - 标签数组
   * @returns {Object} { tagCounts, specialTags }
   */
  async calculateTagCounts(tags) {
    const tagCounts = {};
    const specialTagChecks = this.service.getSpecialTagChecks();
    const specialTags = [];

    // 获取可见项
    const visibleItems = this.type === 'prompt'
      ? this.context.prompts || []
      : this.context.images || [];

    // 计算普通标签数量
    tags.forEach(tag => {
      if (!Constants.ALL_SPECIAL_TAGS.includes(tag)) {
        tagCounts[tag] = visibleItems.filter(item => item.tags && item.tags.includes(tag)).length;
      }
    });

    // 计算特殊标签数量
    specialTagChecks.forEach((checkFn, tag) => {
      const count = visibleItems.filter(checkFn).length;
      if (count > 0 || tag === Constants.NO_TAG_TAG) {
        tagCounts[tag] = count;
        specialTags.push(tag);
      }
    });

    return { tagCounts, specialTags };
  }

  /**
   * 排序标签
   * @param {Array} tags - 标签数组
   * @param {Object} tagCounts - 标签计数
   * @returns {Array} 排序后的标签数组
   */
  sortTags(tags, tagCounts) {
    const order = this.sortOrder === 'asc' ? 1 : -1;

    return [...tags].sort((a, b) => {
      const countA = tagCounts[a] || 0;
      const countB = tagCounts[b] || 0;
      const nameA = a.toLowerCase();
      const nameB = b.toLowerCase();

      if (this.sortBy === 'count') {
        if (countA !== countB) {
          return (countA - countB) * order;
        }
        return nameA.localeCompare(nameB);
      } else {
        return nameA.localeCompare(nameB) * order;
      }
    });
  }

  /**
   * 分组标签
   * @param {Array} tags - 标签数组
   * @param {Array} tagsWithGroup - 带分组的标签
   * @param {Array} groups - 标签组
   * @returns {Object} { groupedTags, ungroupedTags }
   */
  groupTags(tags, tagsWithGroup, groups) {
    const groupedTags = {};
    const ungroupedTags = [];

    groups.forEach(group => {
      groupedTags[group.id] = [];
    });

    tags.forEach(tag => {
      const tagInfo = tagsWithGroup.find(t => t.name === tag);
      if (tagInfo && tagInfo.groupId) {
        if (groupedTags[tagInfo.groupId]) {
          groupedTags[tagInfo.groupId].push(tag);
        } else {
          ungroupedTags.push(tag);
        }
      } else {
        ungroupedTags.push(tag);
      }
    });

    return { groupedTags, ungroupedTags };
  }

  /**
   * 绑定事件
   * @param {HTMLElement} container - 容器元素
   */
  bindEvents(container) {
    // 编辑标签按钮
    container.querySelectorAll('.tag-badge-edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tag = btn.dataset.tag;
        await this.startRenameTag(tag);
      });
    });

    // 删除标签按钮
    container.querySelectorAll('.tag-badge-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tag = btn.dataset.tag;
        await this.deleteTag(tag);
      });
    });

    // 编辑标签组按钮
    container.querySelectorAll('.tag-group-btn.edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const groupId = parseInt(btn.dataset.id);
        this.context.modalManager?.openTagGroupEdit(this.type, groupId);
      });
    });

    // 删除标签组按钮
    container.querySelectorAll('.tag-group-btn.delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const groupId = parseInt(btn.dataset.id);
        await this.deleteGroup(groupId);
      });
    });

    // 绑定拖拽事件
    this.bindDragEvents(container);

    // 绑定标签组右键菜单事件
    this.bindGroupContextMenu(container);
  }

  /**
   * 绑定标签组右键菜单事件
   * @param {HTMLElement} container - 容器元素
   */
  bindGroupContextMenu(container) {
    // 获取所有标签组卡片（排除特殊标签卡片和未分组卡片）
    const groupCards = container.querySelectorAll('.tag-group-card[data-group-id]:not(.special-tag-card):not(.ungrouped-card)');

    groupCards.forEach(card => {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const groupId = card.dataset.groupId;
        if (!groupId) return;

        // 显示右键菜单
        this.showContextMenu(e, [
          {
            label: '固定到首位',
            action: () => this.pinTagGroupToTop(parseInt(groupId))
          }
        ]);
      });
    });
  }

  /**
   * 显示右键菜单
   * @param {Event} event - 事件对象
   * @param {Array} items - 菜单项数组
   */
  showContextMenu(event, items) {
    // 移除已有的右键菜单
    const existingMenu = document.getElementById('dynamicContextMenu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 创建右键菜单
    const menu = document.createElement('div');
    menu.id = 'dynamicContextMenu';
    menu.className = 'context-menu';

    // 生成菜单项
    menu.innerHTML = items.map((item, index) =>
      `<div class="context-menu-item" data-index="${index}">${item.label}</div>`
    ).join('');

    // 设置菜单位置
    menu.style.position = 'fixed';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.style.zIndex = '10000';

    document.body.appendChild(menu);

    // 绑定菜单项点击事件
    menu.querySelectorAll('.context-menu-item').forEach((menuItem, index) => {
      menuItem.addEventListener('click', () => {
        items[index].action();
        menu.remove();
      });
    });

    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }

  /**
   * 绑定拖拽事件
   * @param {HTMLElement} container - 容器元素
   */
  bindDragEvents(container) {
    const allTagItems = container.querySelectorAll('.tag-manager-item[draggable="true"]');
    const dropTargets = container.querySelectorAll('.tag-group-card[data-drop-target="true"]');

    allTagItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.dataset.tag);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        dropTargets.forEach(target => target.classList.remove('drag-over'));
      });
    });

    dropTargets.forEach(target => {
      target.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        target.classList.add('drag-over');
      });

      target.addEventListener('dragleave', () => {
        target.classList.remove('drag-over');
      });

      target.addEventListener('drop', async (e) => {
        e.preventDefault();
        target.classList.remove('drag-over');
        const tagName = e.dataTransfer.getData('text/plain');
        const groupId = target.dataset.groupId ? parseInt(target.dataset.groupId) : null;

        if (tagName) {
          await this.assignTagToGroup(tagName, groupId);
        }
      });
    });
  }

  /**
   * 开始重命名标签
   * @param {string} oldTag - 旧标签名
   */
  async startRenameTag(oldTag) {
    const result = await this.context.showInputDialog('重命名标签', '请输入新标签名:', oldTag);
    const newTag = typeof result === 'string' ? result : (result?.value || '');
    if (newTag && newTag.trim() && newTag.trim() !== oldTag) {
      await this.renameTag(oldTag, newTag.trim());
    }
  }

  /**
   * 重命名标签
   * @param {string} oldTag - 旧标签名
   * @param {string} newTag - 新标签名
   */
  async renameTag(oldTag, newTag) {
    try {
      await this.service.renameTag(oldTag, newTag);
      this.context.showToast('标签已重命名', 'success');
      await this.render();
      await this.refreshPanel();
    } catch (error) {
      console.error('Failed to rename tag:', error);
      this.context.showToast('重命名标签失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除标签
   * @param {string} tag - 标签名
   */
  async deleteTag(tag) {
    const confirmed = await this.context.showConfirmDialog(
      `确认删除${this.getTypeLabel()}标签`,
      `确定要删除${this.getTypeLabel()}标签 "${tag}" 吗？此标签将从所有${this.getTypeLabel()}中移除。`
    );
    if (!confirmed) return;

    try {
      await this.service.deleteTag(tag);
      this.context.showToast(`${this.getTypeLabel()}标签已删除`);
      await this.render();
      await this.refreshPanel();
    } catch (error) {
      console.error('Failed to delete tag:', error);
      this.context.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除标签组
   * @param {number} groupId - 标签组ID
   */
  async deleteGroup(groupId) {
    const confirmed = await this.context.showConfirmDialog(
      '确认删除',
      '删除标签组不会删除标签，标签将变为未分组状态。确定要删除吗？'
    );
    if (!confirmed) return;

    try {
      await this.service.deleteGroup(groupId);
      this.context.showToast('标签组已删除');
      const searchInput = document.getElementById(this.searchInputId);
      await this.render(searchInput ? searchInput.value : '');
    } catch (error) {
      console.error('Failed to delete tag group:', error);
      this.context.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 分配标签到组
   * @param {string} tagName - 标签名称
   * @param {number|null} groupId - 组ID
   */
  async assignTagToGroup(tagName, groupId) {
    try {
      await this.service.assignTagToGroup(tagName, groupId);
      this.context.showToast('标签组已更新');
      const searchInput = document.getElementById(this.searchInputId);
      await this.render(searchInput ? searchInput.value : '');
      await this.refreshPanel();
    } catch (error) {
      console.error('Failed to assign tag to group:', error);
      this.context.showToast('更新失败: ' + error.message, 'error');
    }
  }

  /**
   * 刷新面板
   */
  async refreshPanel() {
    if (this.type === 'prompt') {
      await this.context.promptPanelManager.loadItems();
      this.context.promptPanelManager.renderTagFilters();
    } else {
      await this.context.imagePanelManager.loadItems();
      this.context.imagePanelManager.renderTagFilters();
    }
  }

  /**
   * 将标签组固定到首位
   * @param {number} groupId - 标签组ID
   */
  async pinTagGroupToTop(groupId) {
    try {
      // 获取所有标签组
      const groups = await this.service.getGroups();

      // 按 sortOrder 排序，第一个即为当前首位
      const sortedGroups = groups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const firstSortOrder = sortedGroups[0]?.sortOrder || 0;

      // 将目标组的 sortOrder 设为首位 - 1
      const newSortOrder = firstSortOrder - 1;

      // 更新标签组
      const group = groups.find(g => String(g.id) === String(groupId));
      if (group) {
        await this.service.updateGroup(groupId, {
          name: group.name,
          type: group.type,
          sortOrder: newSortOrder
        });
        this.context.showToast('标签组已固定到首位', 'success');
        const searchInput = document.getElementById(this.searchInputId);
        await this.render(searchInput ? searchInput.value : '');
        await this.refreshPanel();
      }
    } catch (error) {
      console.error('Failed to pin tag group to top:', error);
      this.context.showToast('固定失败: ' + error.message, 'error');
    }
  }

  /**
   * 在标签管理界面新建标签
   * @param {string} defaultValue - 默认输入值
   * @param {number|null} defaultGroupId - 默认选中的组ID
   */
  async addTagInManager(defaultValue = '', defaultGroupId = null) {
    const groups = await this.service.getGroups();
    const tagsWithGroup = await this.service.getTagsWithGroup();

    const result = await this.context.showInputDialog(`新建${this.getTypeLabel()}标签`, '请输入标签名称', defaultValue, {
      showGroupSelect: true,
      groups: groups,
      defaultGroupId: defaultGroupId
    });
    if (!result || !result.value || !result.value.trim()) return;

    const trimmedTag = result.value.trim();

    // 检查是否为特殊标签
    if (Constants.ALL_SPECIAL_TAGS.includes(trimmedTag)) {
      this.context.showToast(`"${trimmedTag}" 是系统保留标签，不能使用`, 'error');
      await this.addTagInManager(trimmedTag, result.groupId);
      return;
    }

    // 检查标签是否已存在
    const existingTag = tagsWithGroup.find(t => t.name === trimmedTag);
    if (existingTag) {
      const currentGroupName = existingTag.groupName || '未分组';
      const newGroupName = result.groupId
        ? groups.find(g => g.id === result.groupId)?.name || '未分组'
        : '未分组';

      const confirmed = await this.context.showConfirmDialog(
        '标签已存在',
        `标签 "${trimmedTag}" 已存在，当前所属组：${currentGroupName}\n\n是否覆盖并移动到：${newGroupName}？`
      );

      if (!confirmed) {
        await this.addTagInManager(trimmedTag, result.groupId);
        return;
      }
    }

    try {
      await this.service.addTag(trimmedTag);
      // 无论是否选择分组，都调用 assignTagToGroup
      // 如果 groupId 为 null，会将标签从当前组移除（移入未分组）
      await this.service.assignTagToGroup(trimmedTag, result.groupId || null);
      this.context.showToast('标签已创建', 'success');
      await this.render();
      await this.refreshPanel();
    } catch (error) {
      console.error('Failed to create tag:', error);
      this.context.showToast('创建标签失败: ' + error.message, 'error');
    }
  }
}

export default TagRegistry;
