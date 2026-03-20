import { Constants } from '../constants.js';

/**
 * 标签服务 - 数据层
 * 封装所有标签相关的 API 调用
 */
export class TagService {
  /**
   * @param {string} type - 类型 ('prompt' | 'image')
   */
  constructor(type) {
    this.type = type;
    this.isPrompt = type === 'prompt';
  }

  // ========== 标签 API ==========

  async getTags() {
    return this.isPrompt
      ? await window.electronAPI.getPromptTags()
      : await window.electronAPI.getImageTags();
  }

  async getTagsWithGroup() {
    return this.isPrompt
      ? await window.electronAPI.getPromptTagsWithGroup()
      : await window.electronAPI.getImageTagsWithGroup();
  }

  async addTag(tag) {
    return this.isPrompt
      ? await window.electronAPI.addPromptTag(tag)
      : await window.electronAPI.addImageTag(tag);
  }

  async renameTag(oldTag, newTag) {
    return this.isPrompt
      ? await window.electronAPI.renamePromptTag(oldTag, newTag)
      : await window.electronAPI.renameImageTag(oldTag, newTag);
  }

  async deleteTag(tag) {
    return this.isPrompt
      ? await window.electronAPI.deletePromptTag(tag)
      : await window.electronAPI.deleteImageTag(tag);
  }

  async assignTagToGroup(tag, groupId) {
    return this.isPrompt
      ? await window.electronAPI.assignPromptTagToBelongGroup(tag, groupId)
      : await window.electronAPI.assignImageTagToBelongGroup(tag, groupId);
  }

  // ========== 标签组 API ==========

  async getGroups() {
    return this.isPrompt
      ? await window.electronAPI.getPromptTagGroups()
      : await window.electronAPI.getImageTagGroups();
  }

  async createGroup(name, groupType, sortOrder) {
    return this.isPrompt
      ? await window.electronAPI.createPromptTagGroup(name, groupType, sortOrder)
      : await window.electronAPI.createImageTagGroup(name, groupType, sortOrder);
  }

  async updateGroup(groupId, attrs) {
    return this.isPrompt
      ? await window.electronAPI.updatePromptTagGroupAttrs(groupId, attrs)
      : await window.electronAPI.updateImageTagGroupAttrs(groupId, attrs);
  }

  async deleteGroup(groupId) {
    return this.isPrompt
      ? await window.electronAPI.deletePromptTagGroup(groupId)
      : await window.electronAPI.deleteImageTagGroup(groupId);
  }

  // ========== 特殊标签配置 ==========

  getSpecialTags() {
    return this.isPrompt
      ? [...Constants.PROMPT_SPECIAL_TAGS]
      : [...Constants.IMAGE_SPECIAL_TAGS];
  }

  getSpecialTagChecks() {
    if (this.isPrompt) {
      return new Map([
        [Constants.FAVORITE_TAG, (p) => p.isFavorite],
        [Constants.MULTI_IMAGE_TAG, (p) => p.images && p.images.length >= 2],
        [Constants.NO_IMAGE_TAG, (p) => !p.images || p.images.length === 0],
        [Constants.VIOLATING_TAG, (p) => p.isViolating],
        [Constants.NO_TAG_TAG, (p) => !p.tags || p.tags.length === 0],
        [Constants.SAFE_TAG, (p) => p.isSafe !== 0],
        [Constants.UNSAFE_TAG, (p) => p.isSafe === 0]
      ]);
    } else {
      return new Map([
        [Constants.FAVORITE_TAG, (img) => img.isFavorite],
        [Constants.UNREFERENCED_TAG, (img) => !img.promptRefs || img.promptRefs.length === 0],
        [Constants.MULTI_REF_TAG, (img) => img.promptRefs && img.promptRefs.length > 1],
        [Constants.VIOLATING_TAG, (img) => img.isViolating],
        [Constants.NO_TAG_TAG, (img) => !img.tags || img.tags.length === 0],
        [Constants.SAFE_TAG, (img) => img.isSafe !== 0],
        [Constants.UNSAFE_TAG, (img) => img.isSafe === 0]
      ]);
    }
  }

  // ========== 通用标签组 API（不区分类型）==========

}

export default TagService;
