import { Constants } from '../../constants.js';

/**
 * 标签渲染器
 * 提供通用的标签渲染方法，供 PromptPanelManager 和 ImagePanelManager 共用
 */
export class TagRenderer {
  /**
   * HTML 转义
   * @param {string} text - 要转义的文本
   * @returns {string} 转义后的 HTML 字符串
   */
  static escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 转义 HTML 属性值
   * @param {string} text - 要转义的文本
   * @returns {string} 转义后的属性值
   */
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

  /**
   * 获取普通标签（过滤所有特殊标签）
   * @param {string[]} tags - 原始标签数组
   * @returns {string[]} 过滤后的普通标签
   */
  static getNormalTags(tags) {
    return tags ? tags.filter(tag => !Constants.ALL_SPECIAL_TAGS.includes(tag)) : [];
  }

  /**
   * 生成标签列表 HTML
   * @param {Array} tags - 标签数组
   * @param {string} tagClass - 标签元素的 CSS 类名
   * @param {string} emptyClass - 空标签状态的 CSS 类名
   * @returns {string} 标签列表 HTML 字符串
   */
  static generateTagsHtml(tags, tagClass, emptyClass) {
    const normalTags = TagRenderer.getNormalTags(tags);

    if (normalTags.length === 0) {
      return `<span class="${tagClass} ${emptyClass}">无标签</span>`;
    }

    return normalTags.map(tag => {
      return `<span class="${tagClass}">${TagRenderer.escapeHtml(tag)}</span>`;
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
    return `<div class="${noteClass}" title="${TagRenderer.escapeAttr(note)}">${TagRenderer.escapeHtml(note)}</div>`;
  }

  /**
   * 生成标签管理器项 HTML
   * @param {string} tag - 标签名称
   * @param {number} count - 标签计数
   * @param {number|null} groupId - 组 ID
   * @param {boolean} isSpecial - 是否为特殊标签
   * @returns {string} HTML 字符串
   */
  static generateTagManagerItemHtml(tag, count, groupId = null, isSpecial = false) {
    const tagHtml = TagRenderer.escapeHtml(tag);
    const groupIdAttr = groupId !== null ? `data-group-id="${groupId}"` : '';
    
    if (isSpecial) {
      return `
        <div class="tag-manager-item special-tag-in-card" data-tag="${tagHtml}">
          <span class="tag-badge-special">${tagHtml}</span>
          <div class="tag-manager-item-name">${tagHtml}</div>
          <span class="tag-badge">${count}</span>
        </div>
      `;
    }

    return `
      <div class="tag-manager-item tag-in-card" data-tag="${tagHtml}" ${groupIdAttr} draggable="true">
        <div class="tag-manager-item-left">
          <button class="tag-badge-btn tag-badge-delete" data-tag="${tagHtml}" title="删除">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <button class="tag-badge-btn tag-badge-edit" data-tag="${tagHtml}" title="编辑">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        </div>
        <div class="tag-manager-item-name">${tagHtml}</div>
        <span class="tag-badge">${count}</span>
      </div>
    `;
  }

  /**
   * 生成特殊标签卡片 HTML
   * @param {string[]} specialTags - 特殊标签列表
   * @param {Object} tagCounts - 标签计数对象
   * @returns {string} HTML 字符串
   */
  static generateSpecialTagCardHtml(specialTags, tagCounts) {
    if (!specialTags || specialTags.length === 0) return '';

    const itemsHtml = specialTags.map(tag => {
      return TagRenderer.generateTagManagerItemHtml(tag, tagCounts[tag] || 0, null, true);
    }).join('');

    return `
      <div class="tag-group-card special-tag-card" data-drop-target="true">
        <div class="tag-group-card-header">
          <span class="tag-group-card-name">特殊标签</span>
        </div>
        <div class="tag-group-card-content">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  /**
   * 生成未分组标签卡片 HTML
   * @param {Array} ungroupedTags - 未分组标签列表
   * @param {Object} tagCounts - 标签计数对象
   * @returns {string} HTML 字符串
   */
  static generateUngroupedCardHtml(ungroupedTags, tagCounts) {
    const visibleTags = ungroupedTags.filter(({ count }) => count > 0);
    if (visibleTags.length === 0) return '';

    const itemsHtml = visibleTags.map(({ tag }) => {
      return TagRenderer.generateTagManagerItemHtml(tag, tagCounts[tag] || 0, null, false);
    }).join('');

    return `
      <div class="tag-group-card ungrouped-card" data-drop-target="true">
        <div class="tag-group-card-header">
          <span class="tag-group-card-name">未分组</span>
        </div>
        <div class="tag-group-card-content">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  /**
   * 生成标签组卡片 HTML
   * @param {Object} group - 标签组信息
   * @param {Array} tags - 组内标签列表
   * @param {Object} tagCounts - 标签计数对象
   * @param {boolean} isFirst - 是否为首组
   * @returns {string} HTML 字符串
   */
  static generateTagGroupCardHtml(group, tags, tagCounts, isFirst = false) {
    const visibleTags = tags.filter(tag => (tagCounts[tag] || 0) > 0);
    
    const itemsHtml = visibleTags.map(tag => {
      return TagRenderer.generateTagManagerItemHtml(tag, tagCounts[tag] || 0, group.id, false);
    }).join('');

    const firstGroupBadge = isFirst ? '<span class="tag-group-card-badge" title="首位组">首位组</span>' : '';
    const groupTypeText = group.type === 'single' ? '单选' : '多选';

    return `
      <div class="tag-group-card" data-group-id="${group.id}" data-drop-target="true">
        <div class="tag-group-card-header">
          <span class="tag-group-card-name">${TagRenderer.escapeHtml(group.name)}</span>
          ${firstGroupBadge}
          <span class="tag-group-card-type">${groupTypeText}</span>
        </div>
        <div class="tag-group-card-content">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  /**
   * 渲染标签筛选器
   * @param {Array} tags - 标签及其组信息
   * @param {Object} counts - 标签计数
   * @param {Object} options - 配置选项
   * @returns {string} HTML 字符串
   */
  static renderTagFilters(tags, counts, options) {
    const { specialTags, selectedTags, selectedImageTags, groups, isImage = false } = options;
    
    let html = '';
    
    // 渲染特殊标签
    if (specialTags && specialTags.length > 0) {
      const selectedSet = isImage ? new Set(selectedImageTags || []) : new Set(selectedTags || []);
      
      html += specialTags.map(({ tag, count }) => {
        const isActive = selectedSet.has(tag);
        return `
          <button class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagRenderer.escapeHtml(tag)}" data-is-special="true">
            <span class="tag-name">${TagRenderer.escapeHtml(tag)}</span>
            <span class="tag-badge">${count}</span>
          </button>
        `;
      }).join('');
    }

    // 渲染普通标签（分组）
    if (groups && groups.length > 0) {
      const groupedTags = {};
      const ungroupedTags = [];
      
      // 按组组织标签（过滤特殊标签）
      groups.forEach(group => {
        groupedTags[group.name] = { group, tags: [] };
      });
      
      tags.forEach(({ name: tag }) => {
        // 过滤特殊标签
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
        html += `<div class="tag-filter-group">`;
        html += `<div class="tag-filter-group-title">${TagRenderer.escapeHtml(group.name)} <span class="tag-filter-group-type">${groupTypeText}</span></div>`;
        html += '<div class="tag-filter-group-content">';
        
        const selectedSet = isImage ? new Set(selectedImageTags || []) : new Set(selectedTags || []);
        html += visibleTags.map(({ tag, count }) => {
          const isActive = selectedSet.has(tag);
          const dragType = isImage ? 'image-tag' : 'prompt-tag';
          return `
            <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagRenderer.escapeHtml(tag)}" draggable="true" data-drag-type="${dragType}">
              <span class="tag-name">${TagRenderer.escapeHtml(tag)}</span>
              <span class="tag-badge">${count}</span>
            </div>
          `;
        }).join('');
        
        html += '</div></div>';
      });
      
      // 渲染未分组标签
      const visibleUngroupedTags = ungroupedTags.filter(({ count }) => count > 0);
      if (visibleUngroupedTags.length > 0) {
        const selectedSet = isImage ? new Set(selectedImageTags || []) : new Set(selectedTags || []);
        html += '<div class="tag-filter-group">';
        html += '<div class="tag-filter-group-title">未分组</div>';
        html += '<div class="tag-filter-group-content">';
        html += visibleUngroupedTags.map(({ tag, count }) => {
          const isActive = selectedSet.has(tag);
          const dragType = isImage ? 'image-tag' : 'prompt-tag';
          return `
            <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagRenderer.escapeHtml(tag)}" draggable="true" data-drag-type="${dragType}">
              <span class="tag-name">${TagRenderer.escapeHtml(tag)}</span>
              <span class="tag-badge">${count}</span>
            </div>
          `;
        }).join('');
        html += '</div></div>';
      }
    }
    
    return html;
  }
}

export default TagRenderer;
