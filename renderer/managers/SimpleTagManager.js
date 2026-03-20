import { Constants } from '../constants.js';
import { DialogService, DialogConfig } from '../services/DialogService.js';

/**
 * 简化版标签管理器（用于编辑界面）
 * 负责管理单个目标的标签，支持防抖保存和违规检查
 */
export class SimpleTagManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Function} options.onSave - 保存回调 (tags) => Promise<void>
   * @param {Function} options.onRender - 渲染回调 (tags) => void
   * @param {Function} options.getTagsWithGroup - 获取标签及其组信息的方法 () => Promise<Array>
   * @param {Function} options.showConfirmDialogByConfig - 确认对话框方法 (config) => Promise<boolean>
   * @param {number} options.saveDelay - 防抖延迟（毫秒），默认 800
   */
  constructor(options) {
    this.tags = [];
    this.onSave = options.onSave;
    this.onRender = options.onRender;
    this.getTagsWithGroup = options.getTagsWithGroup;
    this.saveDelay = options.saveDelay || 800;
    this.saveTimer = null;
  }

  /**
   * 获取当前标签列表
   * @returns {string[]} - 标签列表副本
   */
  getTags() {
    return [...this.tags];
  }

  /**
   * 设置标签列表（初始化用）
   * @param {string[]} tags - 标签列表
   */
  setTags(tags) {
    this.tags = [...(tags || [])].filter(t => t && t.trim());
    this.onRender(this.tags);
  }

  /**
   * 添加单个标签
   * @param {string} tagName - 标签名称
   * @returns {Promise<Object>} - { success: boolean, hasViolation: boolean }
   */
  async addTag(tagName) {
    tagName = tagName.trim();
    if (!tagName) {
      throw new Error('标签名称不能为空');
    }
    if (this.tags.includes(tagName)) {
      throw new Error('该标签已存在');
    }

    try {
      const tagsWithGroup = await this.getTagsWithGroup();
      const { tags: newTags, hasViolation, violationGroup } = await SimpleTagManager.addTagWithViolationCheck(this.tags, tagName, tagsWithGroup);

      this.tags = newTags.filter(t => t && t.trim());
      this.onRender(this.tags);
      this.debounceSave({ action: 'add', hasViolation, violationGroup });

      return { success: true, hasViolation, violationGroup };
    } catch (error) {
      console.error('Add tag error:', error);
      throw error;
    }
  }

  /**
   * 批量添加标签
   * @param {string[]} tagNames - 标签名称数组
   * @returns {Promise<{success: boolean, added: number, hasViolation: boolean, violationGroups: string[]}>}
   */
  async addTags(tagNames) {
    // 去重并过滤空标签
    const uniqueTags = [...new Set(tagNames.map(t => t.trim()).filter(t => t && !this.tags.includes(t)))];

    if (uniqueTags.length === 0) {
      throw new Error('该标签已存在');
    }

    try {
      let hasViolation = false;
      const violationGroups = [];
      let currentTags = [...this.tags];
      const tagsWithGroup = await this.getTagsWithGroup();

      // 逐个添加并检查违单
      for (const tagName of uniqueTags) {
        const result = await SimpleTagManager.addTagWithViolationCheck(currentTags, tagName, tagsWithGroup);
        currentTags = result.tags;
        if (result.hasViolation && result.violationGroup) {
          hasViolation = true;
          if (!violationGroups.includes(result.violationGroup)) {
            violationGroups.push(result.violationGroup);
          }
        }
      }

      // 过滤掉 null/undefined/空字符串
      this.tags = currentTags.filter(t => t && t.trim());
      this.onRender(this.tags);
      const violationGroup = violationGroups.length > 0 ? violationGroups.join(', ') : null;
      this.debounceSave({ action: 'add', hasViolation, violationGroup });

      return { success: true, added: uniqueTags.length, hasViolation, violationGroups };
    } catch (error) {
      console.error('Add tags error:', error);
      throw error;
    }
  }

  /**
   * 删除标签
   * @param {string} tagName - 标签名称
   * @returns {Promise<boolean>}
   */
  async removeTag(tagName) {
    tagName = tagName.trim();
    if (!tagName) {
      throw new Error('标签名称不能为空');
    }
    if (!this.tags.includes(tagName)) {
      throw new Error('标签不存在');
    }

    // 显示确认对话框
    const confirmed = await DialogService.showConfirmDialogByConfig({
      ...DialogConfig.DELETE_TAG,
      data: { name: tagName }
    });
    if (!confirmed) return false;

    try {
      const tagsWithGroup = await this.getTagsWithGroup();
      const { tags: newTags, violationRemoved } = await SimpleTagManager.removeTagWithViolationCheck(this.tags, tagName, tagsWithGroup);

      this.tags = newTags.filter(t => t && t.trim());
      this.onRender(this.tags);
      this.debounceSave({ action: 'remove' });

      return true;
    } catch (error) {
      console.error('Remove tag error:', error);
      throw error;
    }
  }

  /**
   * 防抖保存
   * @param {Object} options - 保存选项
   */
  debounceSave(options = {}) {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(async () => {
      try {
        await this.onSave(this.tags, options);
      } catch (error) {
        console.error('Failed to save tags:', error);
      }
    }, this.saveDelay);
  }

  /**
   * 添加标签时的违规检查
   * @param {string[]} currentTags - 当前标签列表
   * @param {string} newTag - 新标签
   * @param {Array} tagsWithGroup - 标签及其组信息
   * @returns {Promise<{tags: string[], hasViolation: boolean, violationGroup: string}>}
   */
  static async addTagWithViolationCheck(currentTags, newTag, tagsWithGroup) {
    let hasViolation = false;
    let violationGroup = null;
    let newTags = [...currentTags];

    // 检查是否为违单标签（禁止手动添加）
    if (newTag === Constants.VIOLATING_TAG) {
      throw new Error(`"${Constants.VIOLATING_TAG}" 是系统保留标签，不能手动添加`);
    }

    // 查找新标签所属的组
    const newTagGroup = tagsWithGroup.find(g => g.tags.includes(newTag));
    if (newTagGroup && newTagGroup.type === 'single') {
      // 检查是否已有同组标签
      const hasSameGroupTag = newTags.some(t => {
        const group = tagsWithGroup.find(g => g.tags.includes(t));
        return group && group.id === newTagGroup.id;
      });
      if (hasSameGroupTag) {
        hasViolation = true;
        violationGroup = newTagGroup.name;
      }
    }

    newTags.push(newTag);

    // 如果存在单选组冲突，自动添加违单标签
    if (hasViolation && !newTags.includes(Constants.VIOLATING_TAG)) {
      newTags.push(Constants.VIOLATING_TAG);
    }

    return { tags: newTags, hasViolation, violationGroup };
  }

  /**
   * 删除标签时的违规检查
   * @param {string[]} currentTags - 当前标签列表
   * @param {string} tagToRemove - 要删除的标签
   * @param {Array} tagsWithGroup - 标签及其组信息
   * @returns {Promise<{tags: string[], violationRemoved: boolean}>}
   */
  static async removeTagWithViolationCheck(currentTags, tagToRemove, tagsWithGroup) {
    let newTags = [...currentTags];

    // 检查是否为违单标签（禁止手动删除）
    if (tagToRemove === Constants.VIOLATING_TAG) {
      throw new Error(`"${Constants.VIOLATING_TAG}" 标签不能手动删除，请解决单选组冲突后自动移除`);
    }

    // 移除标签
    newTags = newTags.filter(t => t !== tagToRemove);

    // 检查是否还存在单选组冲突
    let hasViolation = false;
    const singleGroups = tagsWithGroup.filter(g => g.type === 'single');

    for (const group of singleGroups) {
      const groupTagsInCurrent = newTags.filter(t => group.tags.includes(t));
      if (groupTagsInCurrent.length > 1) {
        hasViolation = true;
        break;
      }
    }

    // 如果不存在冲突了，移除违单标签
    let violationRemoved = false;
    if (!hasViolation && newTags.includes(Constants.VIOLATING_TAG)) {
      newTags = newTags.filter(tag => tag !== Constants.VIOLATING_TAG);
      violationRemoved = true;
    }

    return { tags: newTags, violationRemoved };
  }
}
