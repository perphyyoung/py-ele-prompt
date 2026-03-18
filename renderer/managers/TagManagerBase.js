/**
 * 标签管理器基类
 * 封装提示词和图像标签管理的通用逻辑
 * 使用模板方法模式，子类实现特定差异
 */
export class TagManagerBase {
  /**
   * @param {Object} config - 配置对象
   * @param {string} config.type - 类型 ('prompt' | 'image')
   * @param {string} config.containerId - 容器元素ID
   * @param {string} config.emptyStateId - 空状态元素ID
   * @param {string} config.searchInputId - 搜索输入框ID
   * @param {Function} config.getTags - 获取标签的API方法
   * @param {Function} config.getTagsWithGroup - 获取带分组标签的API方法
   * @param {Function} config.getGroups - 获取标签组的API方法
   * @param {string[]} config.specialTags - 特殊标签列表
   * @param {Function} config.assignTagToGroup - 分配标签到组的API方法
   * @param {Function} config.renameTag - 重命名标签的API方法
   * @param {Function} config.deleteTag - 删除标签的API方法
   * @param {Function} config.deleteGroup - 删除标签组的API方法
   * @param {Function} config.addTag - 添加标签的API方法
   * @param {Function} config.refreshCallback - 刷新回调
   * @param {Object} context - 上下文对象（PromptManager实例）
   */
  constructor(config, context) {
    this.config = config;
    this.context = context;
    this.sortBy = localStorage.getItem(`${config.type}TagSortBy`) || 'count';
    this.sortOrder = localStorage.getItem(`${config.type}TagSortOrder`) || 'desc';
  }

  /**
   * 渲染标签管理器（模板方法）
   * @param {string} searchTerm - 搜索词
   */
  async render(searchTerm = '') {
    try {
      const tags = await this.config.getTags();
      const tagsWithGroup = await this.config.getTagsWithGroup();
      const groups = await this.config.getGroups();
      const container = document.getElementById(this.config.containerId);
      const emptyState = document.getElementById(this.config.emptyStateId);

      if (!container) return;

      // 获取可见项并计算标签数量
      const { visibleItems, tagCounts, specialTags } = await this.calculateTagCounts(tags);

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
      const html = this.generateHtml(groups, groupedTags, ungroupedTags, specialTags, tagCounts, searchTerm);
      container.innerHTML = html;

      // 绑定事件
      this.bindEvents(container);
    } catch (error) {
      console.error(`Failed to render ${this.config.type} tag manager:`, error);
      this.context.showToast(`加载${this.getTypeLabel()}标签失败`, 'error');
    }
  }

