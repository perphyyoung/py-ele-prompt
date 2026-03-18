/**
 * 图像标签管理器
 */
import { TagManagerBase } from './TagManagerBase.js';
import { Constants } from '../constants.js';

export class ImageTagManager extends TagManagerBase {
  /**
   * @param {Object} context - PromptManager实例
   */
  constructor(context) {
    super({
      type: 'image',
      containerId: 'imageTagGroupCards',
      emptyStateId: 'imageTagManagerEmpty',
      searchInputId: 'imageTagManagerSearchInput',
      getTags: () => window.electronAPI.getImageTags(),
      getTagsWithGroup: () => window.electronAPI.getImageTagsWithGroup(),
      getGroups: () => window.electronAPI.getImageTagGroups(),
      specialTags: [...Constants.IMAGE_SPECIAL_TAGS],
      assignTagToGroup: (tag, groupId) => window.electronAPI.assignImageTagToBelongGroup(tag, groupId),
      renameTag: (oldTag, newTag) => window.electronAPI.renameImageTag(oldTag, newTag),
      deleteTag: (tag) => window.electronAPI.deleteImageTag(tag),
      deleteGroup: (groupId) => window.electronAPI.deleteImageTagGroup(groupId),
      addTag: (tag) => window.electronAPI.addImageTag(tag),
      updateGroup: (groupId, attrs) => window.electronAPI.updateImageTagGroup(groupId, attrs),
      refreshCallback: async () => {
        await context.imagePanelManager.loadImages();
        context.imagePanelManager.renderTagFilters();
      }
    }, context);
    this.context = context;
  }

  /**
   * 计算标签数量（图像特定）
   * @param {Array} tags - 所有标签
   * @returns {Object} 包含visibleItems, tagCounts, specialTags的对象
   */
  async calculateTagCounts(tags) {
    const visibleImages = this.context.viewMode === 'safe'
      ? this.context.images.filter(img => img.isSafe !== 0)
      : this.context.images;

    const tagCounts = {};
    visibleImages.forEach(image => {
      if (image.tags && image.tags.length > 0) {
        image.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    const specialTags = [...Constants.IMAGE_SPECIAL_TAGS];
    if (this.context.viewMode === 'nsfw') {
      specialTags.push(Constants.SAFE_TAG, Constants.UNSAFE_TAG);
    }

    tagCounts[Constants.FAVORITE_TAG] = visibleImages.filter(img => img.isFavorite).length;
    tagCounts[Constants.UNREFERENCED_TAG] = visibleImages.filter(img => !img.promptRefs || img.promptRefs.length === 0).length;
    tagCounts[Constants.MULTI_REF_TAG] = visibleImages.filter(img => img.promptRefs && img.promptRefs.length > 1).length;
    tagCounts[Constants.VIOLATING_TAG] = visibleImages.filter(img => img.isViolating).length;
    tagCounts[Constants.NO_TAG_TAG] = visibleImages.filter(img => !img.tags || img.tags.length === 0).length;

    if (this.context.viewMode === 'nsfw') {
      tagCounts[Constants.SAFE_TAG] = visibleImages.filter(img => img.isSafe !== 0).length;
      tagCounts[Constants.UNSAFE_TAG] = visibleImages.filter(img => img.isSafe === 0).length;
    }

    return { visibleItems: visibleImages, tagCounts, specialTags };
  }
}
