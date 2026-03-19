import { Constants } from '../../constants.js';

/**
 * 标签 HTML 生成器
 * 提供通用的标签 HTML 生成方法
 */
export class TagHtmlGenerator {
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
    const normalTags = TagHtmlGenerator.getNormalTags(tags);

    if (normalTags.length === 0) {
      return `<span class="${tagClass} ${emptyClass}">无标签</span>`;
    }

    return normalTags.map(tag => {
      return `<span class="${tagClass}">${TagHtmlGenerator.escapeHtml(tag)}</span>`;
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
    return `<div class="${noteClass}" title="${TagHtmlGenerator.escapeAttr(note)}">${TagHtmlGenerator.escapeHtml(note)}</div>`;
  }

  /**
   * 生成标签筛选器 HTML
   * @param {Array} tags - 标签及其组信息
   * @param {Object} counts - 标签计数
   * @param {Object} options - 配置选项
   * @returns {string} HTML 字符串
   */
  static generateTagFiltersHtml(tags, counts, options) {
    const { specialTags, selectedTags, groups, isImage = false } = options;

    let html = '';

    // selectedTags 必须是 Set 类型
    const selectedSet = selectedTags instanceof Set ? selectedTags : new Set();

    // 渲染特殊标签
    if (specialTags && specialTags.length > 0) {
      html += specialTags.map(({ tag, count }) => {
        const isActive = selectedSet.has(tag);
        const dragType = isImage ? 'image-tag' : 'prompt-tag';
        return `
          <button class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagHtmlGenerator.escapeHtml(tag)}" data-is-special="true" draggable="true" data-drag-type="${dragType}">
            <span class="tag-name">${TagHtmlGenerator.escapeHtml(tag)}</span>
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
        html += `<div class="tag-filter-group-title">${TagHtmlGenerator.escapeHtml(group.name)} <span class="tag-filter-group-type">${groupTypeText}</span></div>`;
        html += '<div class="tag-filter-group-content">';

        html += visibleTags.map(({ tag, count }) => {
          const isActive = selectedSet.has(tag);
          const dragType = isImage ? 'image-tag' : 'prompt-tag';
          return `
            <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagHtmlGenerator.escapeHtml(tag)}" draggable="true" data-drag-type="${dragType}">
              <span class="tag-name">${TagHtmlGenerator.escapeHtml(tag)}</span>
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
            <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${TagHtmlGenerator.escapeHtml(tag)}" draggable="true" data-drag-type="${dragType}">
              <span class="tag-name">${TagHtmlGenerator.escapeHtml(tag)}</span>
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

export default TagHtmlGenerator;
