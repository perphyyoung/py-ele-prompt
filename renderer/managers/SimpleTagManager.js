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
   * @param {Function} options.showConfirm - 确认对话框方法 (title, message) => Promise<boolean>
   * @param {number} options.saveDelay - 防抖延迟（毫秒），默认 800
   */
  constructor(options) {
    this.tags = [];
    this.onSave = options.onSave;
    this.onRender = options.onRender;
    this.getTagsWithGroup = options.getTagsWithGroup;
    this.showConfirm = options.showConfirm;
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
      const { tags: newTags, hasViolation } = await SimpleTagManager.addTagWithViolationCheck(this.tags, tagName, tagsWithGroup);

      this.tags = newTags.filter(t => t && t.trim());
      this.onRender(this.tags);
      this.debounceSave();

      return { success: true, hasViolation };
    } catch (error) {
      console.error('Add tag error:', error);
      throw error;
    }
  }

  /**
   * 批量添加标签
   * @param {string[]} tagNames - 标签名称数组
   * @returns {Promise<{success: boolean, added: number, hasViolation: boolean}>}
   */
  async addTags(tagNames) {
    // 去重并过滤空标签
    const uniqueTags = [...new Set(tagNames.map(t => t.trim()).filter(t => t && !this.tags.includes(t)))];

    if (uniqueTags.length === 0) {
      throw new Error('该标签已存在');
    }

    try {
      let hasViolation = false;
      let currentTags = [...this.tags];
      const tagsWithGroup = await this.getTagsWithGroup();

      // 逐个添加并检查违单
      for (const tagName of uniqueTags) {
        const result = await SimpleTagManager.addTagWithViolationCheck(currentTags, tagName, tagsWithGroup);
        currentTags = result.tags;
        if (result.hasViolation) {
          hasViolation = true;
        }
      }

      // 过滤掉 null/undefined/空字符串
      this.tags = currentTags.filter(t => t && t.trim());
      this.onRender(this.tags);
      this.debounceSave();

      return { success: true, added: uniqueTags.length, hasViolation };
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
    if (this.showConfirm) {
      const confirmed = await this.showConfirm('确认删除标签', `确定要删除标签 "${tagName}" 吗？`);
      if (!confirmed) return false;
    }

    try {
      const tagsWithGroup = await this.getTagsWithGroup();
      const { tags: newTags, violationRemoved } = await SimpleTagManager.removeTagWithViolationCheck(this.tags, tagName, tagsWithGroup);

      this.tags = newTags.filter(t => t && t.trim());
      this.onRender(this.tags);
      this.debounceSave();

      return true;
    } catch (error) {
      console.error('Remove tag error:', error);
      throw error;
    }
  }

  /**
   * 防抖保存
   */
  debounceSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(async () => {
      try {
        await this.onSave(this.tags);
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
   * @returns {Promise<{tags: string[], hasViolation: boolean}>}
   */
  static async addTagWithViolationCheck(currentTags, newTag, tagsWithGroup) {
    let hasViolation = false;
    let newTags = [...currentTags];

    // 查找新标签所属的组
    const newTagGroup = tagsWithGroup.find(g => g.tags.includes(newTag));
    if (newTagGroup && newTagGroup.type === 'single') {
      // 如果是单选组，移除同组的其他标签
      newTags = newTags.filter(t => {
        const group = tagsWithGroup.find(g => g.tags.includes(t));
        return !(group && group.id === newTagGroup.id);
      });
      hasViolation = true;
    }

    newTags.push(newTag);
    return { tags: newTags, hasViolation };
  }

  /**
   * 删除标签时的违规检查
   * @param {string[]} currentTags - 当前标签列表
   * @param {string} tagToRemove - 要删除的标签
   * @param {Array} tagsWithGroup - 标签及其组信息
   * @returns {Promise<{tags: string[], violationRemoved: boolean}>}
   */
  static async removeTagWithViolationCheck(currentTags, tagToRemove, tagsWithGroup) {
    let violationRemoved = false;
    let newTags = [...currentTags];

    // 查找要删除的标签所属的组
    const tagGroup = tagsWithGroup.find(g => g.tags.includes(tagToRemove));
    if (tagGroup && tagGroup.type === 'single') {
      violationRemoved = true;
    }

    // 移除标签
    newTags = newTags.filter(t => t !== tagToRemove);

    return { tags: newTags, violationRemoved };
  }
}
