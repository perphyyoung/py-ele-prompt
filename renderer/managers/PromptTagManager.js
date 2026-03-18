/**
 * 提示词标签管理器
 */
import { TagManagerBase } from './TagManagerBase.js';
import { Constants } from '../constants.js';

export class PromptTagManager extends TagManagerBase {
  /**
   * @param {Object} context - PromptManager实例
   */
  constructor(context) {
    super({
      type: 'prompt',
      containerId: 'promptTagGroupCards',
      emptyStateId: 'promptTagManagerEmpty',
      searchInputId: 'tagManagerSearchInput',
      getTags: () => window.electronAPI.getPromptTags(),
      getTagsWithGroup: () => window.electronAPI.getPromptTagsWithGroup(),
      getGroups: () => window.electronAPI.getPromptTagGroups(),
      specialTags: [...Constants.PROMPT_SPECIAL_TAGS],
      assignTagToGroup: (tag, groupId) => window.electronAPI.assignPromptTagToBelongGroup(tag, groupId),
      renameTag: (oldTag, newTag) => window.electronAPI.renamePromptTag(oldTag, newTag),
      deleteTag: (tag) => window.electronAPI.deletePromptTag(tag),
      deleteGroup: (groupId) => window.electronAPI.deletePromptTagGroup(groupId),
      addTag: (tag) => window.electronAPI.addPromptTag(tag),
      refreshCallback: async () => {
        await context.promptPanelManager.loadPrompts();
        context.promptPanelManager.renderTagFilters();
      }
    }, context);
    this.context = context;
  }

  /**
   * 计算标签数量（提示词特定）
   * @param {Array} tags - 所有标签
   * @returns {Object} 包含visibleItems, tagCounts, specialTags的对象
   */
  async calculateTagCounts(tags) {
    const visiblePrompts = this.context.viewMode === 'safe'
      ? this.context.prompts.filter(p => p.isSafe !== 0)
      : this.context.prompts;

    const tagCounts = {};
    visiblePrompts.forEach(prompt => {
      if (prompt.tags && prompt.tags.length > 0) {
        prompt.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    const specialTags = [...Constants.PROMPT_SPECIAL_TAGS];
    if (this.context.viewMode === 'nsfw') {
      specialTags.push(Constants.SAFE_TAG, Constants.UNSAFE_TAG);
    }

    tagCounts[Constants.FAVORITE_TAG] = visiblePrompts.filter(p => p.isFavorite).length;
    tagCounts[Constants.MULTI_IMAGE_TAG] = visiblePrompts.filter(p => p.images && p.images.length >= 2).length;
    tagCounts[Constants.NO_IMAGE_TAG] = visiblePrompts.filter(p => !p.images || p.images.length === 0).length;
    tagCounts[Constants.VIOLATING_TAG] = visiblePrompts.filter(p => p.isViolating).length;
    tagCounts[Constants.NO_TAG_TAG] = visiblePrompts.filter(p => !p.tags || p.tags.length === 0).length;

    if (this.context.viewMode === 'nsfw') {
      tagCounts[Constants.SAFE_TAG] = visiblePrompts.filter(p => p.isSafe !== 0).length;
      tagCounts[Constants.UNSAFE_TAG] = visiblePrompts.filter(p => p.isSafe === 0).length;
    }

    return { visibleItems: visiblePrompts, tagCounts, specialTags };
  }
}