  /**
   * 获取类型标签（用于显示）
   * @returns {string}
   */
  getTypeLabel() {
    return this.config.type === 'prompt' ? '提示词' : '图像';
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
   * @returns {Object} 分组后的标签
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
   * 生成标签管理器HTML
   * @param {Array} groups - 标签组
   * @param {Object} groupedTags - 分组后的标签
   * @param {Array} ungroupedTags - 未分组标签
   * @param {Array} specialTags - 特殊标签
   * @param {Object} tagCounts - 标签计数
   * @param {string} searchTerm - 搜索词
   * @returns {string} HTML字符串
   */
  generateHtml(groups, groupedTags, ungroupedTags, specialTags, tagCounts, searchTerm) {
    let html = '';

    // 特殊标签卡片
    if (specialTags.length > 0) {
      html += this.generateSpecialTagCard(specialTags, tagCounts);
    }

    // 未分组标签卡片
    if (ungroupedTags.length > 0) {
      html += this.generateUngroupedTagCard(ungroupedTags, tagCounts);
    }

    // 标签组卡片
    const sortedGroups = groups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    sortedGroups.forEach(group => {
      const groupTagList = groupedTags[group.id] || [];
      if (groupTagList.length > 0 || !searchTerm) {
        html += this.generateTagGroupCard(group, groupTagList, tagCounts);
      }
    });

    return html;
  }

  /**
   * 生成标签项HTML
   * @param {string} tag - 标签名称
   * @param {number} count - 标签计数
   * @param {string|null} groupId - 所属组ID
   * @param {boolean} isSpecial - 是否为特殊标签
   * @returns {string} HTML字符串
   */
  generateTagItemHtml(tag, count, groupId = null, isSpecial = false) {
    const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    if (isSpecial) {
      return `
        <div class="tag-manager-item special-tag-in-card" data-tag="${escapeHtml(tag)}">
          <div class="tag-manager-badges">
            <span class="tag-badge-count">${count}</span>
          </div>
          <div class="tag-manager-item-name">${escapeHtml(tag)}</div>
        </div>
      `;
    }

    return `
      <div class="tag-manager-item tag-in-card" data-tag="${escapeHtml(tag)}" data-group-id="${groupId || ''}" draggable="true">
        <div class="tag-manager-badges">
          <button class="tag-badge-btn tag-badge-delete" data-tag="${escapeHtml(tag)}" title="删除">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button class="tag-badge-btn tag-badge-edit" data-tag="${escapeHtml(tag)}" title="编辑">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <span class="tag-badge-count">${count}</span>
        </div>
        <div class="tag-manager-item-name">${escapeHtml(tag)}</div>
      </div>
    `;
  }

  /**
   * 生成特殊标签卡片HTML
   * @param {Array} specialTags - 特殊标签数组
   * @param {Object} tagCounts - 标签计数
   * @returns {string} HTML字符串
   */
  generateSpecialTagCard(specialTags, tagCounts) {
    const specialTagsHtml = specialTags.map(tag => {
      return this.generateTagItemHtml(tag, tagCounts[tag] || 0, null, true);
    }).join('');

    return `
      <div class="tag-group-card special-tag-card">
        <div class="tag-group-card-header">
          <span class="tag-group-card-name">特殊标签</span>
        </div>
        <div class="tag-group-card-content">
          ${specialTagsHtml || '<span class="tag-group-card-empty">暂无特殊标签</span>'}
        </div>
      </div>
    `;
  }

  /**
   * 生成未分组标签卡片HTML
   * @param {Array} tags - 标签数组
   * @param {Object} tagCounts - 标签计数
   * @returns {string} HTML字符串
   */
  generateUngroupedTagCard(tags, tagCounts) {
    const ungroupedTagsHtml = tags.map(tag => {
      return this.generateTagItemHtml(tag, tagCounts[tag] || 0, null, false);
    }).join('');

    return `
      <div class="tag-group-card ungrouped-card" data-group-id="" data-drop-target="true">
        <div class="tag-group-card-header">
          <span class="tag-group-card-name">未分组</span>
        </div>
        <div class="tag-group-card-content">
          ${ungroupedTagsHtml || '<span class="tag-group-card-empty">暂无未分组标签</span>'}
        </div>
      </div>
    `;
  }

  /**
   * 生成标签组卡片HTML
   * @param {Object} group - 标签组
   * @param {Array} tags - 标签数组
   * @param {Object} tagCounts - 标签计数
   * @returns {string} HTML字符串
   */
  generateTagGroupCard(group, tags, tagCounts) {
    const typeBadge = `<span class="tag-filter-group-type">${group.type === 'single' ? '单选' : '多选'}</span>`;

    const groupTagsHtml = tags.map(tag => {
      return this.generateTagItemHtml(tag, tagCounts[tag] || 0, group.id, false);
    }).join('');

    return `
      <div class="tag-group-card" data-group-id="${group.id}" data-group-type="${group.type}" data-drop-target="true">
        <div class="tag-group-card-header">
          <span class="tag-group-card-name">${group.name}</span>
          <span class="tag-group-card-type">${typeBadge}</span>
          <div class="tag-group-card-actions">
            <button class="tag-group-btn edit" data-id="${group.id}" title="编辑">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="tag-group-btn delete" data-id="${group.id}" title="删除">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="tag-group-card-content">
          ${groupTagsHtml || '<span class="tag-group-card-empty">暂无标签</span>'}
        </div>
      </div>
    `;
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
        this.context.openTagGroupEditModal(this.config.type, groupId);
      });
    });

    // 删除标签组按钮
    container.querySelectorAll('.tag-group-btn.delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const groupId = parseInt(btn.dataset.id);
        await this.deleteTagGroup(groupId);
      });
    });

    // 绑定拖拽事件
    this.bindDragEvents(container);
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
      await this.config.renameTag(oldTag, newTag);
      this.context.showToast('标签已重命名', 'success');
      await this.render();
      if (this.config.refreshCallback) {
        await this.config.refreshCallback();
      }
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
      await this.config.deleteTag(tag);
      this.context.showToast(`${this.getTypeLabel()}标签已删除`);
      await this.render();
      if (this.config.refreshCallback) {
        await this.config.refreshCallback();
      }
    } catch (error) {
      console.error('Failed to delete tag:', error);
      this.context.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除标签组
   * @param {number} groupId - 标签组ID
   */
  async deleteTagGroup(groupId) {
    const confirmed = await this.context.showConfirmDialog(
      '确认删除',
      '删除标签组不会删除标签，标签将变为未分组状态。确定要删除吗？'
    );
    if (!confirmed) return;

    try {
      await this.config.deleteGroup(groupId);
      this.context.showToast('标签组已删除');
      const searchInput = document.getElementById(this.config.searchInputId);
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
      await this.config.assignTagToGroup(tagName, groupId);
      this.context.showToast('标签组已更新');
      const searchInput = document.getElementById(this.config.searchInputId);
      await this.render(searchInput ? searchInput.value : '');
      if (this.config.refreshCallback) {
        await this.config.refreshCallback();
      }
    } catch (error) {
      console.error('Failed to assign tag to group:', error);
      this.context.showToast('更新失败: ' + error.message, 'error');
    }
  }

  /**
   * 在标签管理界面新建标签
   * @param {string} defaultValue - 默认输入值
   * @param {number|null} defaultGroupId - 默认选中的组ID
   */
  async addTagInManager(defaultValue = '', defaultGroupId = null) {
    const groups = await this.config.getGroups();
    const tagsWithGroup = await this.config.getTagsWithGroup();

    const result = await this.context.showInputDialog(`新建${this.getTypeLabel()}标签`, '请输入标签名称', defaultValue, {
      showGroupSelect: true,
      groups: groups,
      defaultGroupId: defaultGroupId
    });
    if (!result || !result.value || !result.value.trim()) return;

    const trimmedTag = result.value.trim();

    // 检查是否为特殊标签（子类可实现此方法）
    if (this.isSpecialTag(trimmedTag)) {
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

      // 更新标签组
      try {
        await this.config.assignTagToGroup(trimmedTag, result.groupId);
        this.context.showToast('标签组已更新', 'success');
      } catch (error) {
        console.error('Failed to assign tag to group:', error);
        this.context.showToast('更新失败: ' + error.message, 'error');
        await this.addTagInManager(trimmedTag, result.groupId);
        return;
      }
    } else {
      // 创建新标签
      try {
        await this.config.addTag(trimmedTag);
        if (result.groupId) {
          await this.config.assignTagToGroup(trimmedTag, result.groupId);
        }
        this.context.showToast('标签已创建', 'success');
      } catch (error) {
        console.error('Failed to add tag:', error);
        this.context.showToast('创建标签失败', 'error');
        await this.addTagInManager(trimmedTag, result.groupId);
        return;
      }
    }

    // 刷新标签列表
    await this.render();
    if (this.config.refreshCallback) {
      await this.config.refreshCallback();
    }
  }

  /**
   * 检查是否为特殊标签（子类可覆盖）
   * @param {string} tag - 标签名
   * @returns {boolean}
   */
  isSpecialTag(tag) {
    return this.config.specialTags.includes(tag);
  }

  /**
   * 设置排序方式
   * @param {string} sortBy - 排序字段
   * @param {string} sortOrder - 排序顺序
   */
  setSort(sortBy, sortOrder) {
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
    localStorage.setItem(`${this.config.type}TagSortBy`, sortBy);
    localStorage.setItem(`${this.config.type}TagSortOrder`, sortOrder);
  }

  /**
   * 切换排序顺序
   */
  toggleSortOrder() {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    localStorage.setItem(`${this.config.type}TagSortOrder`, this.sortOrder);
    return this.sortOrder;
  }

  /**
   * 计算标签数量（子类必须实现）
   * @param {Array} tags - 所有标签
   * @returns {Object} 包含visibleItems, tagCounts, specialTags的对象
   */
  async calculateTagCounts(tags) {
    throw new Error('calculateTagCounts must be implemented by subclass');
  }
}
