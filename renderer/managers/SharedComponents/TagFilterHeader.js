import { TagHtmlGenerator } from './TagHtmlGenerator.js';

/**
 * 标签筛选头部
 * 用于在标签筛选区收起时显示摘要标签
 */
export class TagFilterHeader {
  /**
   * 渲染标签筛选头部
   * @param {Object} options - 配置选项
   * @param {string} options.containerId - 容器元素ID
   * @param {Array} options.specialTags - 特殊标签列表 [{tag, count}]
   * @param {Array} options.sortedTagsWithGroup - 排序后的标签列表
   * @param {Object} options.tagCounts - 标签计数对象 {tagName: count}
   * @param {Set|Array} options.selectedTags - 选中的标签集合或数组
   * @param {Function} options.onTagClick - 标签点击回调函数 (tag, isTopGroupTag, isSingleSelectGroup) => void
   * @param {Object} options.topGroupInfo - 顶级组信息（可选，用于事件处理）
   * @param {string} options.dragType - 拖拽类型（可选，'prompt-tag' 或 'image-tag'）
   * @returns {boolean} 是否成功渲染
   */
  static render(options) {
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

    // 1. 所有特殊标签
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

    // 2. 优先级最高的标签组的所有标签（按 sortOrder 字段排序，取最小的）
    // 先按组分组（包含所有有 groupId 的标签，不管 count 是多少）
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

    // 过滤出有标签（tags.length > 0）的组，然后按 groupSortOrder 排序
    const nonEmptyGroups = Array.from(groupMap.values())
      .filter(g => g.tags.length > 0)
      .sort((a, b) => a.groupSortOrder - b.groupSortOrder);

    // 保存顶级组信息供事件处理使用
    let currentTopGroupInfo = topGroupInfo;
    if (nonEmptyGroups.length > 0) {
      currentTopGroupInfo = nonEmptyGroups[0];

      // 获取该组的所有标签（只显示 count > 0 的标签）
      currentTopGroupInfo.tags.forEach(tagInfo => {
        // 跳过计数为0的标签
        if (tagInfo.count === 0) return;
        // 避免重复添加
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

    // 3. 所有选中的普通标签（可能包含其他组的）
    selectedSet.forEach(tag => {
      // 排除已经在列表中的
      if (!tagsToShow.some(t => t.tag === tag)) {
        // 查找标签数量（先在特殊标签中查找，再从 tagCounts 中查找）
        let count = 0;
        const specialTagInfo = specialTags.find(t => t.tag === tag);
        if (specialTagInfo) {
          count = specialTagInfo.count;
        } else {
          count = tagCounts[tag] || 0;
        }
        tagsToShow.push({
          tag,
          count,
          className: 'active',
          isSpecial: false,
          isTopGroup: false
        });
      }
    });

    // 渲染标签
    if (tagsToShow.length === 0) {
      headerTagsEl.innerHTML = '<span class="tag-filter-empty">暂无标签</span>';
    } else {
      headerTagsEl.innerHTML = tagsToShow.map(({ tag, count, className, isSpecial, isTopGroup, isSingleSelect }) => {
        // 特殊标签不允许拖拽，普通标签允许拖拽
        const draggableAttr = (!isSpecial && dragType) ? 'draggable="true"' : '';
        const dragTypeAttr = (!isSpecial && dragType) ? `data-drag-type="${dragType}"` : '';
        return `
          <button class="tag-filter-item ${className || ''}" data-tag="${TagHtmlGenerator.escapeHtml(tag)}" data-is-special="${isSpecial}" data-is-top-group="${isTopGroup || false}" data-is-single-select="${isSingleSelect || false}" ${draggableAttr} ${dragTypeAttr}>
            <span class="tag-name">${TagHtmlGenerator.escapeHtml(tag)}</span>
            <span class="tag-badge">${count || 0}</span>
          </button>
        `;
      }).join('');

      // 绑定点击事件
      if (onTagClick) {
        headerTagsEl.querySelectorAll('.tag-filter-item').forEach(item => {
          item.addEventListener('click', (e) => {
            const tag = item.dataset.tag;
            const isTopGroupTag = item.dataset.isTopGroup === 'true';
            const isSingleSelectGroup = item.dataset.isSingleSelect === 'true';
            onTagClick(tag, isTopGroupTag, isSingleSelectGroup, currentTopGroupInfo);
          });
        });
      }

      // 绑定拖拽事件（只绑定非特殊标签）
      if (dragType) {
        headerTagsEl.querySelectorAll('.tag-filter-item[draggable="true"]').forEach(item => {
          item.addEventListener('dragstart', (e) => {
            const tag = item.dataset.tag;
            e.dataTransfer.setData('text/plain', tag);
            e.dataTransfer.setData('drag-source', dragType);
            e.dataTransfer.effectAllowed = 'copy';
            item.classList.add('dragging');
          });

          item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
          });
        });
      }
    }

    return true;
  }
}

export default TagFilterHeader;
