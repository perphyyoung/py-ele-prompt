import { Constants } from '../constants.js';

/**
 * 标签 UI - 展示层
 * 负责标签相关的 HTML 生成和 UI 组件渲染
 */
export class TagUI {
  /**
   * @param {string} type - 类型 ('prompt' | 'image')
   */
  constructor(type) {
    this.type = type;
    this.isPrompt = type === 'prompt';
  }

  // ========== HTML 转义工具 ==========

  static escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  static escapeAttr(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '&#10;')
      .replace(/\r/g, '&#13;');
  }

  // ========== 标签注册表 HTML ==========

  /**
   * 生成标签注册表 HTML
   * @param {Array} groups - 标签组
   * @param {Object} groupedTags - 分组后的标签
   * @param {Array} ungroupedTags - 未分组标签
   * @param {Array} specialTags - 特殊标签
   * @param {Object} tagCounts - 标签计数
   * @param {string} searchTerm - 搜索词
   * @returns {string} HTML 字符串
   */
  generateRegistryHtml(groups, groupedTags, ungroupedTags, specialTags, tagCounts, searchTerm) {
    let html = '';

    // 特殊标签卡片
    if (specialTags.length > 0) {
      html += this.generateSpecialTagCard(specialTags, tagCounts);
    }

    // 未分组标签卡片
    if (ungroupedTags.length > 0) {
      html += this.generateUngroupedTagCard(ungroupedTags, tagCounts);
    }

    // 标签组卡片（按排序顺序）
    const sortedGroups = groups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    sortedGroups.forEach((group, index) => {
      const tags = groupedTags[group.id] || [];
      // 搜索模式下只显示有标签的组，非搜索模式显示所有组
      if (tags.length > 0 || !searchTerm) {
        html += this.generateTagGroupCard(group, tags, tagCounts, index === 0);
      }
    });

    return html;
  }

  /**
   * 生成标签项 HTML
   * @param {string} tag - 标签名称
   * @param {number} count - 标签计数
   * @param {string|null} groupId - 所属组ID
   * @param {boolean} isSpecial - 是否为特殊标签
   * @returns {string} HTML 字符串
   */
  generateTagItemHtml(tag, count, groupId = null, isSpecial = false) {
    if (isSpecial) {
      return `
        <div class="tag-manager-item special-tag-in-card" data-tag="${TagUI.escapeHtml(tag)}">
          <div class="tag-manager-badges">
            <span class="tag-badge-count">${count}</span>
          </div>
          <div class="tag-manager-item-name">${TagUI.escapeHtml(tag)}</div>
        </div>
      `;
    }

    return `
      <div class="tag-manager-item tag-in-card" data-tag="${TagUI.escapeHtml(tag)}" data-group-id="${groupId || ''}" draggable="true">
        <div class="tag-manager-badges">
          <button class="tag-badge-btn tag-badge-delete" data-tag="${TagUI.escapeHtml(tag)}" title="删除">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button class="tag-badge-btn tag-badge-edit" data-tag="${TagUI.escapeHtml(tag)}" title="编辑">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <span class="tag-badge-count">${count}</span>
        </div>
        <div class="tag-manager-item-name">${TagUI.escapeHtml(tag)}</div>
      </div>
    `;
  }

  /**
   * 生成特殊标签卡片 HTML
   * @param {Array} specialTags - 特殊标签数组
   * @param {Object} tagCounts - 标签计数
   * @returns {string} HTML 字符串
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
   * 生成未分组标签卡片 HTML
   * @param {Array} tags - 标签数组
   * @param {Object} tagCounts - 标签计数
   * @returns {string} HTML 字符串
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
   * 生成标签组卡片 HTML
   * @param {Object} group - 标签组
   * @param {Array} tags - 标签数组
   * @param {Object} tagCounts - 标签计数
   * @param {boolean} isFirst - 是否为首组
   * @returns {string} HTML 字符串
   */
  generateTagGroupCard(group, tags, tagCounts, isFirst = false) {
    const firstBadge = isFirst ? '<span class="tag-group-card-first">首位组</span>' : '';
    const sortBadge = `<span class="tag-group-card-sort">${group.sortOrder || 0}</span>`;
    const typeText = group.type === 'single' ? '单选' : '多选';

    const groupTagsHtml = tags.map(tag => {
      return this.generateTagItemHtml(tag, tagCounts[tag] || 0, group.id, false);
    }).join('');

    return `
      <div class="tag-group-card" data-group-id="${group.id}" data-group-type="${group.type}" data-drop-target="true">
        <div class="tag-group-card-header">
          <span class="tag-group-card-name">${TagUI.escapeHtml(group.name)}</span>
          ${sortBadge}
          ${firstBadge}
          <span class="tag-group-card-type">${typeText}</span>
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

  // ========== 标签筛选器 HTML ==========

  /**
   * 生成标签筛选器 HTML
   * @param {Array} tags - 标签及其组信息
   * @param {Object} counts - 标签计数
   * @param {Object} options - 配置选项
   * @returns {string} HTML 字符串
   */
  static generateTagFiltersHtml(tags, counts, options) {
    const { specialTags, selectedTags, groups, isImage = false } = options;
    const selectedSet = selectedTags instanceof Set ? selectedTags : new Set();
    let html = '';

    // 渲染特殊标签
    if (specialTags && specialTags.length > 0) {
      html += specialTags.map(({ tag, count }) => {
        const isActive = selectedSet.has(tag);
        const dragType = isImage ? 'image-tag' : 'prompt-tag';
        return `
          <button class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagUI.escapeHtml(tag)}" data-is-special="true" draggable="true" data-drag-type="${dragType}">
            <span class="tag-name">${TagUI.escapeHtml(tag)}</span>
            <span class="tag-badge">${count}</span>
          </button>
        `;
      }).join('');
    }

    // 渲染普通标签（分组）
    if (groups && groups.length > 0) {
      const groupedTags = {};
      const ungroupedTags = [];

      groups.forEach(group => {
        groupedTags[group.name] = { group, tags: [] };
      });

      tags.forEach(({ name: tag }) => {
        if (Constants.ALL_SPECIAL_TAGS.includes(tag)) return;
        const tagInfo = tags.find(t => t.name === tag);
        if (tagInfo && tagInfo.groupName && groupedTags[tagInfo.groupName]) {
          groupedTags[tagInfo.groupName].tags.push({ tag, count: counts[tag] || 0 });
        } else {
          ungroupedTags.push({ tag, count: counts[tag] || 0 });
        }
      });

      // 渲染分组标签
      const sortedGroups = groups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      sortedGroups.forEach(group => {
        const groupData = groupedTags[group.name];
        if (!groupData || groupData.tags.length === 0) return;

        const visibleTags = groupData.tags.filter(({ count }) => count > 0);
        if (visibleTags.length === 0) return;

        const groupTypeText = group.type === 'single' ? '单选' : '多选';
        html += `<div class="tag-filter-group" data-group-id="${group.id}" data-group-type="${group.type}">`;
        html += `<div class="tag-filter-group-title">${TagUI.escapeHtml(group.name)} <span class="tag-filter-group-type">${groupTypeText}</span></div>`;
        html += '<div class="tag-filter-group-content">';

        html += visibleTags.map(({ tag, count }) => {
          const isActive = selectedSet.has(tag);
          const dragType = isImage ? 'image-tag' : 'prompt-tag';
          return `
            <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagUI.escapeHtml(tag)}" data-group-id="${group.id}" draggable="true" data-drag-type="${dragType}">
              <span class="tag-name">${TagUI.escapeHtml(tag)}</span>
              <span class="tag-badge">${count}</span>
            </div>
          `;
        }).join('');

        html += '</div></div>';
      });

      // 渲染未分组标签
      const visibleUngroupedTags = ungroupedTags.filter(({ count }) => count > 0);
      if (visibleUngroupedTags.length > 0) {
        html += '<div class="tag-filter-group">';
        html += '<div class="tag-filter-group-title">未分组</div>';
        html += '<div class="tag-filter-group-content">';
        html += visibleUngroupedTags.map(({ tag, count }) => {
          const isActive = selectedSet.has(tag);
          const dragType = isImage ? 'image-tag' : 'prompt-tag';
          return `
            <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagUI.escapeHtml(tag)}" draggable="true" data-drag-type="${dragType}">
              <span class="tag-name">${TagUI.escapeHtml(tag)}</span>
              <span class="tag-badge">${count}</span>
            </div>
          `;
        }).join('');
        html += '</div></div>';
      }
    }

    return html;
  }

  // ========== 标签筛选头部 HTML ==========

  /**
   * 渲染标签筛选头部
   * @param {Object} options - 配置选项
   * @returns {boolean} 是否成功渲染
   */
  static renderFilterHeader(options) {
    const {
      containerId,
      specialTags,
      sortedTagsWithGroup,
      tagCounts = {},
      selectedTags,
      onTagClick,
      topGroupInfo = null,
      dragType = null
    } = options;

    const headerTagsEl = document.getElementById(containerId);
    if (!headerTagsEl) return false;

    const selectedSet = selectedTags instanceof Set ? selectedTags : new Set(selectedTags);
    const tagsToShow = [];

    // 特殊标签
    specialTags.forEach(({ tag, count }) => {
      const isActive = selectedSet.has(tag);
      tagsToShow.push({
        tag,
        count,
        className: isActive ? 'active' : '',
        isSpecial: true,
        isTopGroup: false
      });
    });

    // 优先级最高的标签组
    const groupMap = new Map();
    sortedTagsWithGroup.forEach(t => {
      const count = tagCounts[t.name] || 0;
      if (t.groupId) {
        if (!groupMap.has(t.groupId)) {
          groupMap.set(t.groupId, {
            groupId: t.groupId,
            groupName: t.groupName,
            groupType: t.groupType,
            groupSortOrder: t.groupSortOrder || 0,
            tags: []
          });
        }
        groupMap.get(t.groupId).tags.push({...t, count});
      }
    });

    const nonEmptyGroups = Array.from(groupMap.values())
      .filter(g => g.tags.length > 0)
      .sort((a, b) => a.groupSortOrder - b.groupSortOrder);

    let currentTopGroupInfo = topGroupInfo;
    if (nonEmptyGroups.length > 0) {
      currentTopGroupInfo = nonEmptyGroups[0];
      currentTopGroupInfo.tags.forEach(tagInfo => {
        if (tagInfo.count === 0) return;
        if (!tagsToShow.some(t => t.tag === tagInfo.name)) {
          const isActive = selectedSet.has(tagInfo.name);
          tagsToShow.push({
            tag: tagInfo.name,
            count: tagInfo.count,
            className: isActive ? 'active' : '',
            isSpecial: false,
            isTopGroup: true,
            isSingleSelect: currentTopGroupInfo.groupType === 'single'
          });
        }
      });
    }

    // 构建标签到组信息的映射，用于后续查找
    const tagToGroupMap = new Map();
    sortedTagsWithGroup.forEach(t => {
      if (t.groupId && !tagToGroupMap.has(t.name)) {
        tagToGroupMap.set(t.name, {
          groupId: t.groupId,
          groupType: t.groupType,
          groupSortOrder: t.groupSortOrder || 0
        });
      }
    });

    // 确定首位组ID
    const topGroupId = nonEmptyGroups.length > 0 ? nonEmptyGroups[0].groupId : null;

    // 选中的普通标签
    selectedSet.forEach(tag => {
      if (!tagsToShow.some(t => t.tag === tag) && !Constants.ALL_SPECIAL_TAGS.includes(tag)) {
        const count = tagCounts[tag] || 0;
        const groupInfo = tagToGroupMap.get(tag);
        const isInTopGroup = groupInfo && groupInfo.groupId === topGroupId;
        const isSingleSelect = groupInfo && groupInfo.groupType === 'single';

        tagsToShow.push({
          tag,
          count,
          className: 'active',
          isSpecial: false,
          isTopGroup: isInTopGroup,
          isSingleSelect: isSingleSelect
        });
      }
    });

    // 渲染 HTML
    if (tagsToShow.length === 0) {
      headerTagsEl.innerHTML = '<span class="tag-filter-empty">暂无标签</span>';
    } else {
      headerTagsEl.innerHTML = tagsToShow.map(({ tag, count, className, isSpecial, isTopGroup, isSingleSelect }) => {
        // 特殊标签不允许拖拽，普通标签允许拖拽
        const draggableAttr = (!isSpecial && dragType) ? 'draggable="true"' : '';
        const dragTypeAttr = (!isSpecial && dragType) ? `data-drag-type="${dragType}"` : '';

        return `
          <button class="tag-filter-item ${className || ''}" data-tag="${TagUI.escapeHtml(tag)}" data-is-special="${isSpecial}" data-is-top-group="${isTopGroup || false}" data-is-single-select="${isSingleSelect || false}" ${draggableAttr} ${dragTypeAttr}>
            <span class="tag-name">${TagUI.escapeHtml(tag)}</span>
            <span class="tag-badge">${count || 0}</span>
          </button>
        `;
      }).join('');
    }

    // 绑定点击事件
    if (onTagClick) {
      headerTagsEl.querySelectorAll('.tag-filter-item').forEach(el => {
        el.addEventListener('click', (e) => {
          const tag = el.dataset.tag;
          const isTopGroupTag = el.dataset.isTopGroup === 'true';
          const isSingleSelectGroup = el.dataset.isSingleSelect === 'true';
          onTagClick(tag, isTopGroupTag, isSingleSelectGroup, e);
        });
      });
    }

    // 绑定拖拽事件（只绑定非特殊标签）
    if (dragType) {
      headerTagsEl.querySelectorAll('.tag-filter-item[draggable="true"]').forEach(el => {
        el.addEventListener('dragstart', (e) => {
          const tag = el.dataset.tag;
          e.dataTransfer.setData('text/plain', tag);
          e.dataTransfer.setData('drag-source', dragType);
          e.dataTransfer.effectAllowed = 'copy';
          el.classList.add('dragging');
        });

        el.addEventListener('dragend', () => {
          el.classList.remove('dragging');
        });
      });
    }

    return true;
  }

  // ========== 通用标签列表 HTML ==========

  /**
   * 生成标签列表 HTML
   * @param {Array} tags - 标签数组
   * @param {string} tagClass - 标签元素的 CSS 类名
   * @param {string} emptyClass - 空标签状态的 CSS 类名
   * @returns {string} 标签列表 HTML 字符串
   */
  static generateTagsHtml(tags, tagClass, emptyClass) {
    const normalTags = tags ? tags.filter(tag => !Constants.ALL_SPECIAL_TAGS.includes(tag)) : [];

    if (normalTags.length === 0) {
      return `<span class="${tagClass} ${emptyClass}">无标签</span>`;
    }

    return normalTags.map(tag => {
      return `<span class="${tagClass}">${TagUI.escapeHtml(tag)}</span>`;
    }).join('');
  }

  /**
   * 生成可编辑标签列表 HTML
   * @param {Array} tags - 标签数组
   * @param {Object} options - 配置选项
   * @returns {string} HTML 字符串
   */
  static generateEditableTagsHtml(tags, options = {}) {
    const { onRemove, readonly = false } = options;
    const normalTags = tags ? tags.filter(tag => !Constants.ALL_SPECIAL_TAGS.includes(tag)) : [];

    if (normalTags.length === 0) {
      return '<span class="tag-empty">无标签</span>';
    }

    return normalTags.map(tag => {
      const removeBtn = readonly ? '' : `<button class="tag-remove" data-tag="${TagUI.escapeAttr(tag)}" title="移除">×</button>`;
      return `<span class="tag-badge editable">${TagUI.escapeHtml(tag)}${removeBtn}</span>`;
    }).join('');
  }

  /**
   * 生成备注 HTML
   * @param {string} note - 备注内容
   * @param {string} noteClass - 备注元素的 CSS 类名
   * @returns {string} 备注 HTML 字符串
   */
  static generateNoteHtml(note, noteClass) {
    if (!note || !note.trim()) return '';
    return `<div class="${noteClass}" title="${TagUI.escapeAttr(note)}">${TagUI.escapeHtml(note)}</div>`;
  }
}

export default TagUI;
