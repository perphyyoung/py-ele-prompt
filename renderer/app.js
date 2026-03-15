/**
 * Hover Tooltip 管理器
 * 通用 hover 预览组件，支持渐进式图像加载
 */
class HoverTooltipManager {
  /**
   * @param {string} tooltipId - tooltip 元素 ID
   * @param {string} contentId - 内容元素 ID
   * @param {string} imageId - 图像元素 ID
   */
  constructor(tooltipId, contentId, imageId) {
    this.tooltip = document.getElementById(tooltipId);
    this.contentEl = document.getElementById(contentId);
    this.imageEl = document.getElementById(imageId);
    this.imagePathCache = new Map();
    this.hoverTimer = null;
    this.currentElement = null;

    if (!this.tooltip || !this.contentEl || !this.imageEl) {
      console.error('HoverTooltipManager: Required elements not found');
    }
  }

  /**
   * 加载图像路径（带缓存）
   * @param {string} imageId - 图像 ID
   * @returns {Promise<{thumbnailPath: string|null, originalPath: string|null}>}
   */
  async loadImagePaths(imageId) {
    let thumbnailPath = this.imagePathCache.get(`thumb_${imageId}`);
    let originalPath = this.imagePathCache.get(`orig_${imageId}`);

    if (!thumbnailPath && !originalPath) {
      const allImages = await window.electronAPI.getImages();
      const img = allImages.find(i => i.id === imageId);
      if (img) {
        if (img.thumbnailPath) {
          thumbnailPath = await window.electronAPI.getImagePath(img.thumbnailPath);
          this.imagePathCache.set(`thumb_${imageId}`, thumbnailPath);
        }
        if (img.relativePath) {
          originalPath = await window.electronAPI.getImagePath(img.relativePath);
          this.imagePathCache.set(`orig_${imageId}`, originalPath);
        }
      }
    }

    return { thumbnailPath, originalPath };
  }

  /**
   * 加载原图（直接加载，不经过缩略图）
   * @param {string|null} originalPath - 原图路径
   * @param {Function} checkValidFn - 检查是否有效的回调
   */
  loadOriginalImage(originalPath, checkValidFn) {
    if (!originalPath) return;
    
    this.imageEl.src = `file://${originalPath}`;
  }

  /**
   * 绑定 hover 事件
   * @param {string} selector - CSS 选择器
   * @param {Object} options - 配置选项
   * @param {Function} options.getContent - 获取内容文本的函数 (element) => string
   * @param {Function} options.getImageId - 获取图像 ID 的函数 (element) => string|null
   * @param {number} options.delay - 延迟时间（默认 500ms）
   */
  bind(selector, options) {
    if (!this.tooltip || !this.contentEl || !this.imageEl) return;

    const { getContent, getImageId, delay = 500 } = options;

    document.querySelectorAll(selector).forEach(element => {
      element.addEventListener('mouseenter', async (e) => {
        const content = getContent(element);
        if (content === null) return;

        this.currentElement = element;
        clearTimeout(this.hoverTimer);

        // 显示内容
        this.contentEl.textContent = content || '';
        this.tooltip.classList.remove('no-image');

        // 设置初始位置
        let left = e.clientX + 16;
        let top = e.clientY + 16;
        this.tooltip.style.left = left + 'px';
        this.tooltip.style.top = top + 'px';

        const imageId = getImageId(element);
        if (!imageId) {
          this.tooltip.classList.add('no-image');
          this.imageEl.src = '';
          this.tooltip.classList.add('show');
          return;
        }

        // 延迟加载原图
        this.hoverTimer = setTimeout(async () => {
          if (this.currentElement !== element) return;

          const { originalPath } = await this.loadImagePaths(imageId);

          if (this.currentElement !== element) return;

          this.loadOriginalImage(
            originalPath,
            () => this.currentElement === element
          );
        }, delay);

        this.tooltip.classList.add('show');
      });

      element.addEventListener('mousemove', (e) => {
        if (this.tooltip.classList.contains('show')) {
          let left = e.clientX + 16;
          let top = e.clientY + 16;

          const tooltipRect = this.tooltip.getBoundingClientRect();
          if (left + tooltipRect.width > window.innerWidth - 16) {
            left = e.clientX - tooltipRect.width - 16;
          }
          if (top + tooltipRect.height > window.innerHeight - 16) {
            top = e.clientY - tooltipRect.height - 16;
          }

          this.tooltip.style.left = left + 'px';
          this.tooltip.style.top = top + 'px';
        }
      });

      element.addEventListener('mouseleave', () => {
        clearTimeout(this.hoverTimer);
        this.currentElement = null;
        this.tooltip.classList.remove('show');
        this.imageEl.src = '';
      });
    });
  }
}

/**
 * 标签管理器
 * 统一管理标签的增删改查和防抖保存
 */
class TagManager {
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
      const { tags: newTags, hasViolation } = await TagManager.addTagWithViolationCheck(this.tags, tagName, tagsWithGroup);

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
        const result = await TagManager.addTagWithViolationCheck(currentTags, tagName, tagsWithGroup);
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
      const { tags: newTags, violationRemoved } = await TagManager.removeTagWithViolationCheck(this.tags, tagName, tagsWithGroup);

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
        console.error('Save tags error:', error);
      }
    }, this.saveDelay);
  }

  /**
   * 添加标签并处理违单逻辑（静态方法）
   * @param {Array} currentTags - 当前标签数组
   * @param {string} newTag - 要添加的新标签
   * @param {Array} [tagsWithGroup] - 可选的标签组信息
   * @returns {Promise<Object>} - { tags: 处理后的标签数组, hasViolation: 是否存在冲突 }
   */
  static async addTagWithViolationCheck(currentTags, newTag, tagsWithGroup) {
    // 检查是否为违单标签（禁止手动添加）
    if (newTag === PromptManager.VIOLATING_TAG) {
      throw new Error(`"${PromptManager.VIOLATING_TAG}" 是系统保留标签，不能手动添加`);
    }

    // 检查标签是否已存在
    if (currentTags.includes(newTag)) {
      throw new Error('该标签已存在');
    }

    // 添加新标签
    const newTags = [...currentTags, newTag];

    // 检查是否存在单选组冲突
    const hasViolation = await TagManager.checkSingleSelectViolation(newTags, tagsWithGroup);

    // 如果存在单选组冲突，自动添加违单标签
    if (hasViolation && !newTags.includes(PromptManager.VIOLATING_TAG)) {
      newTags.push(PromptManager.VIOLATING_TAG);
    }

    return { tags: newTags, hasViolation };
  }

  /**
   * 删除标签并处理违单逻辑（静态方法）
   * @param {Array} currentTags - 当前标签数组
   * @param {string} tagToRemove - 要删除的标签
   * @param {Array} [tagsWithGroup] - 可选的标签组信息
   * @returns {Promise<Object>} - { tags: 处理后的标签数组, violationRemoved: 是否移除了违单标签 }
   */
  static async removeTagWithViolationCheck(currentTags, tagToRemove, tagsWithGroup) {
    // 检查是否为违单标签（禁止手动删除）
    if (tagToRemove === PromptManager.VIOLATING_TAG) {
      throw new Error(`"${PromptManager.VIOLATING_TAG}" 标签不能手动删除，请解决单选组冲突后自动移除`);
    }

    // 删除标签
    let newTags = currentTags.filter(tag => tag !== tagToRemove);

    // 检查是否还存在单选组冲突
    const hasViolation = await TagManager.checkSingleSelectViolation(newTags, tagsWithGroup);

    // 如果不存在冲突了，移除违单标签
    let violationRemoved = false;
    if (!hasViolation && newTags.includes(PromptManager.VIOLATING_TAG)) {
      newTags = newTags.filter(tag => tag !== PromptManager.VIOLATING_TAG);
      violationRemoved = true;
    }

    return { tags: newTags, violationRemoved };
  }

  /**
   * 检查是否存在单选组冲突（静态方法）
   * @param {Array} tags - 标签数组
   * @param {Array} [tagsWithGroup] - 可选的标签组信息
   * @returns {Promise<boolean>} - 是否存在冲突
   */
  static async checkSingleSelectViolation(tags, tagsWithGroup) {
    if (!tagsWithGroup) return false;

    try {
      // 按单选组分类当前标签
      const singleSelectGroups = {};

      for (const tag of tags) {
        const tagInfo = tagsWithGroup.find(t => t.name === tag);
        if (tagInfo && tagInfo.groupId && tagInfo.groupType === 'single') {
          // 属于单选组
          if (!singleSelectGroups[tagInfo.groupId]) {
            singleSelectGroups[tagInfo.groupId] = [];
          }
          singleSelectGroups[tagInfo.groupId].push(tag);
        }
      }

      // 检查是否有单选组包含多个标签
      for (const groupTags of Object.values(singleSelectGroups)) {
        if (groupTags.length > 1) {
          return true;
        }
      }
    } catch (error) {
      console.error('Check single select violation error:', error);
    }

    return false;
  }
}

/**
 * Prompt Manager 主应用逻辑
 * 管理 Prompt 的增删改查、标签管理、图像处理等功能
 */
class PromptManager {
  // 常量定义
  static FAVORITE_TAG = '收藏';
  static UNREFERENCED_TAG = '未引';
  static MULTI_REF_TAG = '多引';
  static NO_IMAGE_TAG = '无图';
  static MULTI_IMAGE_TAG = '多图';
  static SAFE_TAG = '安全';
  static UNSAFE_TAG = '敏感';
  static VIOLATING_TAG = '违单';

  // 提示词特殊标签列表（用于标签管理界面）
  static PROMPT_SPECIAL_TAGS = [
    PromptManager.FAVORITE_TAG,
    PromptManager.MULTI_IMAGE_TAG,
    PromptManager.NO_IMAGE_TAG,
    PromptManager.VIOLATING_TAG
  ];

  // 图像特殊标签列表（用于标签管理界面）
  static IMAGE_SPECIAL_TAGS = [
    PromptManager.FAVORITE_TAG,
    PromptManager.UNREFERENCED_TAG,
    PromptManager.MULTI_REF_TAG,
    PromptManager.VIOLATING_TAG
  ];

  // 所有特殊标签（用于卡片/列表显示时过滤）
  static ALL_SPECIAL_TAGS = [
    PromptManager.VIOLATING_TAG,
    PromptManager.FAVORITE_TAG,
    PromptManager.UNREFERENCED_TAG,
    PromptManager.MULTI_REF_TAG,
    PromptManager.SAFE_TAG,
    PromptManager.UNSAFE_TAG,
    PromptManager.MULTI_IMAGE_TAG,
    PromptManager.NO_IMAGE_TAG
  ];

  /**
   * 获取提示词特殊标签列表
   * @param {boolean} includeNsfw - 是否包含 NSFW 标签
   * @returns {string[]} - 特殊标签列表
   */
  static getPromptSpecialTags(includeNsfw = false) {
    const tags = [...PromptManager.PROMPT_SPECIAL_TAGS];
    if (includeNsfw) {
      tags.push(PromptManager.SAFE_TAG, PromptManager.UNSAFE_TAG);
    }
    return tags;
  }

  /**
   * 获取图像特殊标签列表
   * @param {boolean} includeNsfw - 是否包含 NSFW 标签
   * @returns {string[]} - 特殊标签列表
   */
  static getImageSpecialTags(includeNsfw = false) {
    const tags = [...PromptManager.IMAGE_SPECIAL_TAGS];
    if (includeNsfw) {
      tags.push(PromptManager.SAFE_TAG, PromptManager.UNSAFE_TAG);
    }
    return tags;
  }

  /**
   * 构造函数 - 初始化应用状态和配置
   */
  constructor() {
    this.prompts = [];              // 所有 Prompt 数据
    this.searchQuery = '';          // 当前搜索关键词
    this.selectedTags = new Set();  // 当前选中的提示词标签集合
    this.selectedImageTags = [];    // 当前选中的图像标签数组（支持多选）
    this.imageSearchQuery = '';     // 当前图像搜索关键词
    this.imageSearchTimeout = null; // 图像搜索防抖定时器
    this.imageSortBy = 'updatedAt'; // 图像管理界面排序字段（默认最近更新）
    this.imageSortOrder = 'desc';   // 图像管理界面排序顺序
    this.imageSelectorSortBy = 'updatedAt'; // 选择图像界面排序字段
    this.imageSelectorSortOrder = 'desc';   // 选择图像界面排序顺序
    this.promptSortBy = 'updatedAt'; // 提示词排序字段
    this.promptSortOrder = 'desc';   // 提示词排序顺序

    // 图标常量定义（渐进式重构）
    this.ICONS = {
      copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
      delete: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
      restore: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>`,
      favorite: {
        filled: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
        outline: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
      }
    };
    this.promptTagSortBy = 'count';  // 提示词标签排序字段
    this.promptTagSortOrder = 'desc'; // 提示词标签排序顺序
    this.imageTagSortBy = 'count';   // 图像标签排序字段
    this.imageTagSortOrder = 'desc'; // 图像标签排序顺序
    this.imageTagFilterSortBy = 'count';   // 图像管理界面标签筛选排序字段
    this.imageTagFilterSortOrder = 'desc'; // 图像管理界面标签筛选排序顺序
    this.promptTagFilterSortBy = 'count';   // 提示词管理界面标签筛选排序字段
    this.promptTagFilterSortOrder = 'desc'; // 提示词管理界面标签筛选排序顺序
    this.imageViewMode = localStorage.getItem('imageViewMode') || 'grid'; // 图像管理界面视图模式（grid/list）
    this.promptViewMode = localStorage.getItem('promptViewMode') || 'grid'; // 提示词管理界面视图模式（grid/list）
    this.currentTheme = localStorage.getItem('theme') || 'light';  // 当前主题
    this.viewMode = localStorage.getItem('viewMode') || 'safe';  // 内容显示模式（safe/nsfw）
    this.currentImages = [];        // 当前编辑的图像列表
    this.currentEditIndex = -1;     // 当前编辑的提示词索引
    this.filteredPrompts = [];      // 筛选后的提示词列表（用于编辑模态框导航）
    this.editModalPromptsSnapshot = []; // 编辑模态框打开时的提示词列表快照（用于导航）
    this.viewerImages = [];         // 图像查看器中的图像列表
    this.viewerCurrentIndex = 0;    // 图像查看器当前索引
    this.currentPanel = localStorage.getItem('currentPanel') || 'prompt';   // 当前显示的面板 ('prompt' 或 'image')
    this.detailImages = [];         // 图像详情模态框中的图像列表
    this.detailCurrentIndex = 0;    // 图像详情当前索引
    this.detailPromptInfo = null;   // 图像详情中关联的提示词信息
    this.currentDetailPromptId = null;  // 当前图像详情中显示的提示词ID
    this.returnToImageDetail = false;   // 是否需要在编辑后返回图像详情
    this.returnToImageDetailIndex = null;   // 返回图像详情时的索引
    this.returnToImageDetailImages = null;  // 返回图像详情时的图像列表
    this.prefillImages = [];            // 新建提示词页面预填充的图像（取消时不删除）
    this.selectedImageIds = new Set();  // 列表视图选中的图像ID集合
    this.lastSelectedIndex = -1;        // 上次选中的索引（用于Shift范围选择）
    this.selectedPromptIds = new Set(); // 提示词列表视图选中的提示词ID集合
    this.lastSelectedPromptIndex = -1;  // 上次选中的提示词索引（用于Shift范围选择）

    // 图像详情字段保存管理
    this.imageDetailFieldValues = {};   // 字段原始值缓存
    this.imageDetailFieldTimers = {};   // 字段防抖定时器

    this.init();
  }

  /**
   * 生成唯一的时间戳
   * 格式: YYMMDD_HHMMSS_MMM (2位年份_月日时分秒_毫秒)
   * @returns {string} 时间戳字符串
   */
  generateUniqueTimestamp() {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}${month}${day}_${hour}${minute}${second}_${ms}`;
  }

  /**
   * 格式化文件大小
   * 将字节转换为人类可读的格式（B, KB, MB, GB）
   * @param {number} bytes - 文件大小（字节）
   * @returns {string} 格式化后的文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 使用 TagManager 添加标签（共用方法）
   * @param {TagManager} tagManager - TagManager 实例
   * @param {string|string[]} tagInput - 标签名称或标签数组
   * @returns {Promise<boolean>} - 是否成功添加
   */
  async addTagWithManager(tagManager, tagInput) {
    if (!tagManager) return false;

    const isBatch = Array.isArray(tagInput);

    try {
      const result = isBatch
        ? await tagManager.addTags(tagInput)
        : await tagManager.addTag(tagInput);

      if (result.hasViolation) {
        const message = isBatch
          ? `已添加 ${result.added} 个标签，存在单选组冲突`
          : '标签已添加，存在单选组冲突';
        this.showToast(message, 'warning');
      } else if (isBatch ? result.added > 0 : result.success) {
        // 成功添加且无违单
        const message = isBatch
          ? `成功添加 ${result.added} 个标签`
          : '标签添加成功';
        this.showToast(message, 'success');
      }

      return isBatch ? result.added > 0 : result.success;
    } catch (error) {
      this.showToast(error.message, 'error');
      return false;
    }
  }

  /**
   * 使用 TagManager 删除标签（共用方法）
   * @param {TagManager} tagManager - TagManager 实例
   * @param {string} tagName - 标签名称
   * @returns {Promise<boolean>}
   */
  async removeTagWithManager(tagManager, tagName) {
    if (!tagManager) return false;

    try {
      await tagManager.removeTag(tagName);
      this.showToast('标签删除成功', 'success');
      return true;
    } catch (error) {
      this.showToast(error.message, 'error');
      return false;
    }
  }

  /**
   * 初始化应用
   * 加载主题、绑定事件、加载数据、初始化面板
   */
  async init() {
    this.initTheme();
    this.bindEvents();
    await this.loadPrompts();
    this.restorePanelState(); // 恢复上次打开的页面

    // 初始化标签筛选排序控件
    const promptTagFilterSortSelect = document.getElementById('promptTagFilterSortSelect');
    if (promptTagFilterSortSelect) {
      promptTagFilterSortSelect.value = `${this.promptTagFilterSortBy}-${this.promptTagFilterSortOrder}`;
    }
  }

  /**
   * 初始化主题设置
   * 应用保存的主题或默认主题
   */
  initTheme() {
    this.applyTheme(this.currentTheme);
  }

  /**
   * 应用指定主题
   * @param {string} theme - 主题名称 ('light' 或 'dark')
   */
  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // 更新设置中的图标
    const settingsSunIcon = document.getElementById('settingsSunIcon');
    const settingsMoonIcon = document.getElementById('settingsMoonIcon');
    const settingsThemeText = document.getElementById('settingsThemeText');
    if (settingsSunIcon && settingsMoonIcon) {
      if (theme === 'dark') {
        settingsSunIcon.style.display = 'none';
        settingsMoonIcon.style.display = 'inline-block';
      } else {
        settingsSunIcon.style.display = 'inline-block';
        settingsMoonIcon.style.display = 'none';
      }
    }
    if (settingsThemeText) {
      settingsThemeText.textContent = theme === 'dark' ? '明亮' : '暗黑';
    }
  }

  /**
   * 切换主题
   * 在明亮模式和暗黑模式之间切换
   */
  toggleTheme() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
    this.showToast(newTheme === 'dark' ? '已切换到黑暗模式' : '已切换到明亮模式');
  }

  /**
   * 绑定所有 DOM 事件
   * 包括按钮点击、搜索、模态框等事件
   */
  bindEvents() {
    // 侧边栏收起/展开
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('sidebar');
    if (toggleSidebarBtn && sidebar) {
      toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        toggleSidebarBtn.title = isCollapsed ? '展开侧边栏' : '收起侧边栏';
        localStorage.setItem('sidebarCollapsed', isCollapsed);
      });

      // 恢复侧边栏状态
      const savedState = localStorage.getItem('sidebarCollapsed');
      if (savedState === 'true') {
        sidebar.classList.add('collapsed');
        toggleSidebarBtn.title = '展开侧边栏';
      }
    }

    // 新建按钮 - 打开新建提示词页面
    document.getElementById('addBtn').addEventListener('click', () => this.openNewPromptPage());
    
    // 搜索
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.debounceSearch();
      // 显示/隐藏清空按钮
      if (clearSearchBtn) {
        clearSearchBtn.style.display = e.target.value ? 'flex' : 'none';
      }
    });
    
    // 清空搜索按钮
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        this.performSearch();
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
      });
    }

    // 清除标签筛选
    document.getElementById('clearTagFilter').addEventListener('click', () => this.clearTagFilter());

    // 提示词排序
    const promptSortSelect = document.getElementById('promptSortSelect');
    if (promptSortSelect) {
      promptSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.promptSortBy = sortBy;
        this.promptSortOrder = sortOrder;
        this.loadPrompts();
      });
    }

    // 提示词排序逆序按钮
    const promptSortReverseBtn = document.getElementById('promptSortReverseBtn');
    if (promptSortReverseBtn) {
      promptSortReverseBtn.addEventListener('click', () => {
        this.promptSortOrder = this.promptSortOrder === 'asc' ? 'desc' : 'asc';
        promptSortSelect.value = `${this.promptSortBy}-${this.promptSortOrder}`;
        this.loadPrompts();
      });
    }

    // 提示词视图切换按钮
    const promptGridViewBtn = document.getElementById('promptGridViewBtn');
    const promptListViewBtn = document.getElementById('promptListViewBtn');
    const promptCompactViewBtn = document.getElementById('promptCompactViewBtn');
    if (promptGridViewBtn && promptListViewBtn && promptCompactViewBtn) {
      // 初始化视图状态
      this.updatePromptViewMode();

      promptGridViewBtn.addEventListener('click', () => {
        this.promptViewMode = 'grid';
        localStorage.setItem('promptViewMode', 'grid');
        this.updatePromptViewMode();
        this.renderPromptList();
      });

      promptListViewBtn.addEventListener('click', () => {
        this.promptViewMode = 'list';
        localStorage.setItem('promptViewMode', 'list');
        this.updatePromptViewMode();
        this.renderPromptList();
      });

      promptCompactViewBtn.addEventListener('click', () => {
        this.promptViewMode = 'list-compact';
        localStorage.setItem('promptViewMode', 'list-compact');
        this.updatePromptViewMode();
        this.renderPromptList();
      });
    }

    // 关闭编辑模态框（自动保存）
    document.getElementById('closeEditModalBtn').addEventListener('click', async () => {
      await this.savePromptAndClose();
    });

    // 阻止表单默认提交行为
    document.getElementById('promptForm').addEventListener('submit', (e) => {
      e.preventDefault();
    });

    // 编辑模态框导航按钮
    document.getElementById('editModalFirstBtn').addEventListener('click', () => this.navigateEditModal('first'));
    document.getElementById('editModalPrevBtn').addEventListener('click', () => this.navigateEditModal(-1));
    document.getElementById('editModalNextBtn').addEventListener('click', () => this.navigateEditModal(1));
    document.getElementById('editModalLastBtn').addEventListener('click', () => this.navigateEditModal('last'));
    
    // 导入导出（现在在设置中）
    document.getElementById('importBtn').addEventListener('click', () => this.importPrompts());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportPrompts());

    // 提示词管理和图像管理按钮
    document.getElementById('promptManagerBtn').addEventListener('click', () => this.openPromptManager());
    document.getElementById('imageManagerBtn').addEventListener('click', () => this.openImageManager());

    // 确认对话框事件
    document.getElementById('closeConfirmModal').addEventListener('click', () => this.closeConfirmModal());
    document.getElementById('confirmCancelBtn').addEventListener('click', () => this.closeConfirmModal());
    document.getElementById('confirmOkBtn').addEventListener('click', () => this.handleConfirmOk());
    document.getElementById('confirmModal').addEventListener('click', (e) => {
      if (e.target.id === 'confirmModal') this.closeConfirmModal();
    });

    // 输入对话框事件
    document.getElementById('closeInputModal').addEventListener('click', () => this.closeInputModal());
    document.getElementById('inputCancelBtn').addEventListener('click', () => this.closeInputModal());
    document.getElementById('inputOkBtn').addEventListener('click', () => this.handleInputOk());
    document.getElementById('inputModal').addEventListener('click', (e) => {
      if (e.target.id === 'inputModal') this.closeInputModal();
    });
    document.getElementById('inputModalField').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleInputOk();
    });

    // 选择对话框事件
    document.getElementById('closeSelectModal').addEventListener('click', () => this.closeSelectModal());
    document.getElementById('selectCancelBtn').addEventListener('click', () => this.closeSelectModal());
    document.getElementById('selectOkBtn').addEventListener('click', () => this.handleSelectOk());
    document.getElementById('selectModal').addEventListener('click', (e) => {
      if (e.target.id === 'selectModal') this.closeSelectModal();
    });

    // 图像标签管理
    document.getElementById('imageTagManagerBtn').addEventListener('click', () => this.openImageTagManagerModal());
    document.getElementById('closeImageTagManagerModal').addEventListener('click', () => this.closeImageTagManagerModal());

    // 图像标签管理 - 新建标签按钮
    const addImageTagInManagerBtn = document.getElementById('addImageTagInManagerBtn');
    if (addImageTagInManagerBtn) {
      addImageTagInManagerBtn.addEventListener('click', () => {
        this.openCreateImageTagModal();
      });
    }

    // 图像管理界面标签筛选排序
    const imageTagFilterSortSelect = document.getElementById('imageTagFilterSortSelect');
    const imageTagFilterOrderBtn = document.getElementById('imageTagFilterOrderBtn');
    if (imageTagFilterSortSelect) {
      imageTagFilterSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imageTagFilterSortBy = sortBy;
        this.imageTagFilterSortOrder = sortOrder;
        this.renderImageTagFilters();
      });
    }
    // 图像标签筛选排序顺序切换
    if (imageTagFilterOrderBtn) {
      imageTagFilterOrderBtn.addEventListener('click', () => {
        this.imageTagFilterSortOrder = this.imageTagFilterSortOrder === 'asc' ? 'desc' : 'asc';
        // 更新下拉框显示
        const sortSelect = document.getElementById('imageTagFilterSortSelect');
        if (sortSelect) {
          sortSelect.value = `${this.imageTagFilterSortBy}-${this.imageTagFilterSortOrder}`;
        }
        this.renderImageTagFilters();
      });
    }
    // 图像标签筛选收起/展开
    const toggleImageTagFilterBtn = document.getElementById('toggleImageTagFilterBtn');
    const imageTagFilterSection = document.getElementById('imageTagFilterSection');
    if (toggleImageTagFilterBtn && imageTagFilterSection) {
      // 恢复收起状态
      const isCollapsed = localStorage.getItem('imageTagFilterCollapsed') === 'true';
      if (isCollapsed) {
        imageTagFilterSection.classList.add('collapsed');
      }
      toggleImageTagFilterBtn.addEventListener('click', () => {
        imageTagFilterSection.classList.toggle('collapsed');
        const collapsed = imageTagFilterSection.classList.contains('collapsed');
        localStorage.setItem('imageTagFilterCollapsed', collapsed);
      });
    }

    // 图像标签管理搜索
    const imageTagManagerSearchInput = document.getElementById('imageTagManagerSearchInput');
    const clearImageTagManagerSearchBtn = document.getElementById('clearImageTagManagerSearchBtn');
    if (imageTagManagerSearchInput) {
      imageTagManagerSearchInput.addEventListener('input', (e) => {
        this.renderImageTagManager(e.target.value);
        // 显示/隐藏清空按钮
        if (clearImageTagManagerSearchBtn) {
          clearImageTagManagerSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    // 清空图像标签管理搜索按钮
    if (clearImageTagManagerSearchBtn) {
      clearImageTagManagerSearchBtn.addEventListener('click', () => {
        imageTagManagerSearchInput.value = '';
        this.renderImageTagManager('');
        clearImageTagManagerSearchBtn.style.display = 'none';
        imageTagManagerSearchInput.focus();
      });
    }
    // 图像标签排序
    const imageTagManagerSortSelect = document.getElementById('imageTagManagerSortSelect');
    const imageTagManagerOrderBtn = document.getElementById('imageTagManagerOrderBtn');
    if (imageTagManagerSortSelect) {
      imageTagManagerSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imageTagSortBy = sortBy;
        this.imageTagSortOrder = sortOrder;
        this.renderImageTagManager(imageTagManagerSearchInput ? imageTagManagerSearchInput.value : '');
      });
    }
    // 图像标签排序顺序切换
    if (imageTagManagerOrderBtn) {
      imageTagManagerOrderBtn.addEventListener('click', () => {
        this.imageTagSortOrder = this.imageTagSortOrder === 'asc' ? 'desc' : 'asc';
        // 更新下拉框显示
        const sortSelect = document.getElementById('imageTagManagerSortSelect');
        if (sortSelect) {
          sortSelect.value = `${this.imageTagSortBy}-${this.imageTagSortOrder}`;
        }
        this.renderImageTagManager(imageTagManagerSearchInput ? imageTagManagerSearchInput.value : '');
      });
    }

    // 图像搜索
    const imageSearchInput = document.getElementById('imageSearchInput');
    const clearImageSearchBtn = document.getElementById('clearImageSearchBtn');
    if (imageSearchInput) {
      imageSearchInput.addEventListener('input', (e) => {
        this.imageSearchQuery = e.target.value;
        this.debounceImageSearch();
        // 显示/隐藏清空按钮
        if (clearImageSearchBtn) {
          clearImageSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    // 清空图像搜索按钮
    if (clearImageSearchBtn) {
      clearImageSearchBtn.addEventListener('click', () => {
        imageSearchInput.value = '';
        this.imageSearchQuery = '';
        this.performImageSearch();
        clearImageSearchBtn.style.display = 'none';
        imageSearchInput.focus();
      });
    }

    // 图像排序
    const imageSortSelect = document.getElementById('imageSortSelect');
    if (imageSortSelect) {
      imageSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imageSortBy = sortBy;
        this.imageSortOrder = sortOrder;
        this.renderImageGrid();
      });
    }

    // 图像排序逆序按钮
    const imageSortReverseBtn = document.getElementById('imageSortReverseBtn');
    if (imageSortReverseBtn) {
      imageSortReverseBtn.addEventListener('click', () => {
        this.imageSortOrder = this.imageSortOrder === 'asc' ? 'desc' : 'asc';
        imageSortSelect.value = `${this.imageSortBy}-${this.imageSortOrder}`;
        this.renderImageGrid();
      });
    }

    // 图像视图切换按钮
    const imageGridViewBtn = document.getElementById('imageGridViewBtn');
    const imageListViewBtn = document.getElementById('imageListViewBtn');
    const imageCompactViewBtn = document.getElementById('imageCompactViewBtn');
    if (imageGridViewBtn && imageListViewBtn && imageCompactViewBtn) {
      // 初始化视图状态
      this.updateImageViewMode();

      imageGridViewBtn.addEventListener('click', () => {
        this.imageViewMode = 'grid';
        localStorage.setItem('imageViewMode', 'grid');
        this.updateImageViewMode();
        this.clearImageSelection();
        this.renderImageGrid();
      });

      imageListViewBtn.addEventListener('click', () => {
        this.imageViewMode = 'list';
        localStorage.setItem('imageViewMode', 'list');
        this.updateImageViewMode();
        this.renderImageGrid();
      });

      imageCompactViewBtn.addEventListener('click', () => {
        this.imageViewMode = 'list-compact';
        localStorage.setItem('imageViewMode', 'list-compact');
        this.updateImageViewMode();
        this.renderImageGrid();
      });
    }

    // 上传图像按钮
    document.getElementById('uploadImageBtn').addEventListener('click', () => this.openImageUploadModal());

    // 图像上传模态框
    this.bindImageUploadModalEvents();

    // 图像上传
    this.bindImageUploadEvents();

    // 图像查看器事件
    this.bindImageViewerEvents();

    // 设置
    this.bindSettingsEvents();

    // 图像详情模态框
    document.getElementById('closeImageDetailBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeImageDetailModal();
    });
    document.getElementById('imageDetailModal').addEventListener('click', (e) => {
      if (e.target.id === 'imageDetailModal') this.closeImageDetailModal();
    });
    document.getElementById('firstImageBtn').addEventListener('click', () => this.showFirstDetailImage());
    document.getElementById('prevImageBtn').addEventListener('click', () => this.showPrevDetailImage());
    document.getElementById('nextImageBtn').addEventListener('click', () => this.showNextDetailImage());
    document.getElementById('lastImageBtn').addEventListener('click', () => this.showLastDetailImage());

    // 从图像详情界面编辑提示词
    document.getElementById('editPromptFromImageBtn').addEventListener('click', () => this.editPromptFromImageDetail());





    // 绑定图像详情字段事件
    this.bindImageDetailFieldEvents();

    // 安全评级开关
    const imageSafeToggle = document.getElementById('imageSafeToggle');
    if (imageSafeToggle) {
      imageSafeToggle.addEventListener('change', (e) => {
        this.toggleImageSafeStatus(e.target.checked);
      });
    }

    // 图像标签输入自动补全
    this.setupImageTagAutocomplete();

    // 提示词标签输入自动补全
    this.setupPromptTagAutocomplete();

    // 缩略图尺寸控制
    this.setupThumbnailSizeControl();

    // 提示词卡片尺寸控制
    this.setupPromptCardSizeControl();

    // 提示词编辑界面的收藏按钮
    const promptFavoriteBtn = document.getElementById('promptFavoriteBtn');
    if (promptFavoriteBtn) {
      promptFavoriteBtn.addEventListener('click', () => this.togglePromptEditFavorite());
    }

    // 图像标签筛选清除按钮
    document.getElementById('clearImageTagFilter').addEventListener('click', () => this.clearImageTagFilter());

    // 批量操作工具栏事件
    this.bindBatchToolbarEvents();

    // 点击 Modal 外部关闭
    document.getElementById('editModal').addEventListener('click', (e) => {
      if (e.target.id === 'editModal') this.closeEditModal();
    });
    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') this.closeSettingsModal();
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeEditModal();
        this.closeSettingsModal();
        this.closeImageDetailModal();
      }
      // 编辑模态框键盘导航（全屏图像查看器打开时不触发）
      const imageViewer = document.getElementById('imageViewer');
      if (document.getElementById('editModal').classList.contains('active') &&
          !(imageViewer && imageViewer.classList.contains('active'))) {
        if (e.key === 'Home') {
          e.preventDefault();
          this.navigateEditModal('first');
        } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          this.navigateEditModal(-1);
        } else if (e.key === 'PageDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          this.navigateEditModal(1);
        } else if (e.key === 'End') {
          e.preventDefault();
          this.navigateEditModal('last');
        }
      }
      // 图像详情页面键盘导航
      if (document.getElementById('imageDetailModal').classList.contains('active')) {
        // 如果焦点在输入框或文本域中，不处理导航快捷键
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA'
        );

        if (!isInputFocused) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.showPrevDetailImage();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.showNextDetailImage();
          } else if (e.key === 'Home') {
            e.preventDefault();
            this.showFirstDetailImage();
          } else if (e.key === 'End') {
            e.preventDefault();
            this.showLastDetailImage();
          }
        }
      }
      // 图像列表视图多选键盘快捷键（支持列表视图和紧凑视图）
      if (this.currentPanel === 'image' && (this.imageViewMode === 'list' || this.imageViewMode === 'list-compact')) {
        // 如果焦点在输入框中，不处理
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
          e.preventDefault();
          // 全选/取消全选
          if (this.selectedImageIds.size === this.imageGridImages.length) {
            this.selectedImageIds.clear();
          } else {
            this.imageGridImages.forEach(img => this.selectedImageIds.add(img.id));
          }
          this.lastSelectedIndex = -1;
          this.renderImageGrid();
          this.renderBatchOperationToolbar();
        } else if (e.key === 'Delete' && this.selectedImageIds.size > 0) {
          e.preventDefault();
          this.batchDeleteImages();
        } else if (e.key === 'Escape' && this.selectedImageIds.size > 0) {
          e.preventDefault();
          this.clearImageSelection();
        }
      }
      // 提示词列表视图多选键盘快捷键（支持列表视图和紧凑视图）
      if (this.currentPanel === 'prompt' && (this.promptViewMode === 'list' || this.promptViewMode === 'list-compact')) {
        // 如果焦点在输入框中，不处理
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
          e.preventDefault();
          // 全选/取消全选
          const visiblePrompts = this.filteredPrompts || this.prompts;
          if (this.selectedPromptIds.size === visiblePrompts.length) {
            this.selectedPromptIds.clear();
          } else {
            visiblePrompts.forEach(p => this.selectedPromptIds.add(p.id));
          }
          this.lastSelectedPromptIndex = -1;
          this.renderPromptList();
        } else if (e.key === 'Delete' && this.selectedPromptIds.size > 0) {
          e.preventDefault();
          this.batchDeletePrompts();
        } else if (e.key === 'Escape' && this.selectedPromptIds.size > 0) {
          e.preventDefault();
          this.clearPromptSelection();
        }
      }
    });
  }

  // 绑定设置事件
  /**
   * 绑定设置相关事件
   * 包括设置、回收站、标签管理等按钮事件
   */
  bindSettingsEvents() {
    // 打开设置
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettingsModal());

    // 关闭设置
    document.getElementById('closeSettingsModal').addEventListener('click', () => this.closeSettingsModal());

    // 主题切换（设置中）
    const settingsThemeToggle = document.getElementById('settingsThemeToggle');
    if (settingsThemeToggle) {
      settingsThemeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // 更改数据目录
    document.getElementById('changeDataPathBtn').addEventListener('click', () => this.changeDataPath());

    // 内容显示模式设置
    const viewModeSelect = document.getElementById('viewModeSelect');
    if (viewModeSelect) {
      // 加载保存的设置
      viewModeSelect.value = this.viewMode;
      // 监听变化
      viewModeSelect.addEventListener('change', () => {
        this.viewMode = viewModeSelect.value;
        localStorage.setItem('viewMode', this.viewMode);
        this.showToast(this.viewMode === 'safe' ? '已切换到安全模式' : '已切换到 NSFW 模式');
        // 刷新显示
        this.renderPromptList();
        this.renderImageGrid();
        // 刷新标签筛选
        this.renderTagFilters();
        this.renderImageTagFilters();
      });
    }

    // 一键清空所有数据
    document.getElementById('clearAllDataBtn').addEventListener('click', () => this.clearAllData());

    // 刷新应用
    document.getElementById('refreshBtn').addEventListener('click', () => this.refreshApp());

    // 刷新数据（重新读取数据库）
    document.getElementById('reloadBtn').addEventListener('click', () => this.reloadData());

    // 回收站（提示词管理面板）
    document.getElementById('recycleBinBtn').addEventListener('click', () => this.openRecycleBinModal());
    document.getElementById('closeRecycleBinModal').addEventListener('click', () => this.closeRecycleBinModal());
    document.getElementById('emptyRecycleBinBtn').addEventListener('click', () => this.emptyRecycleBin());

    // 回收站（图像管理面板）
    document.getElementById('imageRecycleBinBtn').addEventListener('click', () => this.openImageRecycleBinModal());
    document.getElementById('closeImageRecycleBinModal').addEventListener('click', () => this.closeImageRecycleBinModal());
    document.getElementById('emptyImageRecycleBinBtn').addEventListener('click', () => this.emptyImageRecycleBin());

    // 导出孤儿文件（设置界面）
    document.getElementById('exportOrphanFilesBtn').addEventListener('click', () => this.exportOrphanFilesSimple());

    // 提示词标签管理
    document.getElementById('promptTagManagerBtn').addEventListener('click', () => this.openPromptTagManagerModal());
    document.getElementById('closePromptTagManagerModal').addEventListener('click', () => this.closePromptTagManagerModal());

    // 提示词标签组管理
    document.getElementById('addPromptTagGroupBtn').addEventListener('click', () => this.openTagGroupEditModal('prompt'));

    // 提示词标签管理 - 新建标签
    document.getElementById('addPromptTagInManagerBtn').addEventListener('click', () => this.addPromptTagInManager());

    // 图像标签组管理
    document.getElementById('addImageTagGroupBtn').addEventListener('click', () => this.openTagGroupEditModal('image'));

    // 标签组编辑 Modal
    document.getElementById('closeTagGroupEditModal').addEventListener('click', () => this.closeTagGroupEditModal());
    document.getElementById('cancelTagGroupEditBtn').addEventListener('click', () => this.closeTagGroupEditModal());
    document.getElementById('saveTagGroupBtn').addEventListener('click', () => this.saveTagGroup());

    // 提示词管理界面标签筛选排序
    const promptTagFilterSortSelect = document.getElementById('promptTagFilterSortSelect');
    const promptTagFilterOrderBtn = document.getElementById('promptTagFilterOrderBtn');

    if (promptTagFilterSortSelect) {
      promptTagFilterSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.promptTagFilterSortBy = sortBy;
        this.promptTagFilterSortOrder = sortOrder;
        this.renderTagFilters();
      });
    }

    // 切换排序顺序
    if (promptTagFilterOrderBtn && promptTagFilterSortSelect) {
      promptTagFilterOrderBtn.addEventListener('click', () => {
        // 切换顺序
        const newOrder = this.promptTagFilterSortOrder === 'asc' ? 'desc' : 'asc';
        this.promptTagFilterSortOrder = newOrder;
        // 更新下拉框选项
        promptTagFilterSortSelect.value = `${this.promptTagFilterSortBy}-${newOrder}`;
        this.renderTagFilters();
      });
    }

    // 标签筛选区域收起/展开
    const tagFilterToggleBtn = document.getElementById('tagFilterToggleBtn');
    if (tagFilterToggleBtn) {
      tagFilterToggleBtn.addEventListener('click', () => this.toggleTagFilterSection());
    }

    // 恢复标签筛选区域收起状态
    const tagFilterCollapsed = localStorage.getItem('tagFilterCollapsed');
    if (tagFilterCollapsed === 'true') {
      const tagFilterSection = document.getElementById('tagFilterSection');
      if (tagFilterSection) {
        tagFilterSection.classList.add('collapsed');
      }
      if (tagFilterToggleBtn) {
        tagFilterToggleBtn.title = '展开标签';
      }
    }

    // 标签管理搜索
    const tagManagerSearchInput = document.getElementById('tagManagerSearchInput');
    const clearTagManagerSearchBtn = document.getElementById('clearTagManagerSearchBtn');
    if (tagManagerSearchInput) {
      tagManagerSearchInput.addEventListener('input', (e) => {
        this.renderPromptTagManager(e.target.value);
        // 显示/隐藏清空按钮
        if (clearTagManagerSearchBtn) {
          clearTagManagerSearchBtn.style.display = e.target.value ? 'flex' : 'none';
        }
      });
    }
    // 清空提示词标签管理搜索按钮
    if (clearTagManagerSearchBtn) {
      clearTagManagerSearchBtn.addEventListener('click', () => {
        tagManagerSearchInput.value = '';
        this.renderPromptTagManager('');
        clearTagManagerSearchBtn.style.display = 'none';
        tagManagerSearchInput.focus();
      });
    }
    // 提示词标签排序
    const tagManagerSortSelect = document.getElementById('tagManagerSortSelect');
    const tagManagerOrderBtn = document.getElementById('tagManagerOrderBtn');

    if (tagManagerSortSelect) {
      tagManagerSortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.promptTagSortBy = sortBy;
        this.promptTagSortOrder = sortOrder;
        this.renderPromptTagManager(tagManagerSearchInput ? tagManagerSearchInput.value : '');
      });
    }

    // 提示词标签排序逆序按钮
    if (tagManagerOrderBtn && tagManagerSortSelect) {
      tagManagerOrderBtn.addEventListener('click', () => {
        const newOrder = this.promptTagSortOrder === 'asc' ? 'desc' : 'asc';
        this.promptTagSortOrder = newOrder;
        tagManagerSortSelect.value = `${this.promptTagSortBy}-${newOrder}`;
        this.renderPromptTagManager(tagManagerSearchInput ? tagManagerSearchInput.value : '');
      });
    }

    // 统计
    document.getElementById('statisticsBtn').addEventListener('click', () => this.openStatisticsModal());
    document.getElementById('closeStatisticsModal').addEventListener('click', () => this.closeStatisticsModal());

    document.getElementById('statisticsModal').addEventListener('click', (e) => {
      if (e.target.id === 'statisticsModal') this.closeStatisticsModal();
    });

    // 键盘快捷键 - 统计模态框
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeStatisticsModal();
      }
    });
  }

  /**
   * 打开设置模态框
   * 显示当前数据路径
   */
  async openSettingsModal() {
    const modal = document.getElementById('settingsModal');

    // 获取当前数据路径
    try {
      const dataPath = await window.electronAPI.getDataPath();
      document.getElementById('currentDataPath').textContent = dataPath;
    } catch (error) {
      console.error('Failed to get data path:', error);
      document.getElementById('currentDataPath').textContent = '获取失败';
    }

    modal.classList.add('active');
  }

  /**
   * 关闭设置模态框
   */
  closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
  }

  /**
   * 更改数据存储目录
   * 打开目录选择对话框，选择新的数据存储位置
   */
  async changeDataPath() {
    try {
      const newPath = await window.electronAPI.selectDataPath();
      if (newPath) {
        document.getElementById('currentDataPath').textContent = newPath;
        this.showToast('数据目录已更改，重启应用后生效', 'success');
      }
    } catch (error) {
      console.error('Failed to change data path:', error);
      this.showToast('更改失败: ' + error.message, 'error');
    }
  }

  /**
   * 清空所有数据
   * 删除所有提示词、图像和标签的数据库记录，不可恢复! 不删除图像文件
   */
  async clearAllData() {
    const confirmed = await this.showConfirmDialog(
      '⚠️ 危险操作',
      '确定要清空所有数据吗？\n\n此操作将永久删除\n<图像文件>\n以外的所有数据，不可恢复！'
    );
    if (!confirmed) return;

    try {
      await window.electronAPI.clearAllData();
      this.showToast('所有数据已清空', 'success');
      // 刷新界面
      await this.loadPrompts();
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to clear all data:', error);
      this.showToast('清空失败: ' + error.message, 'error');
    }
  }

  /**
   * 重启应用
   * 显示确认对话框后重启 Electron 应用
   */
  async refreshApp() {
    const confirmed = await this.showConfirmDialog('确认重启', '确定要重启应用吗？未保存的数据可能会丢失。');
    if (!confirmed) return;

    try {
      this.showToast('正在重启应用...', 'success');
      await window.electronAPI.relaunchApp();
    } catch (error) {
      console.error('Failed to restart app:', error);
      this.showToast('重启失败: ' + error.message, 'error');
    }
  }

  /**
   * 刷新数据
   * 重新读取数据库并刷新界面显示
   */
  async reloadData() {
    try {
      this.showToast('正在刷新数据...', 'success');
      await this.loadPrompts();
      if (this.currentPanel === 'image') {
        await this.renderImageGrid();
      }
      this.showToast('数据已刷新', 'success');
    } catch (error) {
      console.error('Failed to reload data:', error);
      this.showToast('刷新失败: ' + error.message, 'error');
    }
  }

  /**
   * 打开回收站模态框
   * 显示已删除的 Prompt 列表
   */
  async openRecycleBinModal() {
    const modal = document.getElementById('recycleBinModal');
    await this.renderRecycleBin();
    modal.style.display = 'flex';
  }

  /**
   * 关闭回收站模态框
   */
  closeRecycleBinModal() {
    const modal = document.getElementById('recycleBinModal');
    modal.style.display = 'none';
  }

  /**
   * 渲染回收站列表
   * 显示所有已删除的 Prompt 项目
   */
  async renderRecycleBin() {
    try {
      const items = await window.electronAPI.getRecycleBin();
      const listContainer = document.getElementById('recycleBinList');
      const emptyState = document.getElementById('recycleBinEmpty');

      if (items.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
      }

      listContainer.style.display = 'grid';
      emptyState.style.display = 'none';

      // 按删除时间倒序排列
      items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

      // 异步获取每个提示词的关联图像缩略图
      const itemCards = await Promise.all(
        items.map(async (item) => {
          const deletedDate = new Date(item.deletedAt).toLocaleString('zh-CN');
          let thumbnailHtml = '';

          try {
            // 获取提示词关联的图像
            const promptImages = await window.electronAPI.getPromptImages(item.id);
            if (promptImages && promptImages.length > 0) {
              const firstImage = promptImages[0];
              const imagePath = firstImage.thumbnailPath || firstImage.relativePath;
              if (imagePath) {
                const fullPath = await window.electronAPI.getImagePath(imagePath);
                thumbnailHtml = `<img src="file://${fullPath}" alt="${this.escapeHtml(item.title)}" class="recycle-bin-item-thumbnail">`;
              }
            }
          } catch (error) {
            console.error('Failed to get prompt thumbnail:', error);
          }

          // 如果没有缩略图，显示占位符
          if (!thumbnailHtml) {
            thumbnailHtml = `<div class="recycle-bin-item-thumbnail-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>`;
          }

          // 不截断提示词内容
          const contentPreview = item.content ? item.content : '';

          return `
            <div class="recycle-bin-item" data-id="${item.id}">
              ${thumbnailHtml.replace('recycle-bin-item-thumbnail', 'recycle-bin-item-thumbnail card__bg').replace('recycle-bin-item-thumbnail-placeholder', 'recycle-bin-item-thumbnail-placeholder card__bg')}
              <div class="recycle-bin-item-overlay card__overlay">
                <div class="recycle-bin-item-header card__header">
                  <button class="restore-btn card__btn card__btn--primary" data-id="${item.id}" title="恢复">
                    ${this.ICONS.restore}
                  </button>
                  <button class="delete-btn card__btn card__btn--danger" data-id="${item.id}" title="彻底删除">
                    ${this.ICONS.delete}
                  </button>
                </div>
                <div class="recycle-bin-item-content">${this.escapeHtml(contentPreview)}</div>
                <div class="recycle-bin-item-footer card__footer">
                  <div class="recycle-bin-item-date">删除于 ${deletedDate}</div>
                </div>
              </div>
            </div>
          `;
        })
      );

      listContainer.innerHTML = itemCards.join('');

      // 绑定恢复按钮事件
      listContainer.querySelectorAll('.restore-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.closest('button').dataset.id;
          await this.restoreFromRecycleBin(id);
        });
      });

      // 绑定彻底删除按钮事件
      listContainer.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.closest('button').dataset.id;
          await this.permanentlyDelete(id);
        });
      });
    } catch (error) {
      console.error('Failed to render recycle bin:', error);
      this.showToast('加载回收站失败', 'error');
    }
  }

  /**
   * 从回收站恢复 Prompt
   * @param {string} id - 要恢复的 Prompt ID
   */
  async restoreFromRecycleBin(id) {
    try {
      await window.electronAPI.restoreFromRecycleBin(id);
      this.showToast('已恢复到列表');
      await this.renderRecycleBin();
      await this.loadPrompts();
    } catch (error) {
      console.error('Failed to restore:', error);
      this.showToast('恢复失败: ' + error.message, 'error');
    }
  }

  /**
   * 彻底删除 Prompt
   * @param {string} id - 要删除的 Prompt ID
   */
  async permanentlyDelete(id) {
    const confirmed = await this.showConfirmDialog('确认彻底删除', '确定要彻底删除这个 Prompt 吗？此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.permanentlyDelete(id);
      this.showToast('已彻底删除');
      await this.renderRecycleBin();
    } catch (error) {
      console.error('Failed to delete:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 清空回收站
   * 删除所有回收站中的项目
   */
  async emptyRecycleBin() {
    const confirmed = await this.showConfirmDialog('确认清空回收站', '确定要清空回收站吗？所有项目将被彻底删除，此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.emptyRecycleBin();
      this.showToast('回收站已清空');
      await this.renderRecycleBin();
    } catch (error) {
      console.error('Failed to empty recycle bin:', error);
      this.showToast('清空失败: ' + error.message, 'error');
    }
  }

  // ==================== 图像回收站功能 ====================

  /**
   * 打开图像回收站模态框
   */
  async openImageRecycleBinModal() {
    const modal = document.getElementById('imageRecycleBinModal');
    await this.renderImageRecycleBin();
    modal.style.display = 'flex';
  }

  /**
   * 关闭图像回收站模态框
   */
  closeImageRecycleBinModal() {
    const modal = document.getElementById('imageRecycleBinModal');
    modal.style.display = 'none';
  }

  /**
   * 渲染图像回收站列表
   * 显示所有已删除的图像
   */
  async renderImageRecycleBin() {
    try {
      const items = await window.electronAPI.getImageRecycleBin();
      const listContainer = document.getElementById('imageRecycleBinList');
      const emptyState = document.getElementById('imageRecycleBinEmpty');

      if (items.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
      }

      listContainer.style.display = 'grid';
      emptyState.style.display = 'none';

      // 按删除时间倒序排列
      items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

      // 异步获取缩略图路径
      const itemCards = await Promise.all(
        items.map(async (item) => {
          const deletedDate = new Date(item.deletedAt).toLocaleString('zh-CN');
          let thumbnailHtml = '';
          let bgImageStyle = '';
          
          try {
            const imagePath = item.thumbnailPath || item.relativePath;
            if (imagePath) {
              const fullPath = await window.electronAPI.getImagePath(imagePath);
              bgImageStyle = `background-image: url('file://${fullPath.replace(/\\/g, '/')}');`;
              thumbnailHtml = `<div class="recycle-bin-card-bg" data-path="${imagePath}"></div>`;
            }
          } catch (error) {
            console.error('Failed to get image path:', error);
          }
          
          return `
            <div class="recycle-bin-card" data-id="${item.id}">
              ${thumbnailHtml.replace('recycle-bin-card-bg', 'recycle-bin-card-bg card__bg')}
              <div class="recycle-bin-card-overlay card__overlay">
                <button class="recycle-bin-card-delete-btn card__btn card__btn--danger" data-id="${item.id}" title="彻底删除">
                  ${this.ICONS.delete}
                </button>
                <div class="recycle-bin-card-header card__header">
                  <button class="recycle-bin-card-restore-btn card__btn card__btn--primary" data-id="${item.id}" title="恢复">
                    ${this.ICONS.restore}
                  </button>
                </div>
                <div class="recycle-bin-card-footer card__footer">
                  <div class="recycle-bin-card-info">删除于 ${deletedDate}</div>
                </div>
              </div>
            </div>
          `;
        })
      );

      listContainer.innerHTML = itemCards.join('');

      // 加载卡片背景图
      this.loadRecycleBinCardBackgrounds(listContainer);

      // 绑定恢复按钮事件
      listContainer.querySelectorAll('.recycle-bin-card-restore-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.closest('button').dataset.id;
          this.restoreImage(id);
        });
      });

      // 绑定彻底删除按钮事件
      listContainer.querySelectorAll('.recycle-bin-card-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.closest('button').dataset.id;
          this.permanentlyDeleteImage(id);
        });
      });
    } catch (error) {
      console.error('Failed to render image recycle bin:', error);
      this.showToast('加载图像回收站失败', 'error');
    }
  }

  async loadRecycleBinCardBackgrounds(container) {
    const cards = container.querySelectorAll('.recycle-bin-card');
    for (const card of cards) {
      const bgElement = card.querySelector('.recycle-bin-card-bg, .card__bg');
      if (!bgElement) continue;
      
      const imagePath = bgElement.dataset.path;
      if (!imagePath) continue;
      
      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        bgElement.style.backgroundImage = `url('file://${fullPath.replace(/\\/g, '/')}')`;
      } catch (error) {
        console.error('Failed to load recycle bin card background:', error);
      }
    }
  }

  /**
   * 恢复图像
   * @param {string} id - 要恢复的图像 ID
   */
  async restoreImage(id) {
    try {
      await window.electronAPI.restoreImage(id);
      this.showToast('图像已恢复');
      await this.renderImageRecycleBin();
      await this.renderImageGrid();
    } catch (error) {
      console.error('Failed to restore image:', error);
      this.showToast('恢复失败: ' + error.message, 'error');
    }
  }

  /**
   * 彻底删除图像
   * @param {string} id - 要删除的图像 ID
   */
  async permanentlyDeleteImage(id) {
    const confirmed = await this.showConfirmDialog('确认彻底删除', '确定要彻底删除这个图像吗？此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.permanentDeleteImage(id);
      this.showToast('图像已彻底删除');
      await this.renderImageRecycleBin();
    } catch (error) {
      console.error('Failed to delete image:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 清空图像回收站
   * 删除所有图像回收站中的项目
   */
  async emptyImageRecycleBin() {
    const confirmed = await this.showConfirmDialog('确认清空图像回收站', '确定要清空图像回收站吗？所有图像将被彻底删除，此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.emptyImageRecycleBin();
      this.showToast('图像回收站已清空');
      await this.renderImageRecycleBin();
    } catch (error) {
      console.error('Failed to empty image recycle bin:', error);
      this.showToast('清空失败: ' + error.message, 'error');
    }
  }

  // ==================== 导出孤儿文件 ====================

  /**
   * 简化版导出孤儿文件
   * 流程：选择目录 → 扫描 → 导出并删除 → Toast 提示
   */
  async exportOrphanFilesSimple() {
    // 先选择导出目录
    const exportDir = await window.electronAPI.selectDirectory();
    if (!exportDir) {
      return; // 用户取消选择
    }

    this.showToast('正在扫描孤儿文件...', 'info');

    try {
      // 扫描孤儿文件
      const scanResult = await window.electronAPI.scanOrphanFiles();

      if (scanResult.totalCount === 0) {
        this.showToast('没有发现孤儿文件', 'info');
        return;
      }

      this.showToast(`发现 ${scanResult.totalCount} 个孤儿文件，正在导出...`, 'info');

      // 合并所有孤儿文件
      const allOrphanFiles = [
        ...scanResult.orphanImages,
        ...scanResult.orphanThumbnails
      ];

      // 导出并删除
      const result = await window.electronAPI.exportAndDeleteOrphanFiles(allOrphanFiles, exportDir);

      if (result.failedCount > 0) {
        this.showToast(`导出完成：成功 ${result.exportedCount} 个，失败 ${result.failedCount} 个`, 'warning');
      } else {
        this.showToast(`已导出 ${result.exportedCount} 个文件到 ${result.exportPath}`, 'success');
      }
    } catch (error) {
      console.error('Export orphan files error:', error);
      this.showToast('导出失败: ' + error.message, 'error');
    }
  }

  // ==================== 标签组管理 ====================

  /**
   * 打开标签组编辑 Modal
   * @param {string} type - 'prompt' 或 'image'
   * @param {object} group - 编辑时的标签组数据
   */
  openTagGroupEditModal(type, group = null) {
    const modal = document.getElementById('tagGroupEditModal');
    const titleEl = document.getElementById('tagGroupEditTitle');
    const idEl = document.getElementById('tagGroupEditId');
    const typeEl = document.getElementById('tagGroupEditType');
    const nameEl = document.getElementById('tagGroupEditName');
    const selectTypeEl = document.getElementById('tagGroupEditSelectType');
    const sortOrderEl = document.getElementById('tagGroupEditSortOrder');

    typeEl.value = type;

    if (group) {
      titleEl.textContent = type === 'prompt' ? '编辑提示词标签组' : '编辑图像标签组';
      idEl.value = group.id;
      nameEl.value = group.name;
      // 确保 type 值正确设置
      const groupType = group.type || 'multi';
      selectTypeEl.value = groupType;
      sortOrderEl.value = group.sortOrder || 0;
    } else {
      titleEl.textContent = type === 'prompt' ? '新建提示词标签组' : '新建图像标签组';
      idEl.value = '';
      nameEl.value = '';
      selectTypeEl.value = 'multi';
      sortOrderEl.value = '0';
    }

    modal.style.display = 'flex';
    nameEl.focus();
  }

  /**
   * 关闭标签组编辑 Modal
   */
  closeTagGroupEditModal() {
    const modal = document.getElementById('tagGroupEditModal');
    modal.style.display = 'none';
  }

  /**
   * 保存标签组
   */
  async saveTagGroup() {
    const idEl = document.getElementById('tagGroupEditId');
    const typeEl = document.getElementById('tagGroupEditType');
    const nameEl = document.getElementById('tagGroupEditName');
    const selectTypeEl = document.getElementById('tagGroupEditSelectType');
    const sortOrderEl = document.getElementById('tagGroupEditSortOrder');

    const name = nameEl.value.trim();
    if (!name) {
      this.showToast('请输入标签组名称', 'error');
      return;
    }

    const type = typeEl.value;
    const groupType = selectTypeEl.value;
    const sortOrder = parseInt(sortOrderEl.value) || 0;

    try {
      if (idEl.value) {
        // 更新
        if (type === 'prompt') {
          await window.electronAPI.updatePromptTagGroupAttrs(parseInt(idEl.value), {
            name, type: groupType, sortOrder
          });
        } else {
          await window.electronAPI.updateImageTagGroup(parseInt(idEl.value), {
            name, type: groupType, sortOrder
          });
        }
        this.showToast('标签组已更新');
      } else {
        // 创建
        if (type === 'prompt') {
          await window.electronAPI.createPromptTagGroup(name, groupType, sortOrder);
        } else {
          await window.electronAPI.createImageTagGroup(name, groupType, sortOrder);
        }
        this.showToast('标签组已创建');
      }

      this.closeTagGroupEditModal();

      // 刷新对应的标签管理界面
      if (type === 'prompt') {
        // 获取当前搜索词，刷新标签管理器（包含标签组卡片）
        const searchInput = document.getElementById('tagManagerSearchInput');
        await this.renderPromptTagManager(searchInput ? searchInput.value : '');
      } else {
        // 获取当前搜索词，刷新图像标签管理器（包含标签组卡片）
        const searchInput = document.getElementById('imageTagManagerSearchInput');
        await this.renderImageTagManager(searchInput ? searchInput.value : '');
      }
    } catch (error) {
      console.error('Failed to save tag group:', error);
      this.showToast('保存失败: ' + error.message, 'error');
    }
  }

  /**
   * 打开提示词标签管理 Modal
   */
  async openPromptTagManagerModal() {
    const modal = document.getElementById('promptTagManagerModal');
    await this.renderPromptTagManager();
    modal.style.display = 'flex';
  }

  /**
   * 关闭提示词标签管理 Modal
   */
  closePromptTagManagerModal() {
    const modal = document.getElementById('promptTagManagerModal');
    modal.style.display = 'none';
    // 刷新标签筛选器以更新组信息
    this.renderTagFilters();
  }

  /**
   * 在标签管理界面新建标签
   */
  /**
   * 在标签管理界面新建提示词标签
   * @param {string} defaultValue - 默认输入值（用于重新打开时保留输入）
   * @param {number|null} defaultGroupId - 默认选中的组ID
   */
  async addPromptTagInManager(defaultValue = '', defaultGroupId = null) {
    // 获取标签组列表和现有标签
    const groups = await window.electronAPI.getPromptTagGroups();
    const tagsWithGroup = await window.electronAPI.getPromptTagsWithGroup();

    const result = await this.showInputDialog('新建提示词标签', '请输入标签名称', defaultValue, {
      showGroupSelect: true,
      groups: groups,
      defaultGroupId: defaultGroupId
    });
    if (!result || !result.value || !result.value.trim()) return;

    const trimmedTag = result.value.trim();

    // 检查是否为特殊标签
    if (this.isSpecialTag(trimmedTag)) {
      this.showToast(`"${trimmedTag}" 是系统保留标签，不能使用`, 'error');
      // 重新打开对话框，保留用户输入
      await this.addPromptTagInManager(trimmedTag, result.groupId);
      return;
    }

    // 检查标签是否已存在
    const existingTag = tagsWithGroup.find(t => t.name === trimmedTag);
    if (existingTag) {
      const currentGroupName = existingTag.groupName || '未分组';
      const newGroupName = result.groupId
        ? groups.find(g => g.id === result.groupId)?.name || '未分组'
        : '未分组';

      const confirmed = await this.showConfirmDialog(
        '标签已存在',
        `标签 "${trimmedTag}" 已存在，当前所属组：${currentGroupName}\n\n是否覆盖并移动到：${newGroupName}？`
      );

      if (!confirmed) {
        // 用户取消，重新打开对话框保留输入
        await this.addPromptTagInManager(trimmedTag, result.groupId);
        return;
      }

      // 更新标签组
      try {
        await window.electronAPI.assignPromptTagToBelongGroup(trimmedTag, result.groupId);
        this.showToast('标签组已更新');
      } catch (error) {
        console.error('Failed to assign tag to group:', error);
        this.showToast('更新失败: ' + error.message, 'error');
        // 出错时重新打开对话框保留输入
        await this.addPromptTagInManager(trimmedTag, result.groupId);
        return;
      }
    } else {
      // 创建新标签
      try {
        await window.electronAPI.addPromptTag(trimmedTag);
        // 如果选择了标签组，分配标签到所属组
        if (result.groupId) {
          await window.electronAPI.assignPromptTagToBelongGroup(trimmedTag, result.groupId);
        }
        this.showToast('标签已创建');
      } catch (error) {
        console.error('Failed to add tag:', error);
        this.showToast('创建失败: ' + error.message, 'error');
        // 出错时重新打开对话框保留输入
        await this.addPromptTagInManager(trimmedTag, result.groupId);
        return;
      }
    }

    // 刷新标签列表和筛选器
    const searchInput = document.getElementById('tagManagerSearchInput');
    await this.renderPromptTagManager(searchInput.value);
    this.renderTagFilters();
  }

  /**
   * 渲染提示词标签管理列表
   * 卡片模式：标签组作为卡片，标签显示在卡片内
   */
  async renderPromptTagManager(searchTerm = '') {
    try {
      const tags = await window.electronAPI.getPromptTags();
      const tagsWithGroup = await window.electronAPI.getPromptTagsWithGroup();
      const groups = await window.electronAPI.getPromptTagGroups();
      const groupCardsContainer = document.getElementById('promptTagGroupCards');
      const emptyState = document.getElementById('promptTagManagerEmpty');

      // 根据 viewMode 过滤提示词（safe 模式只统计安全内容）
      const visiblePrompts = this.viewMode === 'safe'
        ? this.prompts.filter(p => p.is_safe !== 0)
        : this.prompts;

      // 计算每个标签的使用数量（基于可见的提示词）
      const tagCounts = {};
      visiblePrompts.forEach(prompt => {
        if (prompt.tags && prompt.tags.length > 0) {
          prompt.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      // 特殊标签列表（不支持删除和编辑）
      const specialTags = PromptManager.getPromptSpecialTags(this.viewMode === 'nsfw');

      // 计算特殊标签的数量（基于可见的提示词）
      const favoriteCount = visiblePrompts.filter(p => p.isFavorite).length;
      const multiImageCount = visiblePrompts.filter(p => p.images && p.images.length >= 2).length;
      const noImageCount = visiblePrompts.filter(p => !p.images || p.images.length === 0).length;

      tagCounts[PromptManager.FAVORITE_TAG] = favoriteCount;
      tagCounts[PromptManager.MULTI_IMAGE_TAG] = multiImageCount;
      tagCounts[PromptManager.NO_IMAGE_TAG] = noImageCount;

      // 仅在 nsfw 模式下计算安全/不安全数量
      if (this.viewMode === 'nsfw') {
        tagCounts[PromptManager.SAFE_TAG] = visiblePrompts.filter(p => p.is_safe !== 0).length;
        tagCounts[PromptManager.UNSAFE_TAG] = visiblePrompts.filter(p => p.is_safe === 0).length;
      }

      // 根据搜索词过滤普通标签（不包含特殊标签）
      const filteredTags = (searchTerm
        ? tags.filter(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
        : tags).filter(tag => !specialTags.includes(tag));

      if (filteredTags.length === 0 && specialTags.length === 0) {
        if (groupCardsContainer) groupCardsContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        emptyState.querySelector('p').textContent = searchTerm ? '没有找到匹配的标签' : '暂无提示词标签';
        return;
      }

      if (groupCardsContainer) groupCardsContainer.style.display = 'grid';
      emptyState.style.display = 'none';

      // 使用通用函数排序标签
      const sortedTags = this.sortTags(filteredTags, tagCounts, this.promptTagSortBy, this.promptTagSortOrder);

      // 使用通用函数分组标签
      const { groupedTags, ungroupedTags } = this.groupTagsByGroup(sortedTags, tagsWithGroup, groups);

      // 渲染标签组卡片（包含特殊标签卡片）
      if (groupCardsContainer) {
        // 使用通用函数生成卡片 HTML
        const specialTagCardHtml = this.generateSpecialTagCardHtml(specialTags, tagCounts, this.escapeHtml.bind(this));
        const ungroupedCardHtml = this.generateUngroupedCardHtml(ungroupedTags, tagCounts, this.escapeHtml.bind(this));

        // 按 sortOrder 排序标签组
        const sortedGroups = groups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        const groupCardsHtml = sortedGroups.map((group, index) => {
          const groupTagList = groupedTags[group.id] || [];
          return this.generateTagGroupCardHtml(group, groupTagList, tagCounts, index === 0, this.escapeHtml.bind(this));
        }).join('');

        groupCardsContainer.innerHTML = specialTagCardHtml + ungroupedCardHtml + groupCardsHtml;

        // 使用通用函数绑定事件
        this.bindTagManagerCardEvents(groupCardsContainer, {
          onDeleteTag: (tag) => this.deletePromptTag(tag),
          onEditTag: (tag) => this.startRenamePromptTag(tag),
          onEditGroup: (group) => this.openTagGroupEditModal('prompt', group),
          onDeleteGroup: (group) => this.deletePromptTagGroup(group.id),
          type: 'prompt',
          groups
        });

        // 绑定拖拽事件
        this.bindPromptTagDragEvents(groupCardsContainer);

        // 绑定右键菜单事件
        this.bindPromptTagGroupContextMenu(groupCardsContainer);
      }
    } catch (error) {
      console.error('Failed to render prompt tag manager:', error);
      this.showToast('加载提示词标签失败', 'error');
    }
  }

  /**
   * 绑定提示词标签组右键菜单事件
   * @param {HTMLElement} groupCardsContainer - 标签组卡片容器
   */
  bindPromptTagGroupContextMenu(groupCardsContainer) {
    // 获取所有标签组卡片（排除特殊标签卡片和未分组卡片）
    const groupCards = groupCardsContainer.querySelectorAll('.tag-group-card[data-group-id]:not(.special-tag-card):not(.ungrouped-card)');

    groupCards.forEach(card => {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const groupId = card.dataset.groupId;
        if (!groupId) return;

        // 使用通用右键菜单
        this.showContextMenu(e, [
          {
            label: '固定到首位',
            action: () => this.pinPromptTagGroupToTop(parseInt(groupId))
          }
        ]);
      });
    });
  }

  /**
   * 将提示词标签组固定到首位
   * @param {number} groupId - 标签组ID
   */
  async pinPromptTagGroupToTop(groupId) {
    try {
      // 获取所有标签组
      const groups = await window.electronAPI.getPromptTagGroups();

      // 按 sortOrder 排序，第一个即为当前首位
      const sortedGroups = groups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const firstSortOrder = sortedGroups[0]?.sortOrder || 0;

      // 将目标组的 sortOrder 设为首位 - 1
      const newSortOrder = firstSortOrder - 1;

      // 更新标签组
      const group = groups.find(g => g.id === groupId);
      if (group) {
        await window.electronAPI.updatePromptTagGroupAttrs(groupId, {
          name: group.name,
          type: group.type,
          sortOrder: newSortOrder
        });

        this.showToast('已固定到首位');

        // 刷新标签管理器
        const searchInput = document.getElementById('tagManagerSearchInput');
        await this.renderPromptTagManager(searchInput ? searchInput.value : '');

        // 刷新主界面标签筛选区
        this.renderTagFilters();
      }
    } catch (error) {
      console.error('Failed to pin tag group to top:', error);
      this.showToast('固定失败: ' + error.message, 'error');
    }
  }

  /**
   * 绑定提示词标签拖拽事件
   * @param {HTMLElement} groupCardsContainer - 标签组卡片容器
   */
  bindPromptTagDragEvents(groupCardsContainer) {
    // 获取所有可拖拽的标签项（包括卡片内和未分组的）
    const allTagItems = document.querySelectorAll('.tag-manager-item[draggable="true"]');
    const dropTargets = document.querySelectorAll('.tag-group-card[data-drop-target="true"]');

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
          await this.assignPromptTagToBelongGroup(tagName, groupId);
          // 刷新列表
          const searchInput = document.getElementById('tagManagerSearchInput');
          await this.renderPromptTagManager(searchInput ? searchInput.value : '');
        }
      });
    });
  }

  /**
   * 分配提示词标签到所属组
   * @param {string} tagName - 标签名称
   * @param {number|null} groupId - 组ID
   */
  async assignPromptTagToBelongGroup(tagName, groupId) {
    try {
      await window.electronAPI.assignPromptTagToBelongGroup(tagName, groupId);
      this.showToast('标签组已更新');
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to assign tag to group:', error);
      this.showToast('更新失败: ' + error.message, 'error');
    }
  }

  /**
   * 绑定提示词标签拖拽到图像的事件
   * @param {HTMLElement} container - 标签容器
   */
  bindPromptTagDragToImageEvents(container) {
    const tagItems = container.querySelectorAll('.tag-filter-item[data-drag-type="prompt-tag"]');

    tagItems.forEach(item => {
      // 阻止按钮的默认点击行为影响拖拽
      item.addEventListener('mousedown', (e) => {
        // 允许拖拽开始
      });

      item.addEventListener('dragstart', (e) => {
        const tag = item.dataset.tag;
        e.dataTransfer.setData('text/plain', tag);
        e.dataTransfer.setData('drag-source', 'prompt-tag');
        e.dataTransfer.effectAllowed = 'copy';
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });
    });
  }

  /**
   * 绑定图像标签筛选区拖拽事件（拖拽到图像卡片）
   * @param {HTMLElement} container - 标签容器
   */
  bindImageTagFilterDragEvents(container) {
    const tagItems = container.querySelectorAll('.tag-filter-item[data-drag-type="image-tag"]');

    tagItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const tag = item.dataset.tag;
        e.dataTransfer.setData('text/plain', tag);
        e.dataTransfer.setData('drag-source', 'image-tag');
        e.dataTransfer.effectAllowed = 'copy';
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });
    });
  }

  /**
   * 开始重命名提示词标签
   * 将标签名称转换为可编辑的输入框
   * @param {string} oldTag - 原标签名称
   */
  startRenamePromptTag(oldTag) {
    const item = document.querySelector(`.tag-manager-item[data-tag="${oldTag}"]`);
    if (!item) return;

    const nameContainer = item.querySelector('.tag-manager-item-name');
    nameContainer.classList.add('editing');
    nameContainer.innerHTML = `
      <input type="text" value="${oldTag}" class="rename-tag-input">
      <div class="tag-edit-actions">
        <button class="btn btn-primary btn-sm confirm-rename-btn">确认</button>
        <button class="btn btn-secondary btn-sm cancel-rename-btn">取消</button>
      </div>
    `;

    const input = nameContainer.querySelector('.rename-tag-input');
    input.focus();
    input.select();

    const confirmBtn = nameContainer.querySelector('.confirm-rename-btn');
    const cancelBtn = nameContainer.querySelector('.cancel-rename-btn');

    confirmBtn.addEventListener('click', async () => {
      const newTag = input.value.trim();
      if (newTag && newTag !== oldTag) {
        // 检查是否为特殊标签
        if (this.isSpecialTag(newTag)) {
          this.showToast(`"${newTag}" 是系统保留标签，不能使用`, 'error');
          // 不关闭编辑框，让用户继续修改
          input.focus();
          input.select();
          return;
        }
        await this.renamePromptTag(oldTag, newTag);
      } else {
        await this.renderPromptTagManager();
      }
    });

    cancelBtn.addEventListener('click', async () => {
      await this.renderPromptTagManager();
    });

    input.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const newTag = input.value.trim();
        if (newTag && newTag !== oldTag) {
          // 检查是否为特殊标签
          if (this.isSpecialTag(newTag)) {
            this.showToast(`"${newTag}" 是系统保留标签，不能使用`, 'error');
            // 不关闭编辑框，让用户继续修改
            input.focus();
            input.select();
            return;
          }
          await this.renamePromptTag(oldTag, newTag);
        } else {
          await this.renderPromptTagManager();
        }
      } else if (e.key === 'Escape') {
        await this.renderPromptTagManager();
      }
    });
  }

  /**
   * 重命名提示词标签
   * 更新标签名称并同步到所有使用该标签的 Prompt
   * @param {string} oldTag - 原标签名称
   * @param {string} newTag - 新标签名称
   */
  async renamePromptTag(oldTag, newTag) {
    try {
      await window.electronAPI.renamePromptTag(oldTag, newTag);
      this.showToast('提示词标签已重命名');
      await this.loadPrompts();
      await this.renderPromptTagManager();
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to rename prompt tag:', error);
      this.showToast('重命名失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除提示词标签
   * 从标签列表中删除，并从所有 Prompt 中移除该标签
   * @param {string} tag - 要删除的标签名称
   */
  async deletePromptTag(tag) {
    const confirmed = await this.showConfirmDialog('确认删除提示词标签', `确定要删除提示词标签 "${tag}" 吗？此标签将从所有 Prompt 中移除。`);
    if (!confirmed) return;

    try {
      await window.electronAPI.deletePromptTag(tag);
      this.showToast('提示词标签已删除');
      await this.renderPromptTagManager();
      await this.loadPrompts();
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to delete prompt tag:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除提示词标签组
   * @param {number} groupId - 标签组ID
   */
  async deletePromptTagGroup(groupId) {
    const confirmed = await this.showConfirmDialog('确认删除', '删除标签组不会删除标签，标签将变为未分组状态。确定要删除吗？');
    if (!confirmed) return;

    try {
      await window.electronAPI.deletePromptTagGroup(groupId);
      this.showToast('标签组已删除');
      const searchInput = document.getElementById('tagManagerSearchInput');
      await this.renderPromptTagManager(searchInput ? searchInput.value : '');
    } catch (error) {
      console.error('Failed to delete prompt tag group:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 打开图像标签管理 Modal
   * 显示所有图像标签并支持管理
   */
  async openImageTagManagerModal() {
    const modal = document.getElementById('imageTagManagerModal');
    await this.renderImageTagManager();
    modal.style.display = 'flex';
  }

  /**
   * 关闭图像标签管理 Modal
   */
  closeImageTagManagerModal() {
    const modal = document.getElementById('imageTagManagerModal');
    modal.style.display = 'none';
  }

  /**
   * 渲染图像标签管理列表
   * 显示所有图像标签及其使用数量（卡片式布局）
   * @param {string} searchTerm - 搜索关键词
   */
  async renderImageTagManager(searchTerm = '') {
    try {
      const tags = await window.electronAPI.getImageTags();
      const tagsWithGroup = await window.electronAPI.getImageTagsWithGroup();
      const groups = await window.electronAPI.getImageTagGroups();
      const groupCardsContainer = document.getElementById('imageTagGroupCards');
      const emptyState = document.getElementById('imageTagManagerEmpty');

      // 计算每个标签的使用数量
      const allImages = await window.electronAPI.getImages();

      // 根据 viewMode 过滤图像（safe 模式只统计安全内容）
      const visibleImages = this.viewMode === 'safe'
        ? allImages.filter(img => img.is_safe !== 0)
        : allImages;

      const tagCounts = {};
      visibleImages.forEach(image => {
        if (image.tags && image.tags.length > 0) {
          image.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      // 特殊标签列表（不支持删除和编辑）
      const specialTags = PromptManager.getImageSpecialTags(this.viewMode === 'nsfw');

      // 计算特殊标签的数量（基于可见的图像）
      const favoriteCount = visibleImages.filter(img => img.isFavorite).length;
      const unreferencedCount = visibleImages.filter(img => !img.promptRefs || img.promptRefs.length === 0).length;
      const multiRefCount = visibleImages.filter(img => img.promptRefs && img.promptRefs.length > 1).length;

      tagCounts[PromptManager.FAVORITE_TAG] = favoriteCount;
      tagCounts[PromptManager.UNREFERENCED_TAG] = unreferencedCount;
      tagCounts[PromptManager.MULTI_REF_TAG] = multiRefCount;

      // 仅在 nsfw 模式下计算安全/不安全数量
      if (this.viewMode === 'nsfw') {
        tagCounts[PromptManager.SAFE_TAG] = visibleImages.filter(img => img.is_safe !== 0).length;
        tagCounts[PromptManager.UNSAFE_TAG] = visibleImages.filter(img => img.is_safe === 0).length;
      }

      // 根据搜索词过滤普通标签（不包含特殊标签）
      const filteredTags = (searchTerm
        ? tags.filter(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
        : tags).filter(tag => !specialTags.includes(tag));

      if (filteredTags.length === 0 && specialTags.length === 0) {
        if (groupCardsContainer) groupCardsContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        emptyState.querySelector('p').textContent = searchTerm ? '没有找到匹配的标签' : '暂无图像标签';
        return;
      }

      if (groupCardsContainer) groupCardsContainer.style.display = 'grid';
      emptyState.style.display = 'none';

      // 使用通用函数排序标签
      const sortedTags = this.sortTags(filteredTags, tagCounts, this.imageTagSortBy, this.imageTagSortOrder);

      // 使用通用函数分组标签
      const { groupedTags, ungroupedTags } = this.groupTagsByGroup(sortedTags, tagsWithGroup, groups);

      // 渲染标签组卡片（包含特殊标签卡片、未分组卡片、标签组卡片）
      if (groupCardsContainer) {
        // 使用通用函数生成卡片 HTML
        const specialTagCardHtml = this.generateSpecialTagCardHtml(specialTags, tagCounts, this.escapeHtml.bind(this));
        const ungroupedCardHtml = this.generateUngroupedCardHtml(ungroupedTags, tagCounts, this.escapeHtml.bind(this));

        // 按 sortOrder 排序标签组
        const sortedGroups = groups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        const groupCardsHtml = sortedGroups.map((group, index) => {
          const groupTagList = groupedTags[group.id] || [];
          return this.generateTagGroupCardHtml(group, groupTagList, tagCounts, index === 0, this.escapeHtml.bind(this));
        }).join('');

        groupCardsContainer.innerHTML = specialTagCardHtml + ungroupedCardHtml + groupCardsHtml;

        // 使用通用函数绑定事件
        this.bindTagManagerCardEvents(groupCardsContainer, {
          onDeleteTag: (tag) => this.deleteImageTag(tag),
          onEditTag: (tag) => this.startRenameImageTag(tag),
          onEditGroup: (group) => this.openTagGroupEditModal('image', group),
          onDeleteGroup: (group) => this.deleteImageTagGroup(group.id),
          type: 'image',
          groups
        });

        // 绑定拖拽事件
        this.bindImageTagDragEvents(groupCardsContainer);

        // 绑定右键菜单事件
        this.bindImageTagGroupContextMenu(groupCardsContainer);
      }
    } catch (error) {
      console.error('Failed to render image tag manager:', error);
      this.showToast('加载图像标签失败', 'error');
    }
  }

  /**
   * 绑定图像标签拖拽事件
   * @param {HTMLElement} groupCardsContainer - 标签组卡片容器
   */
  bindImageTagDragEvents(groupCardsContainer) {
    // 获取所有可拖拽的标签项
    const allTagItems = document.querySelectorAll('#imageTagGroupCards .tag-manager-item[draggable="true"]');
    const dropTargets = document.querySelectorAll('#imageTagGroupCards .tag-group-card[data-drop-target="true"]');

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

        if (tagName && groupId) {
          await this.assignImageTagToBelongGroup(tagName, groupId);
          // 刷新列表
          const searchInput = document.getElementById('imageTagManagerSearchInput');
          await this.renderImageTagManager(searchInput ? searchInput.value : '');
        }
      });
    });
  }

  /**
   * 绑定图像标签组右键菜单事件
   * @param {HTMLElement} groupCardsContainer - 标签组卡片容器
   */
  bindImageTagGroupContextMenu(groupCardsContainer) {
    // 获取所有标签组卡片（排除特殊标签卡片和未分组卡片）
    const groupCards = groupCardsContainer.querySelectorAll('.tag-group-card[data-group-id]:not(.special-tag-card):not(.ungrouped-card)');

    groupCards.forEach(card => {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const groupId = card.dataset.groupId;
        if (!groupId) return;

        // 使用通用右键菜单
        this.showContextMenu(e, [
          {
            label: '固定到首位',
            action: () => this.pinImageTagGroupToTop(parseInt(groupId))
          }
        ]);
      });
    });
  }

  /**
   * 将图像标签组固定到首位
   * @param {number} groupId - 标签组ID
   */
  async pinImageTagGroupToTop(groupId) {
    try {
      // 获取所有标签组
      const groups = await window.electronAPI.getImageTagGroups();

      // 按 sortOrder 排序，第一个即为当前首位
      const sortedGroups = groups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const firstSortOrder = sortedGroups[0]?.sortOrder || 0;

      // 将目标组的 sortOrder 设为首位 - 1
      const newSortOrder = firstSortOrder - 1;

      // 更新标签组
      const group = groups.find(g => g.id === groupId);
      if (group) {
        await window.electronAPI.updateImageTagGroup(groupId, {
          name: group.name,
          type: group.type,
          sortOrder: newSortOrder
        });

        this.showToast('已固定到首位');

        // 刷新标签管理器
        const searchInput = document.getElementById('imageTagManagerSearchInput');
        await this.renderImageTagManager(searchInput ? searchInput.value : '');

        // 刷新主界面图像标签筛选区
        this.renderImageTagFilters();
      }
    } catch (error) {
      console.error('Failed to pin tag group to top:', error);
      this.showToast('固定失败: ' + error.message, 'error');
    }
  }

  /**
   * 分配图像标签到所属组
   * @param {string} tagName - 标签名称
   * @param {number|null} groupId - 组ID
   */
  async assignImageTagToBelongGroup(tagName, groupId) {
    try {
      await window.electronAPI.assignImageTagToBelongGroup(tagName, groupId);
      this.showToast('标签组已更新');
      this.renderImageTagFilters();
    } catch (error) {
      console.error('Failed to assign image tag to group:', error);
      this.showToast('更新失败: ' + error.message, 'error');
    }
  }

  /**
   * 打开创建图像标签对话框
   * @param {string} defaultValue - 默认输入值（用于重新打开时保留输入）
   * @param {number|null} defaultGroupId - 默认选中的组ID
   */
  async openCreateImageTagModal(defaultValue = '', defaultGroupId = null) {
    // 获取标签组列表和现有标签
    const groups = await window.electronAPI.getImageTagGroups();
    const tagsWithGroup = await window.electronAPI.getImageTagsWithGroup();

    const result = await this.showInputDialog('新建图像标签', '请输入标签名称', defaultValue, {
      showGroupSelect: true,
      groups: groups,
      defaultGroupId: defaultGroupId
    });
    if (!result || !result.value || !result.value.trim()) return;

    const trimmedTag = result.value.trim();

    // 检查是否为特殊标签
    if (this.isSpecialTag(trimmedTag)) {
      this.showToast(`"${trimmedTag}" 是系统保留标签，不能使用`, 'error');
      // 重新打开对话框，保留用户输入
      await this.openCreateImageTagModal(trimmedTag, result.groupId);
      return;
    }

    // 检查标签是否已存在
    const existingTag = tagsWithGroup.find(t => t.name === trimmedTag);
    if (existingTag) {
      const currentGroupName = existingTag.groupName || '未分组';
      const newGroupName = result.groupId
        ? groups.find(g => g.id === result.groupId)?.name || '未分组'
        : '未分组';

      const confirmed = await this.showConfirmDialog(
        '标签已存在',
        `标签 "${trimmedTag}" 已存在，当前所属组：${currentGroupName}\n\n是否覆盖并移动到：${newGroupName}？`
      );

      if (!confirmed) {
        // 用户取消，重新打开对话框保留输入
        await this.openCreateImageTagModal(trimmedTag, result.groupId);
        return;
      }

      // 更新标签组
      try {
        await window.electronAPI.assignImageTagToBelongGroup(trimmedTag, result.groupId);
        this.showToast('标签组已更新');
      } catch (error) {
        console.error('Failed to assign tag to group:', error);
        this.showToast('更新失败: ' + error.message, 'error');
        // 出错时重新打开对话框保留输入
        await this.openCreateImageTagModal(trimmedTag, result.groupId);
        return;
      }
    } else {
      // 创建新标签
      try {
        await window.electronAPI.addImageTag(trimmedTag);
        // 如果选择了标签组，分配标签到所属组
        if (result.groupId) {
          await window.electronAPI.assignImageTagToBelongGroup(trimmedTag, result.groupId);
        }
        this.showToast('标签已创建');
      } catch (error) {
        console.error('Failed to add tag:', error);
        this.showToast('创建失败: ' + error.message, 'error');
        // 出错时重新打开对话框保留输入
        await this.openCreateImageTagModal(trimmedTag, result.groupId);
        return;
      }
    }

    // 刷新标签列表和筛选器
    const searchInput = document.getElementById('imageTagManagerSearchInput');
    await this.renderImageTagManager(searchInput?.value || '');
    this.renderImageTagFilters();
  }

  /**
   * 开始重命名图像标签
   * 将标签名称转换为可编辑的输入框
   * @param {string} oldTag - 原标签名称
   */
  startRenameImageTag(oldTag) {
    const item = document.querySelector(`.tag-manager-item[data-tag="${oldTag}"]`);
    if (!item) return;

    const nameContainer = item.querySelector('.tag-manager-item-name');
    nameContainer.classList.add('editing');
    nameContainer.innerHTML = `
      <input type="text" value="${oldTag}" class="rename-tag-input">
      <div class="tag-edit-actions">
        <button class="btn btn-primary btn-sm confirm-rename-btn">确认</button>
        <button class="btn btn-secondary btn-sm cancel-rename-btn">取消</button>
      </div>
    `;

    const input = nameContainer.querySelector('.rename-tag-input');
    input.focus();
    input.select();

    const confirmBtn = nameContainer.querySelector('.confirm-rename-btn');
    const cancelBtn = nameContainer.querySelector('.cancel-rename-btn');

    confirmBtn.addEventListener('click', async () => {
      const newTag = input.value.trim();
      if (newTag && newTag !== oldTag) {
        // 检查是否为特殊标签
        if (this.isSpecialTag(newTag)) {
          this.showToast(`"${newTag}" 是系统保留标签，不能使用`, 'error');
          // 不关闭编辑框，让用户继续修改
          input.focus();
          input.select();
          return;
        }
        await this.renameImageTag(oldTag, newTag);
      } else {
        await this.renderImageTagManager();
      }
    });

    cancelBtn.addEventListener('click', async () => {
      await this.renderImageTagManager();
    });

    input.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const newTag = input.value.trim();
        if (newTag && newTag !== oldTag) {
          // 检查是否为特殊标签
          if (this.isSpecialTag(newTag)) {
            this.showToast(`"${newTag}" 是系统保留标签，不能使用`, 'error');
            // 不关闭编辑框，让用户继续修改
            input.focus();
            input.select();
            return;
          }
          await this.renameImageTag(oldTag, newTag);
        } else {
          await this.renderImageTagManager();
        }
      } else if (e.key === 'Escape') {
        await this.renderImageTagManager();
      }
    });
  }

  /**
   * 检查是否为特殊标签
   * @param {string} tag - 标签名称
   * @returns {boolean} - 是否为特殊标签
   */
  isSpecialTag(tag) {
    const specialTags = PromptManager.getImageSpecialTags(this.viewMode === 'nsfw');
    return specialTags.includes(tag);
  }

  /**
   * 通用标签分组逻辑
   * 将标签按组分组，返回分组和未分组标签
   * @param {string[]} tags - 标签列表
   * @param {Array} tagsWithGroup - 带组信息的标签列表
   * @param {Array} groups - 标签组列表
   * @returns {Object} - { groupedTags, ungroupedTags }
   */
  groupTagsByGroup(tags, tagsWithGroup, groups) {
    const groupedTags = {};
    const ungroupedTags = [];
    const validGroupIds = new Set(groups.map(g => g.id));

    tags.forEach(tag => {
      const tagInfo = tagsWithGroup.find(t => t.name === tag);
      const groupId = tagInfo ? tagInfo.groupId : null;

      if (groupId && validGroupIds.has(groupId)) {
        if (!groupedTags[groupId]) {
          groupedTags[groupId] = [];
        }
        groupedTags[groupId].push(tag);
      } else {
        ungroupedTags.push(tag);
      }
    });

    return { groupedTags, ungroupedTags };
  }

  /**
   * 通用标签排序逻辑
   * @param {string[]} tags - 标签列表
   * @param {Object} tagCounts - 标签计数对象
   * @param {string} sortBy - 排序字段 ('count' | 'name')
   * @param {string} sortOrder - 排序顺序 ('asc' | 'desc')
   * @returns {string[]} - 排序后的标签列表
   */
  sortTags(tags, tagCounts, sortBy, sortOrder) {
    return [...tags].sort((a, b) => {
      const countA = tagCounts[a] || 0;
      const countB = tagCounts[b] || 0;

      if (sortBy === 'count') {
        return sortOrder === 'asc' ? countA - countB : countB - countA;
      } else if (sortBy === 'name') {
        const nameA = a.toLowerCase();
        const nameB = b.toLowerCase();
        if (nameA < nameB) return sortOrder === 'asc' ? -1 : 1;
        if (nameA > nameB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      }
      return 0;
    });
  }

  /**
   * 生成标签项 HTML（用于标签管理卡片）
   * @param {string} tag - 标签名称
   * @param {number} count - 标签计数
   * @param {string|null} groupId - 所属组ID
   * @param {boolean} isSpecial - 是否为特殊标签
   * @param {Function} escapeHtml - HTML转义函数
   * @returns {string} - 标签项 HTML
   */
  generateTagManagerItemHtml(tag, count, groupId = null, isSpecial = false, escapeHtml) {
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
   * 生成特殊标签卡片 HTML
   * @param {string[]} specialTags - 特殊标签列表
   * @param {Object} tagCounts - 标签计数对象
   * @param {Function} escapeHtml - HTML转义函数
   * @returns {string} - 特殊标签卡片 HTML
   */
  generateSpecialTagCardHtml(specialTags, tagCounts, escapeHtml) {
    const specialTagsHtml = specialTags.map(tag => {
      return this.generateTagManagerItemHtml(tag, tagCounts[tag] || 0, null, true, escapeHtml);
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
   * @param {string[]} ungroupedTags - 未分组标签列表
   * @param {Object} tagCounts - 标签计数对象
   * @param {Function} escapeHtml - HTML转义函数
   * @returns {string} - 未分组标签卡片 HTML
   */
  generateUngroupedCardHtml(ungroupedTags, tagCounts, escapeHtml) {
    const ungroupedTagsHtml = ungroupedTags.map(tag => {
      return this.generateTagManagerItemHtml(tag, tagCounts[tag] || 0, null, false, escapeHtml);
    }).join('');

    return `
      <div class="tag-group-card ungrouped-card" data-group-id="">
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
   * @param {Object} group - 标签组对象
   * @param {string[]} tags - 标签列表
   * @param {Object} tagCounts - 标签计数对象
   * @param {boolean} isFirst - 是否为首位组
   * @param {Function} escapeHtml - HTML转义函数
   * @returns {string} - 卡片 HTML
   */
  generateTagGroupCardHtml(group, tags, tagCounts, isFirst, escapeHtml) {
    const firstBadge = isFirst ? '<span class="tag-group-card-first">首位组</span>' : '';
    const sortBadge = `<span class="tag-group-card-sort">#${group.sortOrder || 0}</span>`;
    const typeBadge = `<span class="tag-filter-group-type">${group.type === 'single' ? '单选' : '多选'}</span>`;

    const groupTagsHtml = tags.map(tag => {
      return this.generateTagManagerItemHtml(tag, tagCounts[tag] || 0, group.id, false, escapeHtml);
    }).join('');

    return `
      <div class="tag-group-card" data-group-id="${group.id}" data-group-type="${group.type}" data-drop-target="true">
        <div class="tag-group-card-header">
          <span class="tag-group-card-name">${escapeHtml(group.name)}</span>
          <span class="tag-group-card-sort">${sortBadge}</span>
          ${firstBadge}
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
   * 绑定标签管理卡片事件
   * @param {HTMLElement} container - 卡片容器
   * @param {Object} options - 配置选项
   * @param {Function} options.onDeleteTag - 删除标签回调
   * @param {Function} options.onEditTag - 编辑标签回调
   * @param {Function} options.onEditGroup - 编辑组回调
   * @param {Function} options.onDeleteGroup - 删除组回调
   * @param {string} options.type - 类型 ('prompt' | 'image')
   * @param {Array} options.groups - 标签组列表
   */
  bindTagManagerCardEvents(container, options) {
    const { onDeleteTag, onEditTag, onEditGroup, onDeleteGroup, type, groups } = options;

    // 绑定标签删除事件
    if (onDeleteTag) {
      container.querySelectorAll('.tag-badge-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tag = btn.dataset.tag;
          await onDeleteTag(tag);
        });
      });
    }

    // 绑定标签编辑事件
    if (onEditTag) {
      container.querySelectorAll('.tag-badge-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const tag = btn.dataset.tag;
          onEditTag(tag);
        });
      });
    }

    // 绑定组编辑事件
    if (onEditGroup) {
      container.querySelectorAll('.tag-group-btn.edit').forEach(btn => {
        btn.addEventListener('click', async () => {
          const group = groups.find(g => g.id === parseInt(btn.dataset.id));
          if (group) {
            await onEditGroup(group);
          }
        });
      });
    }

    // 绑定组删除事件
    if (onDeleteGroup) {
      container.querySelectorAll('.tag-group-btn.delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const group = groups.find(g => g.id === parseInt(btn.dataset.id));
          if (group) {
            await onDeleteGroup(group);
          }
        });
      });
    }
  }

  /**
   * 删除图像标签组
   * @param {number} groupId - 标签组ID
   */
  async deleteImageTagGroup(groupId) {
    const confirmed = await this.showConfirmDialog('确认删除', '删除标签组不会删除标签，标签将变为未分组状态。确定要删除吗？');
    if (!confirmed) return;

    try {
      await window.electronAPI.deleteImageTagGroup(groupId);
      this.showToast('标签组已删除');
      const searchInput = document.getElementById('imageTagManagerSearchInput');
      await this.renderImageTagManager(searchInput ? searchInput.value : '');
    } catch (error) {
      console.error('Failed to delete image tag group:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 重命名图像标签
   * 更新标签名称并同步到所有使用该标签的图像
   * @param {string} oldTag - 原标签名称
   * @param {string} newTag - 新标签名称
   */
  async renameImageTag(oldTag, newTag) {
    try {
      await window.electronAPI.renameImageTag(oldTag, newTag);
      this.showToast('图像标签已重命名');
      await this.renderImageTagManager();
      await this.renderImageTagFilters();
    } catch (error) {
      console.error('Failed to rename image tag:', error);
      this.showToast('重命名失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除图像标签
   * 从标签列表中删除，并从所有图像中移除该标签
   * @param {string} tag - 要删除的标签名称
   */
  async deleteImageTag(tag) {
    const confirmed = await this.showConfirmDialog('确认删除图像标签', `确定要删除图像标签 "${tag}" 吗？此标签将从所有图像中移除。`);
    if (!confirmed) return;

    try {
      await window.electronAPI.deleteImageTag(tag);
      this.showToast('图像标签已删除');
      await this.renderImageTagManager();
      await this.renderImageTagFilters();
    } catch (error) {
      console.error('Failed to delete image tag:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 防抖搜索
   * 延迟 300ms 执行搜索，避免频繁触发
   */
  debounceSearch() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.performSearch(), 300);
  }

  /**
   * 防抖图像搜索
   * 延迟 300ms 执行搜索，避免频繁触发
   */
  debounceImageSearch() {
    clearTimeout(this.imageSearchTimeout);
    this.imageSearchTimeout = setTimeout(() => this.performImageSearch(), 300);
  }

  /**
   * 执行图像搜索
   * 根据搜索关键词过滤图像列表
   */
  async performImageSearch() {
    await this.renderImageGrid();
  }

  /**
   * 绑定图像上传事件
   * 支持点击上传和拖拽上传
   */
  bindImageUploadEvents() {
    const uploadArea = document.getElementById('imageUploadArea');
    const imageInput = document.getElementById('imageInput');
    const selectFromManagerBtn = document.getElementById('selectFromImageManagerBtn');

    if (!uploadArea || !imageInput) return;

    // 点击上传区域触发文件选择
    uploadArea.addEventListener('click', () => imageInput.click());

    // 文件选择变化
    imageInput.addEventListener('change', (e) => {
      this.handleImageFiles(e.target.files);
    });

    // 拖拽上传
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      this.handleImageFiles(e.dataTransfer.files);
    });

    // 从图像管理选择按钮
    if (selectFromManagerBtn) {
      selectFromManagerBtn.addEventListener('click', () => this.openImageSelectorForPrompt());
    }
  }

  /**
   * 处理图像文件上传
   * 保存图像到数据目录并生成缩略图
   * @param {FileList} fileList - 要处理的图像文件列表
   */
  async handleImageFiles(fileList) {
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;

      try {
        // 获取文件的临时路径（拖拽或选择时）
        let filePath = file.path;

        // 如果没有 path（例如从 input 选择的文件），需要保存到临时位置
        if (!filePath) {
          // 创建一个临时文件
          const arrayBuffer = await file.arrayBuffer();
          const tempPath = await this.saveTempFile(arrayBuffer, file.name);
          filePath = tempPath;
        }

        // 保存到数据目录
        const imageInfo = await window.electronAPI.saveImageFile(filePath, file.name);

        // 检查是否是重复图像
        if (imageInfo.isDuplicate && imageInfo.duplicateMessage) {
          this.showToast(imageInfo.duplicateMessage, 'info');
        }

        // 只保存图像 ID 到当前图像列表
        this.currentImages.push({
          id: imageInfo.id,
          fileName: imageInfo.fileName
        });

        // 立即保存到数据库
        const promptId = document.getElementById('promptId').value;
        if (promptId) {
          await this.savePromptField('images', this.currentImages);
        }
      } catch (error) {
        console.error('Failed to save image:', error);
        this.showToast('保存图像失败: ' + error.message, 'error');
      }
    }
    this.renderImagePreviews();
  }

  // 渲染图像预览
  async renderImagePreviews() {
    const container = document.getElementById('imagePreviewList');
    if (!container) return;

    // 获取所有图像的完整信息
    const allImages = await window.electronAPI.getImages();

    // 过滤掉没有 ID 的图像
    const validImages = this.currentImages.filter(img => img.id);

    // 获取所有图像的完整路径并渲染
    const previews = await Promise.all(
      validImages.map(async (imgRef, index) => {
        const img = allImages.find(i => i.id === imgRef.id);
        if (!img) return '';
        const imagePath = await window.electronAPI.getImagePath(img.relativePath);
        return `
          <div class="image-preview-item" data-index="${index}">
            <img src="file://${imagePath}" alt="${img.fileName}">
            <button type="button" class="view-image" data-index="${index}" title="查看">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button type="button" class="remove-image" data-index="${index}" title="删除">×</button>
          </div>
        `;
      })
    );

    container.innerHTML = previews.filter(p => p).join('');

    // 绑定删除事件
    container.querySelectorAll('.remove-image').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);

        // 只从当前列表中移除引用，不删除实际文件
        this.currentImages.splice(index, 1);
        this.renderImagePreviews();

        // 立即保存到数据库
        const promptId = document.getElementById('promptId').value;
        if (promptId) {
          await this.savePromptField('images', this.currentImages);
        }
      });
    });

    // 绑定查看事件 - 打开图像详情界面
    container.querySelectorAll('.view-image').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);

        // 准备图像数据
        const detailImages = await Promise.all(
          validImages.map(async (imgRef) => {
            const img = allImages.find(i => i.id === imgRef.id);
            if (!img) return null;
            const imagePath = await window.electronAPI.getImagePath(img.relativePath);
            return {
              ...img,
              fullPath: imagePath
            };
          })
        );
        // 过滤掉无效的图像
        const validDetailImages = detailImages.filter(img => img !== null);
        if (validDetailImages.length > 0) {
          const currentImage = validDetailImages[index];
          // 查找关联的提示词信息
          const promptInfo = this.prompts.find(p => 
            p.images && p.images.some(imgRef => imgRef.id === currentImage.id)
          );
          await this.openImageDetailModal(currentImage, promptInfo || null, validDetailImages, index);
        }
      });
    });

    // 绑定双击事件 - 打开图像查看器
    container.querySelectorAll('.image-preview-item').forEach((item) => {
      item.addEventListener('dblclick', async () => {
        // 从 data-index 获取正确的索引
        const index = parseInt(item.dataset.index);
        // 准备图像数据
        const viewerImages = await Promise.all(
          validImages.map(async (imgRef) => {
            const img = allImages.find(i => i.id === imgRef.id);
            if (!img) return null;
            const imagePath = await window.electronAPI.getImagePath(img.relativePath);
            return {
              ...img,
              fullPath: imagePath
            };
          })
        );
        // 过滤掉无效的图像
        const validViewerImages = viewerImages.filter(img => img !== null);
        if (validViewerImages.length > 0) {
          await this.openImageViewer(validViewerImages, index);
        }
      });
    });

    // 绑定右键菜单事件
    container.querySelectorAll('.image-preview-item').forEach((item) => {
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // 从 data-index 获取正确的索引
        const index = parseInt(item.dataset.index);
        this.showImageContextMenu(e, index);
      });
    });
  }

  /**
   * 排序标签，违单标签排在最前
   * @param {string[]} tags - 标签列表
   * @returns {string[]} - 排序后的标签列表
   */
  sortTagsWithViolationFirst(tags) {
    return [...tags].sort((a, b) => {
      if (a === PromptManager.VIOLATING_TAG) return -1;
      if (b === PromptManager.VIOLATING_TAG) return 1;
      return 0;
    });
  }

  /**
   * 渲染提示词标签列表
   */
  renderPromptTags() {
    const container = document.getElementById('editPromptTagsList');
    if (!container) return;

    // 从 promptTagManager 获取标签列表，过滤违单标签
    const tags = this.promptTagManager ? this.promptTagManager.getTags().filter(tag => tag !== PromptManager.VIOLATING_TAG) : [];

    if (tags.length > 0) {
      container.innerHTML = tags.map(tag => {
        return `<span class="tag tag-removable" data-tag="${this.escapeHtml(tag)}">
          ${this.escapeHtml(tag)}
          <span class="tag-remove-btn" title="删除标签">×</span>
        </span>`;
      }).join('');

      // 绑定删除事件
      container.querySelectorAll('.tag-remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tagElement = btn.closest('.tag-removable');
          const tagName = tagElement.dataset.tag;
          await this.removePromptTag(tagName);
        });
      });
    } else {
      container.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
    }
  }

  /**
   * 删除提示词标签（统一入口）
   * @param {string} tagName - 标签名称
   * @returns {Promise<boolean>}
   */
  async removePromptTag(tagName) {
    return this.removeTagWithManager(this.promptTagManager, tagName);
  }

  /**
   * 添加提示词标签（统一入口）
   * @param {string|string[]} tagInput - 标签名称或标签数组
   * @returns {Promise<boolean>} - 是否成功添加
   */
  async addPromptTag(tagInput) {
    return this.addTagWithManager(this.promptTagManager, tagInput);
  }

  /**
   * 显示图像右键菜单
   * @param {MouseEvent} e - 鼠标事件
   * @param {number} index - 图像索引
   */
  showImageContextMenu(e, index) {
    // 使用通用右键菜单
    this.showContextMenu(e, [
      {
        label: '固定为首图',
        action: () => this.setImageAsFirst(index)
      }
    ]);
  }

  /**
   * 将指定图像设置为第一张（首图）
   * @param {number} index - 图像索引
   */
  async setImageAsFirst(index) {
    if (index <= 0 || index >= this.currentImages.length) return;

    // 将指定图像移到数组第一位
    const image = this.currentImages.splice(index, 1)[0];
    this.currentImages.unshift(image);

    // 重新渲染
    this.renderImagePreviews();
    this.showToast('已固定为首图', 'success');

    // 立即保存到数据库
    const promptId = document.getElementById('promptId').value;
    if (promptId) {
      await this.savePromptField('images', this.currentImages);
    }
  }

  // 绑定图像查看器事件
  bindImageViewerEvents() {
    const viewer = document.getElementById('imageViewer');
    const closeBtn = document.getElementById('imageViewerClose');
    const firstBtn = document.getElementById('imageViewerFirst');
    const prevBtn = document.getElementById('imageViewerPrev');
    const nextBtn = document.getElementById('imageViewerNext');
    const lastBtn = document.getElementById('imageViewerLast');
    const clickLeft = document.getElementById('imageViewerClickLeft');
    const clickRight = document.getElementById('imageViewerClickRight');
    const wrapper = document.getElementById('imageViewerWrapper');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeImageViewer());
    }

    if (firstBtn) {
      firstBtn.addEventListener('click', () => this.showFirstImage());
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.showPrevImage());
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.showNextImage());
    }

    if (lastBtn) {
      lastBtn.addEventListener('click', () => this.showLastImage());
    }

    // 点击左右区域切换
    if (clickLeft) {
      clickLeft.addEventListener('click', () => this.showPrevImage());
    }

    if (clickRight) {
      clickRight.addEventListener('click', () => this.showNextImage());
    }

    // 点击遮罩关闭
    if (viewer) {
      viewer.addEventListener('click', (e) => {
        if (e.target.classList.contains('image-viewer-overlay')) {
          this.closeImageViewer();
        }
      });
    }

    // 滚轮缩放
    if (wrapper) {
      wrapper.addEventListener('wheel', (e) => this.handleImageZoom(e), { passive: false });
    }

    // 拖拽移动
    this.bindImageDrag();

    // 键盘导航
    document.addEventListener('keydown', (e) => {
      if (!viewer.classList.contains('active')) return;

      if (e.key === 'Escape') {
        this.closeImageViewer();
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.showFirstImage();
      } else if (e.key === 'ArrowLeft') {
        this.showPrevImage();
      } else if (e.key === 'ArrowRight') {
        this.showNextImage();
      } else if (e.key === 'End') {
        e.preventDefault();
        this.showLastImage();
      }
    });
  }

  // 处理图像缩放
  handleImageZoom(e) {
    e.preventDefault();
    const img = document.getElementById('imageViewerImg');
    if (!img) return;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.viewerZoom = (this.viewerZoom || 1) * delta;

    // 限制缩放范围
    this.viewerZoom = Math.max(0.5, Math.min(5, this.viewerZoom));

    this.updateImageTransform();
  }

  // 更新图像变换
  updateImageTransform() {
    const img = document.getElementById('imageViewerImg');
    if (!img) return;

    const zoom = this.viewerZoom || 1;
    const translateX = this.viewerTranslateX || 0;
    const translateY = this.viewerTranslateY || 0;

    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoom})`;
  }

  // 绑定图像拖拽
  bindImageDrag() {
    const wrapper = document.getElementById('imageViewerWrapper');
    if (!wrapper) return;

    let isDragging = false;
    let startX, startY;
    let initialTranslateX = 0, initialTranslateY = 0;

    wrapper.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // 只响应左键
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialTranslateX = this.viewerTranslateX || 0;
      initialTranslateY = this.viewerTranslateY || 0;
      wrapper.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      this.viewerTranslateX = initialTranslateX + dx;
      this.viewerTranslateY = initialTranslateY + dy;

      this.updateImageTransform();
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        wrapper.style.cursor = 'grab';
      }
    });

    // 双击重置
    wrapper.addEventListener('dblclick', () => {
      this.viewerZoom = 1;
      this.viewerTranslateX = 0;
      this.viewerTranslateY = 0;
      this.updateImageTransform();
    });
  }

  // 打开图像查看器
  async openImageViewer(images, startIndex = 0) {
    this.viewerImages = images;
    this.viewerCurrentIndex = startIndex;

    // 重置缩放和位置
    this.viewerZoom = 1;
    this.viewerTranslateX = 0;
    this.viewerTranslateY = 0;
    this.updateImageTransform();

    await this.updateImageViewer();

    const viewer = document.getElementById('imageViewer');
    viewer.classList.add('active');

    // 进入全屏模式
    try {
      await window.electronAPI.setFullscreen(true);
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
    }
  }

  // 关闭图像查看器
  async closeImageViewer() {
    const viewer = document.getElementById('imageViewer');
    viewer.classList.remove('active');
    this.viewerImages = [];
    this.viewerCurrentIndex = 0;

    // 退出全屏模式
    try {
      await window.electronAPI.setFullscreen(false);
    } catch (error) {
      console.error('Failed to exit fullscreen:', error);
    }
  }

  // 显示首张
  async showFirstImage() {
    if (this.viewerCurrentIndex > 0) {
      this.viewerCurrentIndex = 0;
      await this.updateImageViewer();
    }
  }

  // 显示上一张
  async showPrevImage() {
    if (this.viewerCurrentIndex > 0) {
      this.viewerCurrentIndex--;
      await this.updateImageViewer();
    }
  }

  // 显示下一张
  async showNextImage() {
    if (this.viewerCurrentIndex < this.viewerImages.length - 1) {
      this.viewerCurrentIndex++;
      await this.updateImageViewer();
    }
  }

  // 显示末张
  async showLastImage() {
    if (this.viewerCurrentIndex < this.viewerImages.length - 1) {
      this.viewerCurrentIndex = this.viewerImages.length - 1;
      await this.updateImageViewer();
    }
  }

  // 更新查看器显示
  async updateImageViewer() {
    const img = document.getElementById('imageViewerImg');
    const counter = document.getElementById('imageViewerCounter');
    const firstBtn = document.getElementById('imageViewerFirst');
    const prevBtn = document.getElementById('imageViewerPrev');
    const nextBtn = document.getElementById('imageViewerNext');
    const lastBtn = document.getElementById('imageViewerLast');

    if (this.viewerImages.length === 0) return;

    const currentImage = this.viewerImages[this.viewerCurrentIndex];

    // 检查是否有 relativePath（旧数据兼容）
    if (!currentImage.relativePath) {
      console.error('Image missing relativePath:', currentImage);
      img.src = '';
      img.alt = 'Image not found';
      return;
    }

    // 获取图像完整路径
    const imagePath = await window.electronAPI.getImagePath(currentImage.relativePath);
    img.src = `file://${imagePath}`;
    img.alt = currentImage.name || '';

    counter.textContent = `${this.viewerCurrentIndex + 1} / ${this.viewerImages.length}`;

    // 更新导航按钮状态
    const isFirst = this.viewerCurrentIndex === 0;
    const isLast = this.viewerCurrentIndex === this.viewerImages.length - 1;

    if (firstBtn) firstBtn.disabled = isFirst;
    if (prevBtn) prevBtn.disabled = isFirst;
    if (nextBtn) nextBtn.disabled = isLast;
    if (lastBtn) lastBtn.disabled = isLast;
  }

  async performSearch() {
    if (this.searchQuery) {
      this.prompts = await window.electronAPI.searchPrompts(this.searchQuery);
    } else {
      await this.loadPrompts();
    }
    this.render();
  }
  
  async loadPrompts() {
    try {
      this.prompts = await window.electronAPI.getPrompts(this.promptSortBy, this.promptSortOrder);
      // Prompts loaded
      this.render();
    } catch (error) {
      console.error('Failed to load prompts:', error);
      this.prompts = [];
      this.render();
    }
  }

  render() {
    this.renderTagFilters();
    this.renderPromptList();
  }

  /**
   * 加载图像数据
   * 统一入口，类似 loadPrompts
   */
  async loadImages() {
    try {
      // 重新加载图像数据
      await this.renderImageGrid();
      this.renderImage();
    } catch (error) {
      console.error('Failed to load images:', error);
      this.renderImage();
    }
  }

  /**
   * 统一渲染图像界面
   * 类似 render()，同时更新标签筛选器和图像列表
   */
  renderImage() {
    this.renderImageTagFilters();
    // renderImageGrid 已在 loadImages 中调用
  }

  // 渲染标签筛选器（按组展示）
  async renderTagFilters() {
    const container = document.getElementById('tagFilterList');
    const specialTagsContainer = document.getElementById('tagFilterSpecialTags');
    const clearBtn = document.getElementById('clearTagFilter');

    // 根据 viewMode 过滤提示词（safe 模式只统计安全内容）
    const visiblePrompts = this.viewMode === 'safe'
      ? this.prompts.filter(p => p.is_safe !== 0)
      : this.prompts;

    // 收集所有标签及其数量（基于可见的提示词）
    const tagCounts = {};
    visiblePrompts.forEach(prompt => {
      if (prompt.tags && prompt.tags.length > 0) {
        prompt.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // 获取标签组信息
    let tagGroups = [];
    let tagsWithGroup = [];
    try {
      tagsWithGroup = await window.electronAPI.getPromptTagsWithGroup();
      tagGroups = await window.electronAPI.getPromptTagGroups();
    } catch (error) {
      console.error('Failed to load tag groups:', error);
    }

    // 计算收藏数量（根据 viewMode 过滤）
    const favoriteCount = visiblePrompts.filter(p => p.isFavorite).length;

    // 计算无图像提示词数量（根据 viewMode 过滤）
    const noImageCount = visiblePrompts.filter(p => !p.images || p.images.length === 0).length;

    // 计算多图像提示词数量（2张及以上，根据 viewMode 过滤）
    const multiImageCount = visiblePrompts.filter(p => p.images && p.images.length >= 2).length;

    // 计算违单提示词数量（根据 viewMode 过滤）
    const violatingCount = visiblePrompts.filter(p => p.tags && p.tags.includes(PromptManager.VIOLATING_TAG)).length;

    // 构建特殊标签列表
    const specialTags = [];
    if (favoriteCount > 0) {
      specialTags.push({ tag: PromptManager.FAVORITE_TAG, count: favoriteCount, class: 'favorite-tag' });
    }
    if (this.viewMode === 'nsfw') {
      const safeCount = this.prompts.filter(p => p.is_safe !== 0).length;
      const unsafeCount = this.prompts.filter(p => p.is_safe === 0).length;
      if (safeCount > 0) {
        specialTags.push({ tag: PromptManager.SAFE_TAG, count: safeCount, class: 'safe-tag' });
      }
      if (unsafeCount > 0) {
        specialTags.push({ tag: PromptManager.UNSAFE_TAG, count: unsafeCount, class: 'unsafe-tag' });
      }
    }
    if (multiImageCount > 0) {
      specialTags.push({ tag: PromptManager.MULTI_IMAGE_TAG, count: multiImageCount, class: 'multi-image-tag' });
    }
    if (noImageCount > 0) {
      specialTags.push({ tag: PromptManager.NO_IMAGE_TAG, count: noImageCount, class: 'no-image-tag' });
    }
    if (violatingCount > 0) {
      specialTags.push({ tag: PromptManager.VIOLATING_TAG, count: violatingCount, class: 'violating-tag' });
    }

    // 按组组织标签
    const groupedTags = {};
    const ungroupedTags = [];

    // 初始化组
    tagGroups.forEach(group => {
      groupedTags[group.name] = { group, tags: [] };
    });

    // 从 tagsWithGroup 获取所有标签（包括计数为0的），而不是仅从 tagCounts
      const promptSpecialTags = PromptManager.getPromptSpecialTags(true);
      tagsWithGroup.forEach(({ name: tag }) => {
        // 跳过特殊标签
        if (promptSpecialTags.includes(tag)) {
          return;
        }

      const count = tagCounts[tag] || 0;
      const tagInfo = tagsWithGroup.find(t => t.name === tag);
      if (tagInfo && tagInfo.groupName && groupedTags[tagInfo.groupName]) {
        groupedTags[tagInfo.groupName].tags.push({ tag, count });
      } else {
        ungroupedTags.push({ tag, count });
      }
    });

    // 根据排序设置对标签进行排序
    const sortTags = (tags) => {
      return tags.sort((a, b) => {
        if (this.promptTagFilterSortBy === 'count') {
          return this.promptTagFilterSortOrder === 'asc' ? a.count - b.count : b.count - a.count;
        } else if (this.promptTagFilterSortBy === 'name') {
          const nameA = a.tag.toLowerCase();
          const nameB = b.tag.toLowerCase();
          if (nameA < nameB) return this.promptTagFilterSortOrder === 'asc' ? -1 : 1;
          if (nameA > nameB) return this.promptTagFilterSortOrder === 'asc' ? 1 : -1;
          return 0;
        }
        return 0;
      });
    };

    // 渲染特殊标签（左侧）
    let specialTagsHtml = '';
    if (specialTags.length > 0) {
      specialTagsHtml += specialTags.map(({ tag, count, class: className }) => {
        const isActive = this.selectedTags.has(tag);
        return `
          <button class="tag-filter-item ${isActive ? 'active' : ''} ${className}" data-tag="${this.escapeHtml(tag)}" data-is-special="true">
            <span class="tag-name">${this.escapeHtml(tag)}</span>
            <span class="tag-badge">${count}</span>
          </button>
        `;
      }).join('');
    }
    specialTagsContainer.innerHTML = specialTagsHtml || '<span class="tag-filter-empty">暂无特殊标签</span>';

    // 渲染普通标签（右侧）
    let html = '';

    // 将分组标签转换为数组并按 sortOrder 排序
    const sortedGroups = Object.entries(groupedTags)
      .map(([groupName, data]) => ({ groupName, ...data }))
      .sort((a, b) => (a.group.sortOrder || 0) - (b.group.sortOrder || 0));

    // 渲染分组标签（只显示有标签的组）
    sortedGroups.forEach(({ groupName, group, tags }) => {
      // 过滤出计数大于0的标签
      const visibleTags = tags.filter(({ count }) => count > 0);
      if (visibleTags.length === 0) return;
      const sortedTags = sortTags([...visibleTags]);
      html += '<div class="tag-filter-group">';
      html += `<div class="tag-filter-group-title">${this.escapeHtml(groupName)} <span class="tag-filter-group-type">${group.type === 'single' ? '单选' : '多选'}</span></div>`;
      html += '<div class="tag-filter-group-content">';
      html += sortedTags.map(({ tag, count }) => {
        const isActive = this.selectedTags.has(tag);
        return `
          <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}" draggable="true" data-drag-type="prompt-tag">
            <span class="tag-name">${this.escapeHtml(tag)}</span>
            <span class="tag-badge">${count}</span>
          </div>
        `;
      }).join('');
      html += '</div></div>';
    });

    // 渲染未分组标签（只显示计数大于0的）
    const visibleUngroupedTags = ungroupedTags.filter(({ count }) => count > 0);
    if (visibleUngroupedTags.length > 0) {
      const sortedTags = sortTags([...visibleUngroupedTags]);
      html += '<div class="tag-filter-group">';
      html += '<div class="tag-filter-group-title">未分组</div>';
      html += '<div class="tag-filter-group-content">';
      html += sortedTags.map(({ tag, count }) => {
        const isActive = this.selectedTags.has(tag);
        return `
          <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}" draggable="true" data-drag-type="prompt-tag">
            <span class="tag-name">${this.escapeHtml(tag)}</span>
            <span class="tag-badge">${count}</span>
          </div>
        `;
      }).join('');
      html += '</div></div>';
    }

    if (html === '') {
      container.innerHTML = '<span class="tag-filter-empty">暂无标签</span>';
      clearBtn.style.display = 'none';
    } else {
      container.innerHTML = html;
    }

    // 显示/隐藏清除按钮
    clearBtn.style.display = this.selectedTags.size > 0 ? 'block' : 'none';

    // 更新摘要信息
    this.updateTagFilterSummary(specialTags, Object.values(groupedTags), ungroupedTags, tagsWithGroup);

    // 绑定点击事件（特殊标签和普通标签）
    const bindTagClick = (item) => {
      item.addEventListener('click', (e) => {
        const tag = item.dataset.tag;

        // 获取标签所属的组信息
        const tagInfo = tagsWithGroup.find(t => t.name === tag);
        const isSingleSelectGroup = tagInfo && tagInfo.groupType === 'single';

        if (e.shiftKey) {
          // Shift+点击：多选模式（单选组仍限制单选）
          if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
          } else {
            if (isSingleSelectGroup && tagInfo) {
              // 单选组：取消同组其他标签
              const groupId = tagInfo.groupId;
              const groupTags = tagsWithGroup.filter(t => t.groupId === groupId);
              groupTags.forEach(t => this.selectedTags.delete(t.name));
            }
            this.selectedTags.add(tag);
          }
        } else {
          // 普通点击：纯单选模式
          if (this.selectedTags.has(tag)) {
            // 如果已选中，则取消选择
            this.selectedTags.delete(tag);
          } else {
            // 未选中：清除所有选择，只选中当前
            this.selectedTags.clear();
            this.selectedTags.add(tag);
          }
        }
        // 先清除提示词选择状态，再渲染
        this.selectedPromptIds.clear();
        this.lastSelectedPromptIndex = -1;
        this.render();
      });
    };

    specialTagsContainer.querySelectorAll('.tag-filter-item').forEach(bindTagClick);
    container.querySelectorAll('.tag-filter-item').forEach(bindTagClick);

    // 绑定标签拖拽事件（支持拖拽到图像）
    this.bindPromptTagDragToImageEvents(container);
  }

  // 清除标签筛选
  clearTagFilter() {
    this.selectedTags.clear();
    // 先清除提示词选择状态，再渲染
    this.selectedPromptIds.clear();
    this.lastSelectedPromptIndex = -1;
    this.render();
  }

  // 切换标签筛选区域收起/展开
  toggleTagFilterSection() {
    const tagFilterSection = document.getElementById('tagFilterSection');
    const toggleBtn = document.getElementById('tagFilterToggleBtn');
    if (tagFilterSection) {
      const isCollapsed = tagFilterSection.classList.toggle('collapsed');
      localStorage.setItem('tagFilterCollapsed', isCollapsed);
      if (toggleBtn) {
        toggleBtn.title = isCollapsed ? '展开标签' : '收起标签';
      }
    }
  }

  // 更新标签筛选区域头部标签（收起时显示）
  updateTagFilterSummary(specialTags, groupedTags, ungroupedTags, tagsWithGroup) {
    const headerTagsEl = document.getElementById('tagFilterHeaderTags');
    if (!headerTagsEl) return;

    const tagsToShow = [];
    let topGroupInfo = null;

    // 1. 所有特殊标签
    specialTags.forEach(({ tag, count, class: className }) => {
      const isActive = this.selectedTags.has(tag);
      tagsToShow.push({
        tag,
        count,
        className: `${className} ${isActive ? 'active' : ''}`,
        isSpecial: true,
        isTopGroup: false
      });
    });

    // 2. 优先级最高的标签组的所有标签（按 sortOrder 字段排序，取最小的）
    const nonEmptyGroups = groupedTags.filter(g => g.tags.length > 0);
    if (nonEmptyGroups.length > 0) {
      // 按 sortOrder 字段排序，取第一个（sortOrder 数值最小的）
      const topGroup = nonEmptyGroups.sort((a, b) => (a.group.sortOrder || 0) - (b.group.sortOrder || 0))[0];
      topGroupInfo = topGroup;
      topGroup.tags.forEach(({ tag, count }) => {
        // 跳过计数为0的标签
        if (count === 0) return;
        // 避免重复添加
        if (!tagsToShow.some(t => t.tag === tag)) {
          const isActive = this.selectedTags.has(tag);
          tagsToShow.push({
            tag,
            count,
            className: isActive ? 'active' : '',
            isSpecial: false,
            isTopGroup: true,
            isSingleSelect: topGroupInfo.group.type === 'single'
          });
        }
      });
    }

    // 3. 所有选中的普通标签（可能包含其他组的）
    this.selectedTags.forEach(tag => {
      // 排除已经在列表中的
      if (!tagsToShow.some(t => t.tag === tag)) {
        // 查找标签数量
        let count = 0;
        const groupTag = groupedTags.flatMap(g => g.tags).find(t => t.tag === tag);
        if (groupTag) {
          count = groupTag.count;
        } else {
          const ungroupedTag = ungroupedTags.find(t => t.tag === tag);
          if (ungroupedTag) {
            count = ungroupedTag.count;
          }
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
      headerTagsEl.innerHTML = tagsToShow.map(({ tag, count, className, isTopGroup, isSingleSelect }) => `
        <button class="tag-filter-item ${className}" data-tag="${this.escapeHtml(tag)}" data-is-special="true" data-is-top-group="${isTopGroup}" data-is-single-select="${isSingleSelect || false}">
          <span class="tag-name">${this.escapeHtml(tag)}</span>
          <span class="tag-badge">${count}</span>
        </button>
      `).join('');

      // 绑定点击事件
      headerTagsEl.querySelectorAll('.tag-filter-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const tag = item.dataset.tag;
          const isTopGroupTag = item.dataset.isTopGroup === 'true';
          const isSingleSelectGroup = item.dataset.isSingleSelect === 'true';

          if (e.shiftKey) {
            // Shift+点击：多选模式（单选组仍限制单选）
            if (this.selectedTags.has(tag)) {
              this.selectedTags.delete(tag);
            } else {
              if (isTopGroupTag && isSingleSelectGroup && topGroupInfo) {
                // 单选组：取消同组其他标签
                const groupTags = topGroupInfo.tags.map(t => t.tag);
                groupTags.forEach(t => this.selectedTags.delete(t));
              }
              this.selectedTags.add(tag);
            }
          } else {
            // 普通点击：单选模式（特殊标签也单选）
            if (this.selectedTags.has(tag)) {
              this.selectedTags.delete(tag);
            } else {
              // 先清除所有已选标签
              this.selectedTags.clear();
              this.selectedTags.add(tag);
            }
          }
          // 先清除提示词选择状态，再渲染
          this.selectedPromptIds.clear();
          this.lastSelectedPromptIndex = -1;
          this.render();
        });
      });
    }
  }

  async renderPromptList() {
    const container = document.getElementById('promptList');
    const listContainer = document.getElementById('promptListView');
    const emptyState = document.getElementById('emptyState');

    // 过滤 Prompts
    let filtered = this.prompts;

    // 根据 viewMode 过滤（safe 模式只显示安全内容）
    if (this.viewMode === 'safe') {
      filtered = filtered.filter(prompt => prompt.is_safe !== 0);
    }

    // 标签筛选（多选时同时符合）
    if (this.selectedTags.size > 0) {
      filtered = filtered.filter(prompt => {
        return Array.from(this.selectedTags).every(tag => {
          if (tag === PromptManager.FAVORITE_TAG) {
            return prompt.isFavorite;
          } else if (tag === PromptManager.SAFE_TAG) {
            return prompt.is_safe !== 0;
          } else if (tag === PromptManager.UNSAFE_TAG) {
            return prompt.is_safe === 0;
          } else if (tag === PromptManager.MULTI_IMAGE_TAG) {
            return prompt.images && prompt.images.length >= 2;
          } else if (tag === PromptManager.NO_IMAGE_TAG) {
            return !prompt.images || prompt.images.length === 0;
          } else {
            // 普通标签
            return prompt.tags && prompt.tags.includes(tag);
          }
        });
      });
    }

    // 保存筛选后的列表，用于编辑模态框导航
    this.filteredPrompts = filtered;

    if (filtered.length === 0) {
      container.style.display = 'none';
      if (listContainer) listContainer.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    if (this.promptViewMode === 'grid') {
      // 网格视图
      container.style.display = 'grid';
      if (listContainer) listContainer.style.display = 'none';
      container.innerHTML = filtered.map(prompt => this.createPromptCard(prompt, this.promptSortBy)).join('');

      // 绑定卡片事件
      filtered.forEach(prompt => {
        const card = document.querySelector(`[data-id="${prompt.id}"]`);
        if (card) {
          card.addEventListener('click', (e) => {
            if (!e.target.closest('.action-btn')) {
              this.openEditModal(prompt, { filteredList: filtered });
            }
          });

          const copyBtn = card.querySelector('.copy-btn');
          const deleteBtn = card.querySelector('.delete-btn');
          const favoriteBtn = card.querySelector('.favorite-btn');

          if (copyBtn) {
            copyBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              try {
                await window.electronAPI.copyToClipboard(prompt.content);
                this.showToast('已复制到剪贴板', 'success');
              } catch (error) {
                this.showToast('复制失败', 'error');
              }
            });
          }

          if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              // 弹出确认对话框
              const confirmed = await this.showConfirmDialog('确认删除', '确定要删除这个 提示词 吗？已删除的 提示词 会进入回收站，可以从回收站恢复。');
              if (confirmed) {
                await this.deletePrompt(prompt.id);
              }
            });
          }

          if (favoriteBtn) {
            favoriteBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              await this.toggleFavorite(prompt.id, !prompt.isFavorite);
            });
          }
        }
      });

      // 异步加载卡片背景图
      this.loadCardBackgrounds();

      // 绑定提示词卡片 hover 预览事件
      this.bindPromptHoverPreview('.prompt-card');

      // 绑定提示词卡片拖放事件 - 接收标签
      this.bindPromptCardDropEvents(container);
    } else {
      // 列表视图
      container.style.display = 'none';
      if (listContainer) {
        listContainer.style.display = 'flex';
        await this.renderPromptListView(filtered);
      }
    }
  }

  /**
   * 渲染提示词列表视图
   * @param {Array} filtered - 筛选后的提示词列表
   */
  async renderPromptListView(filtered) {
    const listContainer = document.getElementById('promptListView');
    if (!listContainer) return;

    const favoriteIcon = (isFavorite) => isFavorite ? this.ICONS.favorite.filled : this.ICONS.favorite.outline;
    const isCompact = this.promptViewMode === 'list-compact';

    // 获取所有图像信息用于查找首图
    const allImages = await window.electronAPI.getImages();

    // 准备提示词数据（包含首图信息）
    const promptData = await Promise.all(
      filtered.map(async (prompt) => {
        // 生成标签 HTML
        const tagsHtml = this.generateTagsHtml(prompt.tags, 'prompt-list-tag', 'prompt-list-tag-empty');
        const hasImages = prompt.images && prompt.images.length > 0;

        // 获取首图ID和缩略图
        let thumbnailHtml = '';
        let firstImageId = '';
        if (hasImages && prompt.images[0]) {
          firstImageId = prompt.images[0].id || prompt.images[0];
          const img = allImages.find(i => i.id === firstImageId);
          if (img) {
            const imagePath = img.thumbnailPath || img.relativePath;
            if (imagePath) {
              try {
                const fullPath = await window.electronAPI.getImagePath(imagePath);
                thumbnailHtml = `<img src="file://${fullPath}" alt="${this.escapeHtml(prompt.title || '预览')}" class="prompt-list-thumbnail">`;
              } catch (error) {
                console.error('Failed to get image path:', error);
              }
            }
          }
        }

        // 如果没有缩略图，使用占位符
        if (!thumbnailHtml) {
          thumbnailHtml = `
            <div class="prompt-list-thumbnail-placeholder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </div>
          `;
        }

        return {
          prompt,
          tagsHtml,
          thumbnailHtml,
          firstImageId,
          hasImages
        };
      })
    );

    // 生成列表项 HTML
    listContainer.innerHTML = promptData.map(({ prompt, tagsHtml, thumbnailHtml, firstImageId, hasImages }, index) => {
      const hasImagesClass = hasImages ? 'has-images' : '';
      const isSelected = this.selectedPromptIds.has(prompt.id);
      const isCompactClass = isCompact ? 'is-compact' : '';
      
      // 生成备注 HTML（仅在非紧凑视图）
      const noteHtml = !isCompact ? this.generateNoteHtml(prompt.note, 'prompt-list-note') : '';
      
      // 紧凑视图：显示缩略图、标题和标签
      if (isCompact) {
        return `
          <div class="prompt-list-item ${isCompactClass} ${prompt.isFavorite ? 'is-favorite' : ''} ${isSelected ? 'is-selected' : ''} ${hasImagesClass}" 
               data-id="${prompt.id}" 
               data-first-image="${firstImageId}" 
               data-index="${index}"
               data-drop-target="prompt">
            <input type="checkbox" class="prompt-list-checkbox" ${isSelected ? 'checked' : ''} data-id="${prompt.id}" data-index="${index}">
            ${thumbnailHtml}
            <div class="prompt-list-text-content">
              <div class="prompt-list-item-header">
                <div class="prompt-list-title">${this.escapeHtml(prompt.title || '无标题')}</div>
                <div class="prompt-list-tags">${tagsHtml}</div>
              </div>
            </div>
            <div class="prompt-list-actions">
              <button type="button" class="favorite-btn ${prompt.isFavorite ? 'active' : ''}" title="${prompt.isFavorite ? '取消收藏' : '收藏'}" data-id="${prompt.id}">
                ${favoriteIcon(prompt.isFavorite)}
              </button>
              <button type="button" class="delete-btn" title="删除" data-id="${prompt.id}">
                ${this.ICONS.delete}
              </button>
            </div>
          </div>
        `;
      }

      // 列表视图：显示完整信息
      return `
        <div class="prompt-list-item ${isCompactClass} ${prompt.isFavorite ? 'is-favorite' : ''} ${isSelected ? 'is-selected' : ''} ${hasImagesClass}" 
             data-id="${prompt.id}" 
             data-first-image="${firstImageId}" 
             data-index="${index}"
             data-drop-target="prompt">
          <input type="checkbox" class="prompt-list-checkbox" ${isSelected ? 'checked' : ''} data-id="${prompt.id}" data-index="${index}">
          ${thumbnailHtml}
          <div class="prompt-list-text-content">
            <div class="prompt-list-item-header">
              <div class="prompt-list-title">${this.escapeHtml(prompt.title || '无标题')}</div>
              <div class="prompt-list-tags">${tagsHtml}</div>
            </div>
            <div class="prompt-list-content">${this.escapeHtml(prompt.content)}</div>
            ${noteHtml}
          </div>
          <div class="prompt-list-actions">
            <button type="button" class="copy-btn" title="复制内容" data-id="${prompt.id}">
              ${this.ICONS.copy}
            </button>
            <button type="button" class="favorite-btn ${prompt.isFavorite ? 'active' : ''}" title="${prompt.isFavorite ? '取消收藏' : '收藏'}" data-id="${prompt.id}">
              ${favoriteIcon(prompt.isFavorite)}
            </button>
            <button type="button" class="delete-btn" title="删除" data-id="${prompt.id}">
              ${this.ICONS.delete}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // 绑定列表项事件
    this.bindPromptListItemEvents(listContainer, filtered);

    // 绑定列表项 hover 预览事件
    this.bindPromptHoverPreview('.prompt-list-item');

    // 绑定提示词列表项拖放事件 - 接收标签
    this.bindPromptCardDropEvents(listContainer);
    
    // 渲染批量操作工具栏
    this.renderPromptBatchOperationToolbar();
  }

  /**
   * 绑定提示词列表项事件
   * @param {HTMLElement} listContainer - 列表容器
   * @param {Array} filtered - 筛选后的提示词列表
   */
  bindPromptListItemEvents(listContainer, filtered) {
    listContainer.querySelectorAll('.prompt-list-item').forEach(item => {
      const promptId = item.dataset.id;
      const index = parseInt(item.dataset.index);
      const prompt = filtered.find(p => p.id === promptId);
      if (!prompt) return;

      // 复选框点击
      const checkbox = item.querySelector('.prompt-list-checkbox');
      if (checkbox) {
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
          // 复选框直接切换选择状态
          if (this.selectedPromptIds.has(promptId)) {
            this.selectedPromptIds.delete(promptId);
          } else {
            this.selectedPromptIds.add(promptId);
          }
          this.lastSelectedPromptIndex = index;
          this.renderPromptList();
          this.renderPromptBatchOperationToolbar();
        });
      }

      // 点击整行（非复选框、非操作按钮区域）
      item.addEventListener('click', (e) => {
        if (e.target.closest('.prompt-list-checkbox') || e.target.closest('.prompt-list-actions')) {
          return;
        }
        
        // Ctrl+点击或Shift+点击：多选
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          this.handlePromptItemSelection(promptId, index, e);
        } else {
          // 普通点击：打开编辑（与图像列表一致）
          this.openEditModal(prompt, { filteredList: filtered });
        }
      });

      // 复制按钮
      const copyBtn = item.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await window.electronAPI.copyToClipboard(prompt.content);
            this.showToast('已复制到剪贴板', 'success');
          } catch (error) {
            this.showToast('复制失败', 'error');
          }
        });
      }

      // 收藏按钮
      const favoriteBtn = item.querySelector('.favorite-btn');
      if (favoriteBtn) {
        favoriteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.toggleFavorite(prompt.id, !prompt.isFavorite);
        });
      }

      // 删除按钮
      const deleteBtn = item.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await this.showConfirmDialog('确认删除', '确定要删除这个 Prompt 吗？已删除的 Prompt 会进入回收站，可以从回收站恢复。');
          if (confirmed) {
            await this.deletePrompt(prompt.id);
          }
        });
      }
    });
  }

  /**
   * 处理提示词列表项选择
   * @param {string} promptId - 提示词ID
   * @param {number} index - 索引
   * @param {Event} e - 事件对象
   */
  handlePromptItemSelection(promptId, index, e) {
    // 只有 Ctrl/Shift 点击才处理选择（与图像列表一致）
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+点击：切换选择
      if (this.selectedPromptIds.has(promptId)) {
        this.selectedPromptIds.delete(promptId);
      } else {
        this.selectedPromptIds.add(promptId);
      }
      this.lastSelectedPromptIndex = index;
      this.renderPromptList();
      this.renderPromptBatchOperationToolbar();
    } else if (e.shiftKey && this.lastSelectedPromptIndex !== -1) {
      // Shift+点击：范围选择
      const start = Math.min(this.lastSelectedPromptIndex, index);
      const end = Math.max(this.lastSelectedPromptIndex, index);
      
      // 获取当前可见的提示词
      const visiblePrompts = this.filteredPrompts || this.prompts;
      
      for (let i = start; i <= end; i++) {
        if (visiblePrompts[i]) {
          this.selectedPromptIds.add(visiblePrompts[i].id);
        }
      }
      this.lastSelectedPromptIndex = index;
      this.renderPromptList();
      this.renderPromptBatchOperationToolbar();
    }
    // 普通点击：不处理（由调用方处理打开编辑）
  }

  /**
   * 清除提示词选择
   */
  clearPromptSelection() {
    this.selectedPromptIds.clear();
    this.lastSelectedPromptIndex = -1;
    this.renderPromptList();
  }

  /**
   * 反选提示词
   */
  invertPromptSelection() {
    const visiblePrompts = this.filteredPrompts || this.prompts;
    const newSelection = new Set();
    
    visiblePrompts.forEach(prompt => {
      if (!this.selectedPromptIds.has(prompt.id)) {
        newSelection.add(prompt.id);
      }
    });
    
    this.selectedPromptIds = newSelection;
    this.lastSelectedPromptIndex = -1;
    this.renderPromptList();
  }

  /**
   * 渲染提示词批量操作工具栏
   */
  renderPromptBatchOperationToolbar() {
    const toolbar = document.getElementById('promptBatchToolbar');
    const selectAllCheckbox = document.getElementById('promptBatchSelectAllCheckbox');
    const selectedCountEl = document.getElementById('promptBatchSelectedCount');
    const actionsContainer = document.getElementById('promptBatchToolbarActions');

    if (!toolbar || !selectAllCheckbox || !selectedCountEl || !actionsContainer) return;

    const selectedCount = this.selectedPromptIds.size;
    const totalCount = (this.filteredPrompts || this.prompts).length;

    // 更新全选复选框状态
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalCount;

    if (selectedCount === 0) {
      toolbar.style.display = 'none';
      return;
    }

    toolbar.style.display = 'flex';
    selectedCountEl.textContent = `已选择 ${selectedCount} 项`;

    // 根据选中提示词的收藏状态决定按钮文字
    const selectedPrompts = (this.filteredPrompts || this.prompts).filter(p => this.selectedPromptIds.has(p.id));
    const allFavorited = selectedPrompts.length > 0 && selectedPrompts.every(p => p.isFavorite);
    const favoriteBtnText = allFavorited ? '批量取消收藏' : '批量收藏';

    // 渲染操作按钮
    actionsContainer.innerHTML = `
      <button type="button" class="btn btn-sm btn-secondary" id="promptBatchInvertBtn" title="反选">
        反选
      </button>
      <button type="button" class="btn btn-sm btn-primary" id="promptBatchFavoriteBtn" title="${favoriteBtnText}">
        ${favoriteBtnText}
      </button>
      <button type="button" class="btn btn-sm btn-primary" id="promptBatchAddTagBtn" title="批量添加标签">
        批量添加标签
      </button>
      <button type="button" class="btn btn-sm btn-danger" id="promptBatchDeleteBtn" title="批量删除">
        批量删除
      </button>
      <button type="button" class="btn btn-sm btn-secondary" id="promptBatchCancelBtn" title="取消选择">
        取消选择
      </button>
    `;

    // 绑定事件
    document.getElementById('promptBatchInvertBtn').onclick = () => this.invertPromptSelection();
    document.getElementById('promptBatchFavoriteBtn').onclick = () => this.batchFavoritePrompts();
    document.getElementById('promptBatchAddTagBtn').onclick = () => this.batchAddTagsToPrompts();
    document.getElementById('promptBatchDeleteBtn').onclick = () => this.batchDeletePrompts();
    document.getElementById('promptBatchCancelBtn').onclick = () => this.clearPromptSelection();
  }

  /**
   * 批量收藏提示词
   */
  async batchFavoritePrompts() {
    const ids = Array.from(this.selectedPromptIds);
    if (ids.length === 0) return;

    try {
      const prompts = (this.filteredPrompts || this.prompts).filter(p => this.selectedPromptIds.has(p.id));
      const allFavorited = prompts.every(p => p.isFavorite);
      const newState = !allFavorited;

      for (const id of ids) {
        await this.toggleFavorite(id, newState);
      }

      this.showToast(`${ids.length} 个提示词已${newState ? '收藏' : '取消收藏'}`);
      await this.loadPrompts();  // 使用统一加载方法
      this.renderPromptBatchOperationToolbar();
    } catch (error) {
      console.error('Batch favorite prompts error:', error);
      this.showToast('批量收藏失败', 'error');
    }
  }

  /**
   * 批量添加标签到提示词
   */
  async batchAddTagsToPrompts() {
    const ids = Array.from(this.selectedPromptIds);
    if (ids.length === 0) return;

    const tag = await this.showInputDialog('添加标签', '输入要添加的标签（多个标签用逗号分隔）');
    if (!tag || tag.trim() === '') return;

    try {
      const tags = tag.split(',').map(t => t.trim()).filter(t => t);
      const tagsWithGroup = await window.electronAPI.getPromptTagsWithGroup();

      for (const id of ids) {
        const prompt = this.prompts.find(p => p.id === id);
        if (!prompt) continue;

        let currentTags = prompt.tags ? [...prompt.tags] : [];

        for (const tagName of tags) {
          if (currentTags.includes(tagName)) continue;

          const result = await TagManager.addTagWithViolationCheck(currentTags, tagName, tagsWithGroup);
          currentTags = result.tags;
        }

        await window.electronAPI.updatePrompt(id, {
          tags: currentTags
        });

        prompt.tags = currentTags;
      }

      this.showToast(`${ids.length} 个提示词已添加标签`);
      await this.loadPrompts();  // 使用统一加载方法
      this.renderPromptBatchOperationToolbar();
    } catch (error) {
      console.error('Batch add tags error:', error);
      this.showToast('批量添加标签失败', 'error');
    }
  }

  /**
   * 批量删除提示词
   */
  async batchDeletePrompts() {
    const ids = Array.from(this.selectedPromptIds);
    if (ids.length === 0) return;

    const confirmed = await this.showConfirmDialog(
      '确认批量删除',
      `确定要删除选中的 ${ids.length} 个 Prompt 吗？已删除的 Prompt 会进入回收站，可以从回收站恢复。`
    );

    if (!confirmed) return;

    try {
      for (const id of ids) {
        await window.electronAPI.deletePrompt(id);
      }
      this.showToast(`${ids.length} 个提示词已删除`);
      this.clearPromptSelection();
      await this.loadPrompts();  // 统一加载，避免重复调用
    } catch (error) {
      console.error('Batch delete prompts error:', error);
      this.showToast('批量删除失败', 'error');
    }
  }

  /**
   * 通用 hover 预览绑定
   * @param {string} selector - CSS 选择器
   * @param {Function} getContentFn - 获取内容的函数
   * @param {Function} getImageIdFn - 获取图像 ID 的函数
   */
  bindHoverPreview(selector, getContentFn, getImageIdFn) {
    const manager = new HoverTooltipManager(
      'promptPreviewTooltip',
      'promptPreviewContent',
      'promptPreviewImage'
    );

    manager.bind(selector, {
      getContent: getContentFn,
      getImageId: getImageIdFn,
      delay: 500
    });
  }

  /**
   * 绑定提示词 hover 预览（通用）
   * @param {string} selector - CSS 选择器
   */
  bindPromptHoverPreview(selector) {
    this.bindHoverPreview(
      selector,
      (element) => {
        const prompt = this.prompts.find(p => p.id === element.dataset.id);
        return prompt?.content || '';
      },
      (element) => element.dataset.firstImage
    );
  }

  /**
   * 绑定图像 hover 预览（通用）
   * @param {string} selector - CSS 选择器
   */
  bindImageHoverPreview(selector) {
    this.bindHoverPreview(
      selector,
      (element) => {
        const imageId = element.dataset.imageId;
        const image = this.imageGridImages.find(i => i.id === imageId);
        if (!image || !image.promptRefs || image.promptRefs.length === 0) {
          return '';
        }
        return image.promptRefs[0].promptContent || '';
      },
      (element) => element.dataset.imageId
    );
  }

  /**
   * 创建 Prompt 卡片 HTML
   * @param {Object} prompt - Prompt 数据对象
   * @param {string} sortBy - 排序字段
   * @returns {string} 卡片 HTML 字符串
   */
  createPromptCard(prompt, sortBy = 'updatedAt') {
    // 使用 generateTagsHtml 生成标签（自动过滤所有特殊标签）
    const tags = this.generateTagsHtml(prompt.tags, 'tag', 'tag-empty');

    // 检查是否有图像
    const hasImages = prompt.images && prompt.images.length > 0;

    // 收藏按钮图标
    const favoriteIcon = prompt.isFavorite ? this.ICONS.favorite.filled : this.ICONS.favorite.outline;

    // 无图像标记
    const noImageBadge = !hasImages ? `<div class="prompt-card-no-image-badge" title="无图像关联">无图像</div>` : '';

    // 背景图像（首图）
    const backgroundImage = hasImages ? `<div class="prompt-card-bg" data-first-image="${prompt.images[0].id}"></div>` : '';

    // 根据排序规则确定底部显示内容
    let dynamicInfo = '';
    if (sortBy === 'updatedAt' && prompt.updatedAt) {
      const date = new Date(prompt.updatedAt);
      dynamicInfo = `<div class="prompt-card-dynamic-info">更新于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else if (sortBy === 'createdAt' && prompt.createdAt) {
      const date = new Date(prompt.createdAt);
      dynamicInfo = `<div class="prompt-card-dynamic-info">创建于 ${date.toLocaleDateString('zh-CN')}</div>`;
    } else {
      // 默认显示标题
      dynamicInfo = `<div class="prompt-card-title">${this.escapeHtml(prompt.title)}</div>`;
    }

    return `
      <div class="prompt-card ${prompt.isFavorite ? 'is-favorite' : ''} ${hasImages ? 'has-images' : 'no-images'}" data-id="${prompt.id}" data-first-image="${hasImages ? prompt.images[0].id : ''}" data-drop-target="prompt">
        ${backgroundImage.replace('prompt-card-bg', 'prompt-card-bg card__bg')}
        <div class="prompt-card-overlay card__overlay">
          <div class="prompt-card-header card__header">
            <div class="prompt-card-actions-left">
              <button class="favorite-btn ${prompt.isFavorite ? 'active' : ''}" title="${prompt.isFavorite ? '取消收藏' : '收藏'}" data-id="${prompt.id}">
                ${favoriteIcon}
              </button>
              <button class="action-btn copy-btn" title="复制内容">
                ${this.ICONS.copy}
              </button>
            </div>
            <div class="prompt-card-actions-right">
              <button class="action-btn delete-btn" title="删除">
                ${this.ICONS.delete}
              </button>
            </div>
          </div>
          <div class="prompt-card-content">${this.escapeHtml(prompt.content)}</div>
          <div class="prompt-card-footer card__footer">
            <div class="prompt-card-tags">${tags}</div>
            ${dynamicInfo}
          </div>
          ${noImageBadge}
        </div>
      </div>
    `;
  }

  /**
   * 异步加载卡片缩略图
   * 为 Prompt 卡片加载图像缩略图
   * @param {Object} prompt - Prompt 数据对象
   */
  async loadCardBackgrounds() {
    // 获取所有有图像的提示词卡片
    const cards = document.querySelectorAll('.prompt-card.has-images');
    if (cards.length === 0) return;

    // 为每张卡片加载首图作为背景
    for (const card of cards) {
      const bgElement = card.querySelector('.prompt-card-bg, .card__bg');
      if (!bgElement) continue;

      const firstImageId = bgElement.dataset.firstImage;
      if (!firstImageId) continue;

      try {
        // 获取提示词关联的图像
        const promptImages = await window.electronAPI.getPromptImages(card.dataset.id);
        if (!promptImages || promptImages.length === 0) continue;

        // 过滤掉已删除的图像
        const validImages = promptImages.filter(img => !img.isDeleted);
        if (validImages.length === 0) continue;

        const firstImage = validImages[0];
        if (firstImage.id !== firstImageId) continue;

        const imagePath = firstImage.thumbnailPath || firstImage.relativePath;
        if (!imagePath) continue;

        const fullPath = await window.electronAPI.getImagePath(imagePath);
        const normalizedPath = fullPath.replace(/\\/g, '/');
        const bgUrl = `url("file://${normalizedPath}")`;
        bgElement.style.backgroundImage = bgUrl;
      } catch (error) {
        console.error('Failed to load background image:', error);
      }
    }
  }

  /**
   * 异步加载图像卡片背景图
   */
  async loadImageCardBackgrounds() {
    const cards = document.querySelectorAll('.image-card[data-image-path]');
    if (cards.length === 0) return;

    for (const card of cards) {
      const bgElement = card.querySelector('.image-card-bg, .card__bg');
      if (!bgElement) continue;

      const imagePath = card.dataset.imagePath;
      if (!imagePath) continue;

      try {
        const normalizedPath = imagePath.replace(/\\/g, '/');
        const encodedPath = encodeURI(normalizedPath);
        const bgUrl = `url("file://${encodedPath}")`;
        bgElement.style.backgroundImage = bgUrl;
      } catch (error) {
        console.error('Failed to load background image:', error);
      }
    }
  }

  /**
   * 打开新建提示词页面（简化版）
   * 不预先创建提示词，点击完成时才创建
   * @param {Array} prefillImages - 预填充的图像数组（可选，取消时不删除）
   */
  async openNewPromptPage(prefillImages = []) {
    try {
      // 生成默认时间戳标题（备用）
      let defaultTitle = this.generateUniqueTimestamp();

      // 检查标题是否重复
      let isExists = await window.electronAPI.isTitleExists(defaultTitle);
      while (isExists) {
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        defaultTitle = `${defaultTitle}_${randomSuffix}`;
        isExists = await window.electronAPI.isTitleExists(defaultTitle);
      }

      // 保存标题备用，不创建提示词
      this.pendingNewPromptTitle = defaultTitle;
      this.currentNewPromptId = null;

      // 初始化新建页面表单
      document.getElementById('newPromptContent').value = '';

      // 初始化图像列表（预填充图像和新上传图像分开存储）
      this.prefillImages = prefillImages || [];
      this.newPromptImages = [];
      await this.renderNewPromptImages();
      
      // 显示新建页面
      document.getElementById('newPromptPage').classList.add('active');
      document.getElementById('newPromptDoneBtn').disabled = true;
      
      // 绑定事件
      this.bindNewPromptPageEvents();
      
      // 聚焦内容输入框
      document.getElementById('newPromptContent').focus();
      
    } catch (error) {
      console.error('Failed to open new prompt page:', error);
      this.showToast('打开新建页面失败', 'error');
    }
  }

  /**
   * 关闭新建提示词页面（简化版）
   * @param {boolean} save - 是否保存（true=完成，false=取消）
   */
  async closeNewPromptPage(save = true) {
    const modal = document.getElementById('newPromptPage');

    if (!save) {
      // 取消时只删除本次新上传的图像（预填充图像不删除）
      if (this.newPromptImages && this.newPromptImages.length > 0) {
        for (const img of this.newPromptImages) {
          try {
            await window.electronAPI.permanentDeleteImage(img.id);
          } catch (error) {
            console.error('Failed to delete image:', error);
          }
        }
      }
      this.showToast('已取消创建');
    } else if (save) {
      // 完成时创建提示词
      const content = document.getElementById('newPromptContent').value.trim();
      if (!content) {
        this.showToast('提示词内容不能为空', 'error');
        return;
      }

      try {
        // 合并预填充图像和新上传图像
        const allImages = [...(this.prefillImages || []), ...(this.newPromptImages || [])];
        await window.electronAPI.addPrompt({
          title: this.pendingNewPromptTitle,
          tags: [],
          content: content,
          images: allImages,
          is_safe: 1
        });
        this.showToast('提示词创建成功');
      } catch (error) {
        console.error('Failed to create prompt:', error);
        this.showToast('创建提示词失败', 'error');
        return;
      }
    }

    // 关闭页面
    modal.classList.remove('active');

    // 清理状态
    this.pendingNewPromptTitle = null;
    this.currentNewPromptId = null;
    this.prefillImages = [];
    this.newPromptImages = [];
    
    // 刷新列表
    await this.loadPrompts();
    this.renderPromptList();
  }

  /**
   * 绑定新建提示词页面事件（简化版）
   */
  bindNewPromptPageEvents() {
    // 取消按钮
    document.getElementById('newPromptCancelBtn').onclick = () => this.closeNewPromptPage(false);

    // 完成按钮
    document.getElementById('newPromptDoneBtn').onclick = () => this.closeNewPromptPage(true);

    // 关闭按钮
    document.getElementById('closeNewPromptPage').onclick = () => this.closeNewPromptPage(false);

    // 内容输入 - 实时更新完成按钮状态
    const contentInput = document.getElementById('newPromptContent');
    contentInput.oninput = () => {
      const hasContent = contentInput.value.trim().length > 0;
      document.getElementById('newPromptDoneBtn').disabled = !hasContent;
      this.autoResizeTextarea(contentInput);
    };
    // 失去焦点时不保存（因为没有预先创建提示词）

    // 图像上传
    document.getElementById('newPromptImageUploadArea').onclick = () => {
      document.getElementById('newPromptImageInput').click();
    };
    document.getElementById('newPromptImageInput').onchange = (e) => {
      this.handleNewPromptImageUpload(e.target.files);
    };
  }

  /**
   * 渲染新建提示词的图像预览（简化版）
   * 合并显示预填充图像和新上传图像
   */
  async renderNewPromptImages() {
    const container = document.getElementById('newPromptImagePreviewList');
    const allImages = [...(this.prefillImages || []), ...(this.newPromptImages || [])];

    if (allImages.length === 0) {
      container.innerHTML = '';
      return;
    }

    // 获取所有图像的完整路径并渲染
    const prefillCount = (this.prefillImages || []).length;
    const previews = await Promise.all(
      allImages.map(async (img, index) => {
        const imagePath = await window.electronAPI.getImagePath(img.relativePath);
        // 预填充图像不显示删除按钮
        const removeBtn = index >= prefillCount
          ? `<button type="button" class="remove-image" data-index="${index - prefillCount}" title="删除图像">×</button>`
          : '';
        return `
          <div class="image-preview-item" data-index="${index}">
            <img src="file://${imagePath}" alt="${img.fileName}">
            ${removeBtn}
          </div>
        `;
      })
    );

    container.innerHTML = previews.join('');

    // 绑定删除事件（只绑定新上传图像的删除按钮）
    container.querySelectorAll('.remove-image').forEach(btn => {
      btn.onclick = () => this.removeNewPromptImage(parseInt(btn.dataset.index));
    });
  }

  /**
   * 处理新建提示词图像上传（简化版）
   * 图像先保存到临时列表，创建提示词时再关联
   */
  async handleNewPromptImageUpload(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      try {
        const imageInfo = await window.electronAPI.saveImageFile(file.path, file.name);
        // 获取完整图像信息（包含 relativePath）
        const fullImageInfo = await window.electronAPI.getImageById(imageInfo.id);
        if (fullImageInfo) {
          this.newPromptImages.push(fullImageInfo);
        }
      } catch (error) {
        console.error('Upload image error:', error);
        this.showToast(`上传图像失败: ${file.name}`, 'error');
      }
    }

    // 只更新界面显示，不保存到后端（因为还没有创建提示词）
    await this.renderNewPromptImages();
    if (files.length > 0) {
      this.showToast('图像已添加');
    }
  }

  /**
   * 删除新建提示词的图像（简化版）
   * 只从临时列表移除，不操作后端
   */
  async removeNewPromptImage(index) {
    this.newPromptImages.splice(index, 1);
    await this.renderNewPromptImages();
    this.showToast('图像已删除');
  }

  openEditModal(prompt, options = {}) {
    // 编辑界面只处理编辑，不处理新建
    if (!prompt || !prompt.id) {
      console.error('Edit modal requires a valid prompt with id');
      return;
    }

    const modal = document.getElementById('editModal');
    const form = document.getElementById('promptForm');

    // 重置图像
    this.currentImages = [];

    // 清理图像详情返回标志（防止从提示词列表打开编辑时错误返回图像详情）
    if (!options.fromImageDetail) {
      this.returnToImageDetail = false;
      this.returnToImageDetailImages = null;
      this.returnToImageDetailIndex = null;
      this.returnToImageDetailPanel = null;
    }

    // 记录当前提示词列表的快照（用于导航，避免保存后排序变化影响导航）
    // 如果有筛选后的列表，使用筛选后的列表；否则使用完整列表
    if (options.filteredList && options.filteredList.length > 0) {
      this.editModalPromptsSnapshot = [...options.filteredList];
    } else {
      this.editModalPromptsSnapshot = [...this.prompts];
    }

    // 记录当前编辑的提示词索引（在快照中查找）
    this.currentEditIndex = this.editModalPromptsSnapshot.findIndex(p => p.id === prompt.id);

    // 更新导航按钮状态（使用 setTimeout 确保在 DOM 更新后执行）
    setTimeout(() => this.updateEditModalNavButtons(), 0);

    // 填充表单数据
    document.getElementById('promptId').value = prompt.id;
    document.getElementById('promptTitle').value = prompt.title || '';

    // 初始化标题、内容、翻译和备注字段缓存值（用于通用字段保存系统）
    if (!this.promptEditFieldValues) this.promptEditFieldValues = {};
    this.promptEditFieldValues.title = prompt.title || '';
    this.promptEditFieldValues.content = prompt.content || '';
    this.promptEditFieldValues.contentTranslate = prompt.contentTranslate || '';
    this.promptEditFieldValues.note = prompt.note || '';

    // 初始化标签管理器
    this.promptTagManager = new TagManager({
      onSave: async (tags) => {
        await window.electronAPI.updatePrompt(prompt.id, { tags });
      },
      onRender: () => {
        this.renderPromptTags();
      },
      getTagsWithGroup: () => window.electronAPI.getPromptTagsWithGroup(),
      showConfirm: (title, message) => this.showConfirmDialog(title, message),
      saveDelay: 800
    });
    this.promptTagManager.setTags(prompt.tags || []);
    this.renderPromptTags();
    document.getElementById('promptContent').value = prompt.content || '';
    document.getElementById('promptContentTranslate').value = prompt.contentTranslate || '';
    document.getElementById('promptNote').value = prompt.note || '';
    // 设置安全评级开关
    const safeToggle = document.getElementById('promptSafeToggle');
    if (safeToggle) {
      safeToggle.checked = prompt.is_safe !== 0;
    }

    // 设置收藏按钮状态
    this.updatePromptFavoriteBtnUI(prompt.isFavorite);

    // 加载已有图像
    if (prompt.images && prompt.images.length > 0) {
      this.currentImages = [...prompt.images];
    }

    this.renderImagePreviews();
    modal.classList.add('active');
    document.getElementById('promptTitle').focus();

    // 绑定输入框变化事件
    this.bindEditPromptInputListeners();

    // 初始化文本框高度（延迟执行确保DOM已更新）
    setTimeout(() => {
      const textareas = [
        document.getElementById('promptContent'),
        document.getElementById('promptContentTranslate'),
        document.getElementById('promptNote')
      ];
      textareas.forEach(textarea => this.autoResizeTextarea(textarea));
    }, 0);
  }

  /**
   * 更新提示词编辑界面收藏按钮的UI状态
   * @param {boolean} isFavorite - 是否收藏
   */
  updatePromptFavoriteBtnUI(isFavorite) {
    const btn = document.getElementById('promptFavoriteBtn');
    if (!btn) return;

    if (isFavorite) {
      btn.classList.add('active');
      btn.title = '取消收藏';
      btn.innerHTML = this.ICONS.favorite.filled;
    } else {
      btn.classList.remove('active');
      btn.title = '收藏';
      btn.innerHTML = this.ICONS.favorite.outline;
    }
  }

  /**
   * 切换提示词编辑界面的收藏状态
   */
  async togglePromptEditFavorite() {
    const id = document.getElementById('promptId').value;
    if (!id) {
      // 新建模式，提示先保存
      this.showToast('请先保存提示词后再收藏', 'info');
      return;
    }

    const prompt = this.prompts.find(p => p.id === id);
    if (!prompt) return;

    const newFavoriteState = !prompt.isFavorite;

    try {
      await this.toggleFavorite(id, newFavoriteState);
      // 更新按钮UI
      this.updatePromptFavoriteBtnUI(newFavoriteState);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  }

  /**
   * 绑定编辑模态框输入框的变化监听
   */
  bindEditPromptInputListeners() {
    const contentInput = document.getElementById('promptContent');
    const translateInput = document.getElementById('promptContentTranslate');
    const noteInput = document.getElementById('promptNote');

    // 标题、内容、翻译和备注：使用通用字段保存系统
    this.initFieldEvents('promptEdit', 'title');
    this.initFieldEvents('promptEdit', 'content');
    this.initFieldEvents('promptEdit', 'contentTranslate');
    this.initFieldEvents('promptEdit', 'note');

    // 安全评级：切换时立即保存
    const safeToggle = document.getElementById('promptSafeToggle');
    if (safeToggle) {
      safeToggle.addEventListener('change', async () => {
        await this.savePromptField('is_safe', safeToggle.checked ? 1 : 0);
        this.showToast(safeToggle.checked ? '已标记为安全' : '已标记为不安全');
      });
    }

    // 自动调整文本框高度
    [contentInput, translateInput, noteInput].forEach(textarea => {
      this.autoResizeTextarea(textarea);
      textarea.addEventListener('input', () => {
        this.autoResizeTextarea(textarea);
      });
    });
  }

  /**
   * 自动调整 textarea 高度
   * @param {HTMLTextAreaElement} textarea - 文本框元素
   */
  autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  /**
   * 更新编辑模态框导航按钮状态
   */
  updateEditModalNavButtons() {
    const firstBtn = document.getElementById('editModalFirstBtn');
    const prevBtn = document.getElementById('editModalPrevBtn');
    const nextBtn = document.getElementById('editModalNextBtn');
    const lastBtn = document.getElementById('editModalLastBtn');

    // 使用快照的长度来判断边界
    const snapshotLength = this.editModalPromptsSnapshot.length;
    const isFirst = this.currentEditIndex <= 0;
    const isLast = this.currentEditIndex >= snapshotLength - 1 || this.currentEditIndex === -1;

    if (firstBtn) {
      firstBtn.disabled = isFirst;
    }
    if (prevBtn) {
      prevBtn.disabled = isFirst;
    }
    if (nextBtn) {
      nextBtn.disabled = isLast;
    }
    if (lastBtn) {
      lastBtn.disabled = isLast;
    }
  }

  /**
   * 导航到上一个/下一个提示词
   * @param {number|string} direction - 导航方向：-1 上一个，1 下一个，'first' 首张，'last' 最后一张
   */
  async navigateEditModal(direction) {
    // 使用快照进行导航，避免保存后排序变化影响导航顺序
    let targetIndex;
    if (direction === 'first') {
      targetIndex = 0;
    } else if (direction === 'last') {
      targetIndex = this.editModalPromptsSnapshot.length - 1;
    } else {
      targetIndex = this.currentEditIndex + direction;
    }

    // 检查边界（使用快照的长度）
    if (targetIndex < 0 || targetIndex >= this.editModalPromptsSnapshot.length) {
      return;
    }

    // 获取目标提示词
    const targetPrompt = this.editModalPromptsSnapshot[targetIndex];
    if (!targetPrompt) return;

    // 先保存当前编辑的内容（不关闭模态框）
    await this.savePromptWithoutClosing();

    // 更新当前编辑索引（在快照中）
    this.currentEditIndex = targetIndex;

    // 更新导航按钮状态（使用 setTimeout 确保在 DOM 更新后执行）
    setTimeout(() => this.updateEditModalNavButtons(), 0);

    // 从最新的 prompts 数组中获取提示词数据（确保数据是最新的）
    const nextPrompt = this.prompts.find(p => p.id === targetPrompt.id) || targetPrompt;
    document.getElementById('promptId').value = nextPrompt.id;
    document.getElementById('promptTitle').value = nextPrompt.title || '';

    // 更新字段缓存值（用于通用字段保存系统）
    if (!this.promptEditFieldValues) this.promptEditFieldValues = {};
    this.promptEditFieldValues.title = nextPrompt.title || '';
    this.promptEditFieldValues.content = nextPrompt.content || '';
    this.promptEditFieldValues.contentTranslate = nextPrompt.contentTranslate || '';
    this.promptEditFieldValues.note = nextPrompt.note || '';

    // 重新初始化标签管理器
    this.promptTagManager = new TagManager({
      onSave: async (tags) => {
        await window.electronAPI.updatePrompt(nextPrompt.id, { tags });
      },
      onRender: () => {
        this.renderPromptTags();
      },
      getTagsWithGroup: () => window.electronAPI.getPromptTagsWithGroup(),
      showConfirm: (title, message) => this.showConfirmDialog(title, message),
      saveDelay: 800
    });
    this.promptTagManager.setTags(nextPrompt.tags || []);
    this.renderPromptTags();
    document.getElementById('promptContent').value = nextPrompt.content || '';
    document.getElementById('promptContentTranslate').value = nextPrompt.contentTranslate || '';
    document.getElementById('promptNote').value = nextPrompt.note || '';
    // 更新安全评级开关
    const safeToggle = document.getElementById('promptSafeToggle');
    if (safeToggle) {
      safeToggle.checked = nextPrompt.is_safe !== 0;
    }

    // 更新收藏按钮状态
    this.updatePromptFavoriteBtnUI(nextPrompt.isFavorite);

    // 更新图像列表
    this.currentImages = [];
    if (nextPrompt.images && nextPrompt.images.length > 0) {
      this.currentImages = [...nextPrompt.images];
    }
    this.renderImagePreviews();

    // 聚焦标题输入框
    document.getElementById('promptTitle').focus();

    // 调整文本框高度以适应新内容
    setTimeout(() => {
      const textareas = [
        document.getElementById('promptContent'),
        document.getElementById('promptContentTranslate'),
        document.getElementById('promptNote')
      ];
      textareas.forEach(textarea => this.autoResizeTextarea(textarea));
    }, 0);
  }

  /**
   * 处理单选组标签，确保单选组内只有一个标签
   * 注意：TagManager 已经处理了单选组冲突和违单标签，这里不需要重复处理
   * @param {string[]} tags - 当前标签列表
   * @param {string[]} originalTags - 原始标签列表（用于取消时恢复）
   * @returns {Promise<string[]>} - 处理后的标签列表
   */
  /**
   * 保存提示词但不关闭模态框（用于切换导航）
   * 只在内容发生变化时才保存
   */
  async savePromptWithoutClosing() {
    const id = document.getElementById('promptId').value;
    const title = document.getElementById('promptTitle').value.trim();
    const content = document.getElementById('promptContent').value.trim();
    const contentTranslate = document.getElementById('promptContentTranslate').value.trim();
    const note = document.getElementById('promptNote').value.trim();
    const is_safe = document.getElementById('promptSafeToggle').checked ? 1 : 0;

    if (!title || !content) {
      this.showToast('请填写标题和内容', 'error');
      throw new Error('标题或内容为空');
    }

    // 检查标题是否重复
    const isExists = await window.electronAPI.isTitleExists(title, id || null);
    if (isExists) {
      this.showToast('该提示词标题已存在，请使用其他标题', 'error');
      throw new Error('标题重复');
    }

    // 从 promptTagManager 获取标签列表
    let tags = this.promptTagManager ? this.promptTagManager.getTags() : [];

    const images = this.currentImages;

    try {
      // 获取原始提示词的安全评级（用于判断是否有变化）
      let originalIsSafe = null;
      if (id) {
        const originalPrompt = this.prompts.find(p => p.id === id);
        if (originalPrompt) {
          originalIsSafe = originalPrompt.is_safe;
        }
      }

      // 将新标签添加到提示词标签列表
      if (tags.length > 0) {
        const existingTags = await window.electronAPI.getPromptTags();
        const newTags = tags.filter(tag => !existingTags.includes(tag));
        for (const tag of newTags) {
          await window.electronAPI.addPromptTag(tag);
        }
      }

      if (id) {
        // 更新
        const result = await window.electronAPI.updatePrompt(id, { title, tags, content, contentTranslate, images, note, is_safe });
        if (result === null) {
          throw new Error('找不到要更新的 Prompt');
        }

        // 如果安全评级发生变化，联动更新关联的图像
        if (originalIsSafe !== null && originalIsSafe !== is_safe) {
          if (images && images.length > 0) {
            for (const image of images) {
              if (image.id) {
                try {
                  await window.electronAPI.updateImageSafeStatus(image.id, is_safe === 1);
                } catch (err) {
                  console.error(`Failed to update image ${image.id} safe status:`, err);
                }
              }
            }
          }
        }
      } else {
        // 新建
        await window.electronAPI.addPrompt({ title, tags, content, contentTranslate, images, note, is_safe });

        // 新建提示词时，联动更新关联的图像
        if (images && images.length > 0) {
          for (const image of images) {
            if (image.id) {
              try {
                await window.electronAPI.updateImageSafeStatus(image.id, is_safe === 1);
              } catch (err) {
                console.error(`Failed to update image ${image.id} safe status:`, err);
              }
            }
          }
        }
      }

      // 刷新数据但不关闭模态框
      await this.loadPrompts();
      this.renderTagFilters();
    } catch (error) {
      console.error('Failed to save prompt:', error);
      this.showToast('保存失败: ' + error.message, 'error');
      throw error;
    }
  }

  /**
   * 关闭编辑模态框
   * @param {boolean} isCancel - 是否是取消操作
   */
  closeEditModal(isCancel = true) {
    document.getElementById('editModal').classList.remove('active');

    // 如果是从图像详情界面进入的编辑，取消时返回到图像详情界面
    if (isCancel && this.returnToImageDetail) {
      this.returnToImageDetail = false;
      // 恢复图像详情状态
      this.detailImages = this.returnToImageDetailImages || [];
      this.detailCurrentIndex = this.returnToImageDetailIndex || 0;
      // 恢复到原始面板
      if (this.returnToImageDetailPanel && this.returnToImageDetailPanel !== this.currentPanel) {
        if (this.returnToImageDetailPanel === 'image') {
          this.openImageManager();
        } else if (this.returnToImageDetailPanel === 'prompt') {
          this.openPromptManager();
        }
      }
      // 打开图像详情界面
      document.getElementById('imageDetailModal').classList.add('active');
      // 刷新图像显示
      this.updateImageDetailView();
      // 清理临时状态
      this.returnToImageDetailImages = null;
      this.returnToImageDetailIndex = null;
      this.returnToImageDetailPanel = null;
    }
  }

  /**
   * 打开图像详情模态框
   * 显示图像大图和相关信息，支持导航查看临近图像
   * @param {Object} imageInfo - 图像信息对象
   * @param {Object} promptInfo - 所属 Prompt 信息
   * @param {Array} imageList - 图像列表（用于导航）
   * @param {number} currentIndex - 当前图像在列表中的索引
   */
  async openImageDetailModal(imageInfo, promptInfo = null, imageList = null, currentIndex = 0) {
    // Image detail modal opened
    const modal = document.getElementById('imageDetailModal');

    // 保存图像列表、当前索引和提示词信息
    this.detailImages = imageList || [imageInfo];
    this.detailCurrentIndex = currentIndex;
    this.detailPromptInfo = promptInfo; // 保存传入的提示词信息

    // 更新显示
    await this.updateImageDetailView();

    // 显示模态框
    modal.classList.add('active');
  }

  /**
   * 更新图像详情视图
   * 根据当前索引显示图像
   */
  async updateImageDetailView() {
    const imageInfo = this.detailImages[this.detailCurrentIndex];
    if (!imageInfo) {
      console.debug('No imageInfo found');
      return;
    }

    // 获取完整的图像信息
    const fullImageInfo = await window.electronAPI.getImageById(imageInfo.id) || imageInfo;

    // 设置大图
    const imagePath = fullImageInfo.relativePath;
    if (imagePath) {
      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        document.getElementById('imageDetailImg').src = 'file://' + fullPath;
      } catch (error) {
        console.error('Failed to get image path:', error);
      }
    }

    // 绑定双击事件 - 打开全屏查看器
    const imgElement = document.getElementById('imageDetailImg');
    imgElement.onclick = null; // 清除之前的事件
    imgElement.addEventListener('dblclick', () => {
      // 构建图像对象数组，用于全屏查看器
      const viewerImages = this.detailImages.map(img => ({
        path: img.relativePath,
        relativePath: img.relativePath,
        fileName: img.fileName
      }));
      this.openImageViewer(viewerImages, this.detailCurrentIndex);
    });

    // 设置文件名并记录原始值
    const fileNameInput = document.getElementById('imageDetailFileName');
    fileNameInput.value = fullImageInfo.fileName || '';
    if (!this.imageDetailFieldValues) this.imageDetailFieldValues = {};
    this.imageDetailFieldValues.fileName = fileNameInput.value;

    // 查找所属的 Prompt 信息
    // 优先使用传入的 promptInfo，如果没有则尝试从数据库获取
    let promptInfo = this.detailPromptInfo || null;
    let allPromptRefs = [];

    // 收集所有引用的提示词信息
    if (fullImageInfo.promptRefs && fullImageInfo.promptRefs.length > 0) {
      allPromptRefs = fullImageInfo.promptRefs.map(ref => {
        // 优先从本地缓存查找
        const cachedPrompt = this.prompts.find(p => p.id === ref.promptId);
        if (cachedPrompt) {
          return cachedPrompt;
        }
        // 如果本地缓存中没有，使用数据库返回的数据
        if (ref.promptContent) {
          return {
            id: ref.promptId,
            title: ref.promptTitle,
            content: ref.promptContent,
            tags: []
          };
        }
        return null;
      }).filter(p => p !== null);
    }

    // 如果没有找到任何引用，使用传入的 promptInfo
    if (allPromptRefs.length === 0 && promptInfo) {
      allPromptRefs = [promptInfo];
    }

    // 设置所属 Prompt 信息
    const editPromptBtn = document.getElementById('editPromptFromImageBtn');
    const editPromptBtnText = document.getElementById('editPromptBtnText');
    const promptTitleContainer = document.getElementById('imageDetailPromptTitle');

    if (allPromptRefs.length > 0) {
      // 多引用情况：显示所有提示词标题列表
      if (allPromptRefs.length > 1) {
        promptTitleContainer.innerHTML = allPromptRefs.map((p, index) =>
          `<div class="prompt-ref-item" data-prompt-id="${p.id}">
            <span class="prompt-ref-number">${index + 1}.</span>
            <span class="prompt-ref-title">${this.escapeHtml(p.title || '未命名')}</span>
            <span class="prompt-ref-unlink" title="解除关联">×</span>
          </div>`
        ).join('');

        // 绑定点击事件 - 点击标题切换显示
        promptTitleContainer.querySelectorAll('.prompt-ref-item').forEach(item => {
          const titleEl = item.querySelector('.prompt-ref-title');
          if (titleEl) {
            titleEl.addEventListener('click', () => {
              const promptId = item.dataset.promptId;
              const selectedPrompt = allPromptRefs.find(p => p.id === promptId);
              if (selectedPrompt) {
                this.showPromptDetailFromImage(selectedPrompt);
              }
            });
          }
        });

        // 绑定解除关联事件
        promptTitleContainer.querySelectorAll('.prompt-ref-unlink').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.prompt-ref-item');
            const promptId = item.dataset.promptId;
            const promptRef = allPromptRefs.find(p => p.id === promptId);
            if (promptRef) {
              await this.unlinkImageFromPrompt(fullImageInfo.id, promptId, promptRef.title);
            }
          });
        });
      } else {
        // 单引用情况：显示标题和解除关联按钮
        const p = allPromptRefs[0];
        promptTitleContainer.innerHTML =
          `<div class="prompt-ref-item single-ref" data-prompt-id="${p.id}">
            <span class="prompt-ref-title">${this.escapeHtml(p.title || '未命名')}</span>
            <span class="prompt-ref-unlink" title="解除关联">×</span>
          </div>`;

        // 绑定解除关联事件
        const unlinkBtn = promptTitleContainer.querySelector('.prompt-ref-unlink');
        if (unlinkBtn) {
          unlinkBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.unlinkImageFromPrompt(fullImageInfo.id, p.id, p.title);
          });
        }
      }

      // 显示第一个提示词的详细内容
      const firstPrompt = allPromptRefs[0];
      document.getElementById('imageDetailPromptContent').textContent = firstPrompt.content || '-';
      document.getElementById('imageDetailPromptTranslate').textContent = firstPrompt.contentTranslate || '-';
      document.getElementById('imageDetailPromptNote').textContent = firstPrompt.note || '-';

      // 设置标签
      const tagsContainer = document.getElementById('imageDetailTags');
      if (firstPrompt.tags && firstPrompt.tags.length > 0) {
        tagsContainer.innerHTML = firstPrompt.tags.map(tag =>
          `<span class="tag">${this.escapeHtml(tag)}</span>`
        ).join('');
      } else {
        tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
      }

      // 显示编辑按钮，设置文本为"编辑提示词"，并保存当前提示词ID
      editPromptBtn.style.display = 'flex';
      editPromptBtnText.textContent = allPromptRefs.length > 1 ? '编辑提示词 (1)' : '编辑提示词';
      this.currentDetailPromptId = firstPrompt.id;
      this.currentDetailPromptRefs = allPromptRefs; // 保存所有引用供后续使用
    } else {
      promptTitleContainer.textContent = '-';
      document.getElementById('imageDetailPromptContent').textContent = '-';
      document.getElementById('imageDetailPromptTranslate').textContent = '-';
      document.getElementById('imageDetailPromptNote').textContent = '-';
      document.getElementById('imageDetailTags').innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';

      // 显示按钮，但文本改为"添加提示词"，清除提示词ID
      editPromptBtn.style.display = 'flex';
      editPromptBtnText.textContent = '添加提示词';
      this.currentDetailPromptId = null;
      this.currentDetailPromptRefs = [];
    }

    // 初始化图像标签管理器
    this.imageTagManager = new TagManager({
      onSave: async (tags) => {
        await window.electronAPI.updateImageTags(fullImageInfo.id, tags);
        // 刷新标签筛选器
        this.renderImageTagFilters();
      },
      onRender: () => {
        this.renderImageTags();
      },
      getTagsWithGroup: () => window.electronAPI.getImageTagsWithGroup(),
      showConfirm: (title, message) => this.showConfirmDialog(title, message),
      saveDelay: 800
    });
    this.imageTagManager.setTags(fullImageInfo.tags || []);

    // 设置收藏按钮状态
    const favoriteBtn = document.getElementById('imageDetailFavoriteBtn');
    if (favoriteBtn) {
      if (fullImageInfo.isFavorite) {
        favoriteBtn.classList.add('active');
        favoriteBtn.title = '取消收藏';
        favoriteBtn.innerHTML = this.ICONS.favorite.filled;
      } else {
        favoriteBtn.classList.remove('active');
        favoriteBtn.title = '收藏';
        favoriteBtn.innerHTML = this.ICONS.favorite.outline;
      }
      // 绑定点击事件
      favoriteBtn.onclick = async () => {
        const newFavoriteState = !fullImageInfo.isFavorite;
        await this.toggleImageFavorite(fullImageInfo.id, newFavoriteState);
        // 更新本地数据
        fullImageInfo.isFavorite = newFavoriteState;
        // 更新按钮UI
        if (newFavoriteState) {
          favoriteBtn.classList.add('active');
          favoriteBtn.title = '取消收藏';
          favoriteBtn.innerHTML = this.ICONS.favorite.filled;
        } else {
          favoriteBtn.classList.remove('active');
          favoriteBtn.title = '收藏';
          favoriteBtn.innerHTML = this.ICONS.favorite.outline;
        }
      };
    }

    // 设置安全评级开关状态
    const safeToggle = document.getElementById('imageSafeToggle');
    if (safeToggle) {
      safeToggle.checked = fullImageInfo.is_safe !== 0;
    }

    // 设置图像信息列表
    const updatedAtEl = document.getElementById('imageDetailUpdatedAt');
    const createdAtEl = document.getElementById('imageDetailCreatedAt');
    const dimensionsEl = document.getElementById('imageDetailDimensions');
    const fileSizeEl = document.getElementById('imageDetailFileSize');

    if (fullImageInfo.updatedAt) {
      const date = new Date(fullImageInfo.updatedAt);
      updatedAtEl.textContent = date.toLocaleString('zh-CN');
    } else {
      updatedAtEl.textContent = '-';
    }

    if (fullImageInfo.createdAt) {
      const date = new Date(fullImageInfo.createdAt);
      createdAtEl.textContent = date.toLocaleString('zh-CN');
    } else {
      createdAtEl.textContent = '-';
    }

    if (fullImageInfo.width && fullImageInfo.height) {
      dimensionsEl.textContent = `${fullImageInfo.width} x ${fullImageInfo.height} 像素`;
    } else {
      dimensionsEl.textContent = '未知';
    }

    if (fullImageInfo.fileSize && fullImageInfo.fileSize > 0) {
      fileSizeEl.textContent = this.formatFileSize(fullImageInfo.fileSize);
    } else {
      fileSizeEl.textContent = '-';
    }

    // 设置备注并记录原始值
    const noteTextarea = document.getElementById('imageDetailNote');
    if (noteTextarea) {
      noteTextarea.value = fullImageInfo.note || '';
      if (!this.imageDetailFieldValues) this.imageDetailFieldValues = {};
      this.imageDetailFieldValues.note = noteTextarea.value;
      this.autoResizeTextarea(noteTextarea);
    }

    // 更新计数器
    document.getElementById('imageDetailCounter').textContent = 
      `${this.detailCurrentIndex + 1} / ${this.detailImages.length}`;

    // 更新导航按钮状态
    const firstBtn = document.getElementById('firstImageBtn');
    const prevBtn = document.getElementById('prevImageBtn');
    const nextBtn = document.getElementById('nextImageBtn');
    const lastBtn = document.getElementById('lastImageBtn');

    const isFirst = this.detailCurrentIndex === 0;
    const isLast = this.detailCurrentIndex === this.detailImages.length - 1;

    if (firstBtn) firstBtn.disabled = isFirst;
    if (prevBtn) prevBtn.disabled = isFirst;
    if (nextBtn) nextBtn.disabled = isLast;
    if (lastBtn) lastBtn.disabled = isLast;
  }

  /**
   * 显示首张图像（图像详情页）
   */
  async showFirstDetailImage() {
    if (this.detailCurrentIndex > 0) {
      await this.saveAllImageDetailFields();
      this.detailCurrentIndex = 0;
      this.detailPromptInfo = null;
      await this.updateImageDetailView();
    }
  }

  /**
   * 显示上一张图像（图像详情页）
   */
  async showPrevDetailImage() {
    if (this.detailCurrentIndex > 0) {
      await this.saveAllImageDetailFields();
      this.detailCurrentIndex--;
      this.detailPromptInfo = null;
      await this.updateImageDetailView();
    }
  }

  /**
   * 显示下一张图像（图像详情页）
   */
  async showNextDetailImage() {
    if (this.detailCurrentIndex < this.detailImages.length - 1) {
      await this.saveAllImageDetailFields();
      this.detailCurrentIndex++;
      this.detailPromptInfo = null;
      await this.updateImageDetailView();
    }
  }

  /**
   * 显示最后一张图像（图像详情页）
   */
  async showLastDetailImage() {
    if (this.detailCurrentIndex < this.detailImages.length - 1) {
      await this.saveAllImageDetailFields();
      this.detailCurrentIndex = this.detailImages.length - 1;
      this.detailPromptInfo = null;
      await this.updateImageDetailView();
    }
  }

  /**
   * 从图像详情界面编辑或添加提示词
   * 有提示词时编辑，无提示词时创建并关联当前图像
   */
  async editPromptFromImageDetail() {
    // 保存当前图像详情状态，以便编辑/创建完成后返回
    this.returnToImageDetail = true;
    this.returnToImageDetailIndex = this.detailCurrentIndex;
    this.returnToImageDetailImages = [...this.detailImages];
    this.returnToImageDetailPanel = this.currentPanel;

    // 关闭图像详情界面
    document.getElementById('imageDetailModal').classList.remove('active');
    document.getElementById('imageDetailImg').src = '';

    if (this.currentDetailPromptId) {
      // 有提示词，编辑模式
      const prompt = this.prompts.find(p => p.id === this.currentDetailPromptId);
      if (!prompt) {
        this.showToast('提示词不存在', 'error');
        return;
      }
      // 使用当前的筛选列表（如果有）
      const filteredList = this.filteredPrompts && this.filteredPrompts.length > 0 ? this.filteredPrompts : null;
      this.openEditModal(prompt, { filteredList, fromImageDetail: true });
    } else {
      // 无提示词，打开新建提示词界面，预填充当前图像
      const currentImage = this.detailImages[this.detailCurrentIndex];
      this.openNewPromptPage(currentImage ? [{
        id: currentImage.id,
        fileName: currentImage.fileName,
        relativePath: currentImage.relativePath
      }] : []);
    }
  }

  /**
   * 关闭图像详情模态框
   * 关闭时返回到原始面板（提示词管理或图像管理）
   */
  async closeImageDetailModal() {
    // 保存所有字段
    await this.saveAllImageDetailFields();

    document.getElementById('imageDetailModal').classList.remove('active');
    document.getElementById('imageDetailImg').src = '';

    // 如果当前在图像管理界面，刷新标签筛选
    if (this.currentPanel === 'image') {
      await this.renderImageTagFilters();
      await this.renderImageGrid();
    }
  }

  /**
   * 从图像详情界面显示指定提示词的详细信息
   * 用于多引用情况下切换显示不同提示词的内容
   * @param {Object} promptInfo - 提示词信息对象
   */
  showPromptDetailFromImage(promptInfo) {
    if (!promptInfo) return;

    // 更新当前选中的提示词ID
    this.currentDetailPromptId = promptInfo.id;

    // 更新提示词标题区域的选中状态
    const promptTitleContainer = document.getElementById('imageDetailPromptTitle');
    promptTitleContainer.querySelectorAll('.prompt-ref-item').forEach(item => {
      if (item.dataset.promptId === promptInfo.id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 更新提示词内容
    document.getElementById('imageDetailPromptContent').textContent = promptInfo.content || '-';
    document.getElementById('imageDetailPromptTranslate').textContent = promptInfo.contentTranslate || '-';
    document.getElementById('imageDetailPromptNote').textContent = promptInfo.note || '-';

    // 更新标签
    const tagsContainer = document.getElementById('imageDetailTags');
    if (promptInfo.tags && promptInfo.tags.length > 0) {
      tagsContainer.innerHTML = promptInfo.tags.map(tag =>
        `<span class="tag">${this.escapeHtml(tag)}</span>`
      ).join('');
    } else {
      tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
    }

    // 更新编辑按钮文本
    const editPromptBtnText = document.getElementById('editPromptBtnText');
    const allRefs = this.currentDetailPromptRefs || [];
    const currentIndex = allRefs.findIndex(p => p.id === promptInfo.id);
    if (currentIndex >= 0) {
      editPromptBtnText.textContent = `编辑提示词 (${currentIndex + 1})`;
    }
  }

  /**
   * 解除图像与提示词的关联
   * @param {string} imageId - 图像ID
   * @param {string} promptId - 提示词ID
   * @param {string} promptTitle - 提示词标题（用于确认消息）
   */
  async unlinkImageFromPrompt(imageId, promptId, promptTitle) {
    const confirmed = await this.showConfirmDialog(
      '解除关联',
      `确定要解除与提示词 "${promptTitle || '未命名'}" 的关联吗？`
    );

    if (!confirmed) return;

    try {
      await window.electronAPI.unlinkImageFromPrompt(imageId, promptId);
      this.showToast('关联已解除', 'success');

      // 刷新提示词缓存（因为提示词的图像关联已改变）
      await this.loadPrompts();

      // 重新获取最新的图像数据
      if (this.detailImages && this.detailImages[this.detailCurrentIndex]) {
        const refreshedImage = await window.electronAPI.getImageById(imageId);
        if (refreshedImage) {
          this.detailImages[this.detailCurrentIndex] = refreshedImage;
        }
      }

      // 清除旧的提示词信息缓存，强制从数据库重新获取
      this.detailPromptInfo = null;

      // 刷新图像详情视图
      await this.updateImageDetailView();

      // 如果在图像管理界面，刷新网格
      if (this.currentPanel === 'image') {
        await this.renderImageGrid();
        await this.renderImageTagFilters();
      }

      // 如果在提示词管理界面，刷新列表
      if (this.currentPanel === 'prompt') {
        this.renderPromptList();
      }
    } catch (error) {
      console.error('Failed to unlink image from prompt:', error);
      this.showToast('解除关联失败: ' + error.message, 'error');
    }
  }

  /**
   * 渲染图像标签
   * 从 imageTagManager 获取标签数据
   */
  renderImageTags() {
    const container = document.getElementById('imageDetailImageTags');
    if (!container) return;

    // 从 TagManager 获取标签数据
    const tags = this.imageTagManager ? this.imageTagManager.getTags() : [];

    // 过滤违单标签（只在筛选器显示）
    const filteredTags = tags.filter(tag => tag !== PromptManager.VIOLATING_TAG);

    if (filteredTags.length > 0) {
      container.innerHTML = filteredTags.map(tag => {
        return `<span class="tag tag-removable" data-tag="${this.escapeHtml(tag)}">
          ${this.escapeHtml(tag)}
          <span class="tag-remove-btn" title="删除标签">×</span>
        </span>`;
      }).join('');

      // 绑定删除事件
      container.querySelectorAll('.tag-remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tagElement = btn.closest('.tag-removable');
          const tagName = tagElement.dataset.tag;
          await this.removeImageTag(tagName);
        });
      });
    } else {
      container.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
    }
  }

  /**
   * 添加图像标签（统一入口）
   * @param {string|string[]} tagInput - 标签名称或标签数组
   * @returns {Promise<boolean>} - 是否成功添加
   */
  async addImageTag(tagInput) {
    return this.addTagWithManager(this.imageTagManager, tagInput);
  }

  /**
   * 删除图像标签（统一入口）
   * @param {string} tagName - 要删除的标签名称
   * @returns {Promise<boolean>}
   */
  async removeImageTag(tagName) {
    return this.removeTagWithManager(this.imageTagManager, tagName);
  }

  // ==================== 通用字段保存系统 ====================

  /**
   * 获取字段配置
   * @param {string} context - 上下文：'imageDetail' | 'promptEdit'
   * @returns {Object} 字段配置对象
   */
  getFieldConfig(context) {
    const configs = {
      imageDetail: {
        fileName: {
          elementId: 'imageDetailFileName',
          statusId: 'fileNameStatus',
          api: 'updateImageFileName',
          delay: 800,
          validate: (value) => {
            const trimmed = value.trim();
            if (!trimmed) return { valid: false, error: '不能为空' };
            if (/[<>:"/\\|?*]/.test(trimmed)) return { valid: false, error: '非法字符' };
            return { valid: true };
          },
          afterSave: async () => {
            await this.renderImageGrid();
          }
        },
        note: {
          elementId: 'imageDetailNote',
          statusId: 'noteStatus',
          api: 'updateImageNote',
          delay: 800,
          validate: () => ({ valid: true }),
          afterSave: null
        }
      },
      promptEdit: {
        title: {
          elementId: 'promptTitle',
          statusId: 'promptTitleStatus',
          api: 'updatePrompt',
          delay: 800,
          validate: async (value, id) => {
            const trimmed = value.trim();
            if (!trimmed) return { valid: false, error: '不能为空' };
            const isExists = await window.electronAPI.isTitleExists(trimmed, id);
            if (isExists) return { valid: false, error: '标题已存在' };
            return { valid: true };
          },
          afterSave: null
        },
        content: {
          elementId: 'promptContent',
          statusId: 'promptContentStatus',
          api: 'updatePrompt',
          delay: 800,
          validate: (value) => {
            const trimmed = value.trim();
            if (!trimmed) return { valid: false, error: '不能为空' };
            return { valid: true };
          },
          afterSave: null
        },
        contentTranslate: {
          elementId: 'promptContentTranslate',
          statusId: 'promptContentTranslateStatus',
          api: 'updatePrompt',
          delay: 800,
          validate: () => ({ valid: true }),
          afterSave: null
        },
        note: {
          elementId: 'promptNote',
          statusId: 'promptNoteStatus',
          api: 'updatePrompt',
          delay: 800,
          validate: () => ({ valid: true }),
          afterSave: null
        }
      }
    };
    return configs[context] || {};
  }

  /**
   * 防抖保存字段
   * @param {string} context - 上下文
   * @param {string} fieldName - 字段名
   */
  debounceSaveField(context, fieldName) {
    const config = this.getFieldConfig(context)[fieldName];
    if (!config) return;

    const timersKey = `${context}FieldTimers`;
    if (!this[timersKey]) this[timersKey] = {};

    clearTimeout(this[timersKey][fieldName]);
    this[timersKey][fieldName] = setTimeout(() => {
      this.saveField(context, fieldName);
    }, config.delay);
  }

  /**
   * 保存字段
   * @param {string} context - 上下文
   * @param {string} fieldName - 字段名
   */
  async saveField(context, fieldName) {
    const config = this.getFieldConfig(context)[fieldName];
    if (!config) return;

    // 获取当前对象ID
    let id;
    if (context === 'imageDetail') {
      const currentImage = this.detailImages[this.detailCurrentIndex];
      id = currentImage?.id;
    } else if (context === 'promptEdit') {
      id = document.getElementById('promptId')?.value;
    }

    if (!id) {
      this.showToast('无法获取当前对象信息', 'error');
      return;
    }

    const element = document.getElementById(config.elementId);
    const newValue = element?.value ?? '';

    // 检查值是否有变化（使用缓存值比较）
    const cacheKey = `${context}FieldValues`;
    if (!this[cacheKey]) this[cacheKey] = {};
    if (newValue === this[cacheKey][fieldName]) {
      return;
    }

    // 验证
    const validation = await Promise.resolve(config.validate(newValue, id));
    if (!validation.valid) {
      this.showFieldStatus(context, fieldName, 'error', validation.error);
      element.value = this[cacheKey][fieldName];
      return;
    }

    try {
      // 调用API
      if (context === 'imageDetail') {
        await window.electronAPI[config.api](id, newValue);
      } else if (context === 'promptEdit') {
        await window.electronAPI[config.api](id, { [fieldName]: newValue });
      }

      // 更新缓存
      this[cacheKey][fieldName] = newValue;

      // 更新本地数据
      if (context === 'imageDetail') {
        const currentImage = this.detailImages[this.detailCurrentIndex];
        if (currentImage) currentImage[fieldName] = newValue;
      } else if (context === 'promptEdit') {
        const prompt = this.prompts.find(p => p.id === parseInt(id));
        if (prompt) prompt[fieldName] = newValue;
      }

      this.showFieldStatus(context, fieldName, 'saved');

      // 后置操作
      if (config.afterSave) {
        await config.afterSave();
      }
    } catch (error) {
      console.error(`Save ${fieldName} error:`, error);
      this.showFieldStatus(context, fieldName, 'error', '保存失败');
      element.value = this[cacheKey][fieldName];
    }
  }

  /**
   * 显示字段保存状态
   * @param {string} context - 上下文
   * @param {string} fieldName - 字段名
   * @param {string} status - 'saved' | 'error'
   * @param {string} message - 状态消息
   */
  showFieldStatus(context, fieldName, status, message = '') {
    const config = this.getFieldConfig(context)[fieldName];
    if (!config) return;

    const statusEl = document.getElementById(config.statusId);
    if (!statusEl) return;

    statusEl.className = 'field-status show';

    switch (status) {
      case 'saved':
        statusEl.textContent = '已保存';
        statusEl.classList.add('saved');
        setTimeout(() => {
          statusEl.classList.remove('show');
        }, 2000);
        break;
      case 'error':
        statusEl.textContent = message || '保存失败';
        statusEl.classList.add('error');
        break;
      default:
        statusEl.classList.remove('show');
    }
  }

  /**
   * 初始化字段事件监听
   * @param {string} context - 上下文
   * @param {string} fieldName - 字段名
   */
  initFieldEvents(context, fieldName) {
    const config = this.getFieldConfig(context)[fieldName];
    if (!config) return;

    const element = document.getElementById(config.elementId);
    if (!element) return;

    // 输入时防抖保存
    element.addEventListener('input', () => {
      if (fieldName === 'note' && element.tagName === 'TEXTAREA') {
        this.autoResizeTextarea(element);
      }
      this.debounceSaveField(context, fieldName);
    });

    // 失焦时立即保存
    element.addEventListener('blur', () => {
      const timersKey = `${context}FieldTimers`;
      if (this[timersKey]) {
        clearTimeout(this[timersKey][fieldName]);
      }
      this.saveField(context, fieldName);
    });
  }

  /**
   * 图像详情可保存字段配置
   */
  getImageDetailFieldConfig() {
    return {
      fileName: {
        elementId: 'imageDetailFileName',
        statusId: 'fileNameStatus',
        api: 'updateImageFileName',
        delay: 800,
        validate: (value) => {
          const trimmed = value.trim();
          if (!trimmed) return { valid: false, error: '不能为空' };
          if (/[<>:"/\\|?*]/.test(trimmed)) return { valid: false, error: '非法字符' };
          return { valid: true };
        },
        afterSave: async () => {
          await this.renderImageGrid();
        }
      },
      note: {
        elementId: 'imageDetailNote',
        statusId: 'noteStatus',
        api: 'updateImageNote',
        delay: 800,
        validate: () => ({ valid: true }),
        afterSave: null
      }
    };
  }

  /**
   * 防抖保存图像详情字段
   * @param {string} fieldName - 字段名
   */
  debounceSaveImageDetailField(fieldName) {
    const config = this.getImageDetailFieldConfig()[fieldName];
    if (!config) return;

    clearTimeout(this.imageDetailFieldTimers[fieldName]);
    this.imageDetailFieldTimers[fieldName] = setTimeout(() => {
      this.saveImageDetailField(fieldName);
    }, config.delay);
  }

  /**
   * 显示图像详情字段保存状态
   * @param {string} fieldName - 字段名
   * @param {string} status - 'saved' | 'error'
   * @param {string} message - 状态消息
   */
  showImageDetailFieldStatus(fieldName, status, message = '') {
    const config = this.getImageDetailFieldConfig()[fieldName];
    if (!config) return;

    const statusEl = document.getElementById(config.statusId);
    if (!statusEl) return;

    statusEl.className = 'field-status show';

    switch (status) {
      case 'saved':
        statusEl.textContent = '已保存';
        statusEl.classList.add('saved');
        setTimeout(() => {
          statusEl.classList.remove('show');
        }, 2000);
        break;
      case 'error':
        statusEl.textContent = message || '保存失败';
        statusEl.classList.add('error');
        break;
      default:
        statusEl.classList.remove('show');
    }
  }

  /**
   * 保存图像详情字段
   * @param {string} fieldName - 字段名
   */
  async saveImageDetailField(fieldName) {
    const currentImage = this.detailImages[this.detailCurrentIndex];
    if (!currentImage || !currentImage.id) {
      this.showToast('无法获取当前图像信息', 'error');
      return;
    }

    const config = this.getImageDetailFieldConfig()[fieldName];
    if (!config) return;

    const element = document.getElementById(config.elementId);
    const newValue = element.value;

    // 检查是否有变化
    if (newValue === this.imageDetailFieldValues[fieldName]) {
      return;
    }

    // 验证
    const validation = config.validate(newValue);
    if (!validation.valid) {
      this.showImageDetailFieldStatus(fieldName, 'error', validation.error);
      element.value = this.imageDetailFieldValues[fieldName];
      return;
    }

    try {
      await window.electronAPI[config.api](currentImage.id, newValue);

      // 更新缓存和本地数据
      this.imageDetailFieldValues[fieldName] = newValue;
      currentImage[fieldName] = newValue;

      this.showImageDetailFieldStatus(fieldName, 'saved');

      // 后置操作
      if (config.afterSave) {
        await config.afterSave();
      }
    } catch (error) {
      console.error(`Save ${fieldName} error:`, error);
      this.showImageDetailFieldStatus(fieldName, 'error', '保存失败');
      element.value = this.imageDetailFieldValues[fieldName];
    }
  }

  /**
   * 保存所有图像详情字段
   */
  async saveAllImageDetailFields() {
    const fields = Object.keys(this.getImageDetailFieldConfig());
    const saves = fields.map(fieldName => {
      clearTimeout(this.imageDetailFieldTimers[fieldName]);
      return this.saveImageDetailField(fieldName);
    });
    await Promise.all(saves);
  }

  /**
   * 切换图像安全评级状态
   * @param {boolean} isSafe - 是否安全
   */
  async toggleImageSafeStatus(isSafe) {
    const currentImage = this.detailImages[this.detailCurrentIndex];
    if (!currentImage || !currentImage.id) {
      this.showToast('无法获取当前图像信息', 'error');
      return;
    }

    try {
      await window.electronAPI.updateImageSafeStatus(currentImage.id, isSafe);
      // 更新本地数据
      currentImage.is_safe = isSafe ? 1 : 0;

      // 联动更新关联的提示词安全评级
      if (currentImage.promptRefs && currentImage.promptRefs.length > 0) {
        const safeValue = isSafe ? 1 : 0;
        for (const ref of currentImage.promptRefs) {
          if (ref.promptId) {
            try {
              await window.electronAPI.updatePromptSafeStatus(ref.promptId, safeValue);
            } catch (err) {
              console.error(`Failed to update prompt ${ref.promptId} safe status:`, err);
            }
          }
        }
        // 刷新本地提示词数据
        await this.loadPrompts();
      }

      this.showToast(isSafe ? '已标记为安全' : '已标记为不安全');
    } catch (error) {
      console.error('Toggle image safe status error:', error);
      this.showToast('更新安全评级失败', 'error');
    }
  }

  /**
   * 设置缩略图尺寸控制
   */
  setupThumbnailSizeControl() {
    const slider = document.getElementById('thumbnailSizeSlider');

    // 从本地存储读取默认值
    const savedSize = localStorage.getItem('thumbnailGridSize');
    const defaultSize = savedSize ? parseInt(savedSize) : 180;

    // 设置滑杆初始值
    slider.value = defaultSize;
    this.setThumbnailGridSize(defaultSize);

    // 监听滑杆变化
    slider.addEventListener('input', (e) => {
      const size = parseInt(e.target.value);
      this.setThumbnailGridSize(size);
    });

    // 保存最终值
    slider.addEventListener('change', (e) => {
      localStorage.setItem('thumbnailGridSize', e.target.value);
    });
  }

  /**
   * 设置缩略图网格尺寸
   * @param {number} size - 网格项宽度/高度（像素），保持1:1方形
   */
  setThumbnailGridSize(size) {
    const imageGrid = document.getElementById('imageGrid');
    if (imageGrid) {
      imageGrid.style.gridTemplateColumns = `repeat(auto-fill, ${size}px)`;
      imageGrid.style.gridAutoRows = `${size}px`;
    }
  }

  /**
   * 设置提示词卡片尺寸控制
   */
  setupPromptCardSizeControl() {
    const slider = document.getElementById('promptCardSizeSlider');

    // 从本地存储读取默认值
    const savedSize = localStorage.getItem('promptCardSize');
    const defaultSize = savedSize ? parseInt(savedSize) : 260;

    // 设置滑杆初始值
    slider.value = defaultSize;
    this.setPromptCardSize(defaultSize);

    // 监听滑杆变化
    slider.addEventListener('input', (e) => {
      const size = parseInt(e.target.value);
      this.setPromptCardSize(size);
    });

    // 保存最终值
    slider.addEventListener('change', (e) => {
      localStorage.setItem('promptCardSize', e.target.value);
    });
  }

  /**
   * 绑定图像详情字段事件
   */
  bindImageDetailFieldEvents() {
    const fields = this.getFieldConfig('imageDetail');

    Object.keys(fields).forEach(fieldName => {
      this.initFieldEvents('imageDetail', fieldName);
    });
  }

  /**
   * 设置提示词卡片尺寸
   * @param {number} size - 卡片宽度/高度（像素），保持1:1方形
   */
  setPromptCardSize(size) {
    const promptList = document.getElementById('promptList');
    if (promptList) {
      // 使用固定列宽，每列大小等于滑杆值
      promptList.style.gridTemplateColumns = `repeat(auto-fill, ${size}px)`;
      promptList.style.gridAutoRows = `${size}px`;
    }
  }

  /**
   * 设置图像标签自动补全
   */
  setupImageTagAutocomplete() {
    const input = document.getElementById('imageTagInput');
    const dropdown = document.getElementById('imageTagAutocomplete');

    input.addEventListener('input', async () => {
      const value = input.value.trim();
      if (!value) {
        this.hideImageTagAutocomplete();
        return;
      }

      // 获取所有图像标签
      const allTags = await window.electronAPI.getImageTags();

      // 过滤匹配的标签
      const matchedTags = allTags.filter(tag =>
        tag.toLowerCase().startsWith(value.toLowerCase()) &&
        tag.toLowerCase() !== value.toLowerCase()
      );

      if (matchedTags.length === 0) {
        this.hideImageTagAutocomplete();
        return;
      }

      // 显示下拉框
      dropdown.innerHTML = matchedTags.map((tag, index) =>
        `<div class="autocomplete-item" data-index="${index}" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</div>`
      ).join('');
      dropdown.classList.add('active');

      // 绑定点击事件 - 点击直接添加标签
      dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', async () => {
          const tagName = item.dataset.tag;
          const success = await this.addImageTag(tagName);
          if (success) {
            input.value = '';
          }
          this.hideImageTagAutocomplete();
        });
      });
    });

    // 键盘导航
    input.addEventListener('keydown', async (e) => {
      const items = dropdown.querySelectorAll('.autocomplete-item');
      const selectedItem = dropdown.querySelector('.autocomplete-item.selected');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!selectedItem) {
          items[0]?.classList.add('selected');
        } else {
          selectedItem.classList.remove('selected');
          const nextItem = selectedItem.nextElementSibling;
          if (nextItem) {
            nextItem.classList.add('selected');
          } else {
            items[0]?.classList.add('selected');
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!selectedItem) {
          items[items.length - 1]?.classList.add('selected');
        } else {
          selectedItem.classList.remove('selected');
          const prevItem = selectedItem.previousElementSibling;
          if (prevItem) {
            prevItem.classList.add('selected');
          } else {
            items[items.length - 1]?.classList.add('selected');
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // 重新获取当前选中的项（因为可能刚用方向键选择）
        const currentSelectedItem = dropdown.querySelector('.autocomplete-item.selected');
        if (currentSelectedItem) {
          // 如果有选中的项，使用选中的标签
          const tagName = currentSelectedItem.dataset.tag;
          const success = await this.addImageTag(tagName);
          if (success) {
            input.value = '';
          }
          this.hideImageTagAutocomplete();
        } else {
          // 否则使用输入框的内容，支持逗号分隔批量添加
          const tag = input.value.trim();
          if (tag) {
            const tags = tag.split(',').map(t => t.trim()).filter(t => t);
            const success = await this.addImageTag(tags);
            if (success) {
              input.value = '';
            }
          }
        }
      } else if (e.key === 'Tab' && selectedItem) {
        e.preventDefault();
        input.value = selectedItem.dataset.tag;
        this.hideImageTagAutocomplete();
      } else if (e.key === 'Escape') {
        this.hideImageTagAutocomplete();
      }
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.image-tag-input-area')) {
        this.hideImageTagAutocomplete();
      }
    });
  }

  /**
   * 隐藏图像标签自动补全下拉框
   */
  hideImageTagAutocomplete() {
    const dropdown = document.getElementById('imageTagAutocomplete');
    dropdown.classList.remove('active');
    dropdown.innerHTML = '';
  }

  /**
   * 设置提示词标签自动补全
   */
  setupPromptTagAutocomplete() {
    const input = document.getElementById('promptTagsInput');
    const dropdown = document.getElementById('promptTagAutocomplete');

    input.addEventListener('input', async () => {
      const value = input.value.trim();
      if (!value) {
        this.hidePromptTagAutocomplete();
        return;
      }

      // 获取所有提示词标签
      const allTags = await window.electronAPI.getPromptTags();

      // 过滤匹配的标签（排除已添加的标签）
      const currentTags = this.promptTagManager ? this.promptTagManager.getTags() : [];
      const matchedTags = allTags.filter(tag =>
        tag.toLowerCase().startsWith(value.toLowerCase()) &&
        tag.toLowerCase() !== value.toLowerCase() &&
        !currentTags.includes(tag)
      );

      if (matchedTags.length === 0) {
        this.hidePromptTagAutocomplete();
        return;
      }

      // 显示下拉框
      dropdown.innerHTML = matchedTags.map((tag, index) =>
        `<div class="autocomplete-item" data-index="${index}" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</div>`
      ).join('');
      dropdown.classList.add('active');

      // 绑定点击事件 - 点击直接添加标签
      dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', async () => {
          const tagName = item.dataset.tag;
          const success = await this.addPromptTag(tagName);
          if (success) {
            input.value = '';
          }
          this.hidePromptTagAutocomplete();
        });
      });
    });

    // 键盘导航
    input.addEventListener('keydown', async (e) => {
      const items = dropdown.querySelectorAll('.autocomplete-item');
      const selectedItem = dropdown.querySelector('.autocomplete-item.selected');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!selectedItem) {
          items[0]?.classList.add('selected');
        } else {
          selectedItem.classList.remove('selected');
          const nextItem = selectedItem.nextElementSibling;
          if (nextItem) {
            nextItem.classList.add('selected');
          } else {
            items[0]?.classList.add('selected');
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!selectedItem) {
          items[items.length - 1]?.classList.add('selected');
        } else {
          selectedItem.classList.remove('selected');
          const prevItem = selectedItem.previousElementSibling;
          if (prevItem) {
            prevItem.classList.add('selected');
          } else {
            items[items.length - 1]?.classList.add('selected');
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // 重新获取当前选中的项（因为可能刚用方向键选择）
        const currentSelectedItem = dropdown.querySelector('.autocomplete-item.selected');
        if (currentSelectedItem) {
          // 如果有选中的项，使用选中的标签
          const tagName = currentSelectedItem.dataset.tag;
          const success = await this.addPromptTag(tagName);
          if (success) {
            input.value = '';
          }
          this.hidePromptTagAutocomplete();
        } else {
          // 否则使用输入框的内容，支持逗号分隔批量添加
          const tag = input.value.trim();
          if (tag) {
            const tags = tag.split(',').map(t => t.trim()).filter(t => t);
            const success = await this.addPromptTag(tags);
            if (success) {
              input.value = '';
            }
          }
        }
      } else if (e.key === 'Tab' && selectedItem) {
        e.preventDefault();
        input.value = selectedItem.dataset.tag;
        this.hidePromptTagAutocomplete();
      } else if (e.key === 'Escape') {
        this.hidePromptTagAutocomplete();
      }
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.prompt-tag-input-area')) {
        this.hidePromptTagAutocomplete();
      }
    });
  }

  /**
   * 隐藏提示词标签自动补全下拉框
   */
  hidePromptTagAutocomplete() {
    const dropdown = document.getElementById('promptTagAutocomplete');
    if (dropdown) {
      dropdown.classList.remove('active');
      dropdown.innerHTML = '';
    }
  }

  /**
   * 保存 Prompt
   * 创建新 Prompt 或更新现有 Prompt
   */
  async savePrompt() {
    const id = document.getElementById('promptId').value;
    const title = document.getElementById('promptTitle').value.trim();
    const content = document.getElementById('promptContent').value.trim();
    const contentTranslate = document.getElementById('promptContentTranslate').value.trim();
    const note = document.getElementById('promptNote').value.trim();
    const is_safe = document.getElementById('promptSafeToggle').checked ? 1 : 0;

    if (!title || !content) {
      this.showToast('请填写标题和内容', 'error');
      return;
    }

    // 检查标题是否重复（排除当前编辑的提示词）
    const isExists = await window.electronAPI.isTitleExists(title, id || null);
    if (isExists) {
      // 查找已存在的提示词
      const existingPrompt = this.prompts.find(p => p.title === title && p.id !== id);
      if (existingPrompt) {
        // 询问是否覆盖
        const confirmed = await this.showConfirmDialog(
          '标题已存在',
          `提示词 "${title}" 已存在，是否覆盖？`
        );
        if (!confirmed) {
          return;
        }

        // 从 promptTagManager 获取标签列表
        let tags = this.promptTagManager ? this.promptTagManager.getTags() : [];
        const images = this.currentImages;

        try {
          // 将新标签添加到提示词标签列表
          if (tags.length > 0) {
            const existingTags = await window.electronAPI.getPromptTags();
            const newTags = tags.filter(tag => !existingTags.includes(tag));
            for (const tag of newTags) {
              await window.electronAPI.addPromptTag(tag);
            }
          }

          // 如果是编辑模式，先删除原提示词（移动到回收站）
          if (id) {
            await window.electronAPI.deletePrompt(id);
          }

          // 使用已存在提示词的ID进行更新（覆盖）
          const coverId = existingPrompt.id;
          const result = await window.electronAPI.updatePrompt(coverId, { title, tags, content, contentTranslate, images, note, is_safe });
          if (result === null) {
            throw new Error('找不到要更新的 Prompt');
          }

          // 覆盖时联动更新关联的图像
          if (images && images.length > 0) {
            for (const image of images) {
              if (image.id) {
                try {
                  await window.electronAPI.updateImageSafeStatus(image.id, is_safe === 1);
                } catch (err) {
                  console.error(`Failed to update image ${image.id} safe status:`, err);
                }
              }
            }
          }

          this.showToast('Prompt 已覆盖');

          this.closeEditModal(false);
          await this.loadPrompts();
          this.renderTagFilters();
          return;
        } catch (error) {
          console.error('Cover save error:', error);
          this.showToast('覆盖失败: ' + error.message, 'error');
          return;
        }
      }
    }

    // 从 promptTagManager 获取标签列表
    let tags = this.promptTagManager ? this.promptTagManager.getTags() : [];

    const images = this.currentImages;

    // 获取原始提示词的安全评级（用于判断是否有变化）
    let originalIsSafe = null;
    if (id) {
      const originalPrompt = this.prompts.find(p => p.id === id);
      if (originalPrompt) {
        originalIsSafe = originalPrompt.is_safe;
      }
    }

    try {
      // 将新标签添加到提示词标签列表
      if (tags.length > 0) {
        const existingTags = await window.electronAPI.getPromptTags();
        const newTags = tags.filter(tag => !existingTags.includes(tag));
        for (const tag of newTags) {
          await window.electronAPI.addPromptTag(tag);
        }
      }

      if (id) {
        // 更新
        const result = await window.electronAPI.updatePrompt(id, { title, tags, content, contentTranslate, images, note, is_safe });
        if (result === null) {
          throw new Error('找不到要更新的 Prompt');
        }

        // 如果安全评级发生变化，联动更新关联的图像
        if (originalIsSafe !== null && originalIsSafe !== is_safe) {
          if (images && images.length > 0) {
            for (const image of images) {
              if (image.id) {
                try {
                  await window.electronAPI.updateImageSafeStatus(image.id, is_safe === 1);
                } catch (err) {
                  console.error(`Failed to update image ${image.id} safe status:`, err);
                }
              }
            }
          }
        }

        this.showToast('Prompt 已更新');
      } else {
        // 新建
        await window.electronAPI.addPrompt({ title, tags, content, contentTranslate, images, note, is_safe });

        // 新建提示词时，联动更新关联的图像
        if (images && images.length > 0) {
          for (const image of images) {
            if (image.id) {
              try {
                await window.electronAPI.updateImageSafeStatus(image.id, is_safe === 1);
              } catch (err) {
                console.error(`Failed to update image ${image.id} safe status:`, err);
              }
            }
          }
        }

        this.showToast('Prompt 已创建');
      }

      this.closeEditModal(false); // false 表示不是取消操作，不清理返回标志
      await this.loadPrompts();
      this.renderTagFilters();

      // 如果是从图像详情界面打开的编辑，保存成功后返回到图像详情界面
      if (this.returnToImageDetail) {
        this.returnToImageDetail = false;
        // 恢复图像详情状态
        this.detailImages = this.returnToImageDetailImages || [];
        this.detailCurrentIndex = this.returnToImageDetailIndex || 0;
        // 恢复原来的面板
        const originalPanel = this.returnToImageDetailPanel;
        // 清理临时状态
        this.returnToImageDetailImages = null;
        this.returnToImageDetailIndex = null;
        this.returnToImageDetailPanel = null;
        // 如果原来在图像管理界面，切换回去
        if (originalPanel === 'image' && this.currentPanel !== 'image') {
          this.openImageManager();
        }
        // 重新打开图像详情界面
        if (this.detailImages.length > 0) {
          const currentImage = this.detailImages[this.detailCurrentIndex];
          await this.openImageDetailModal(currentImage, null, this.detailImages, this.detailCurrentIndex);
        }
      }
    } catch (error) {
      console.error('Save error:', error);
      this.showToast('保存失败: ' + error.message, 'error');
    }
  }

  /**
   * 保存单个字段（即时保存模式）
   * @param {string} field - 字段名
   * @param {any} value - 字段值
   */
  async savePromptField(field, value) {
    const id = document.getElementById('promptId').value;
    if (!id) return; // 新建模式不自动保存字段

    try {
      // 特殊处理标题字段，需要检查重复
      if (field === 'title') {
        const isExists = await window.electronAPI.isTitleExists(value, id);
        if (isExists) {
          this.showToast('该提示词标题已存在', 'error');
          return;
        }
      }

      // 处理标签字段 - 确保新标签被添加到标签列表
      if (field === 'tags' && Array.isArray(value)) {
        const existingTags = await window.electronAPI.getPromptTags();
        const newTags = value.filter(tag => !existingTags.includes(tag));
        for (const tag of newTags) {
          await window.electronAPI.addPromptTag(tag);
        }
      }

      // 构建更新数据
      const updateData = { [field]: value };
      await window.electronAPI.updatePrompt(id, updateData);

      // 更新本地数据
      const prompt = this.prompts.find(p => p.id === id);
      if (prompt) {
        prompt[field] = value;
      }
    } catch (error) {
      console.error('Save field error:', error);
      this.showToast('保存失败: ' + error.message, 'error');
    }
  }

  /**
   * 保存并关闭编辑模态框
   */
  async savePromptAndClose() {
    const id = document.getElementById('promptId').value;
    const title = document.getElementById('promptTitle').value.trim();
    const content = document.getElementById('promptContent').value.trim();

    if (!title || !content) {
      this.showToast('请填写标题和内容', 'error');
      return;
    }

    // 先保存当前内容
    await this.savePromptWithoutClosing();

    // 如果是从图像详情界面进入的编辑，保存后返回到图像详情界面
    if (this.returnToImageDetail) {
      this.returnToImageDetail = false;
      // 恢复图像详情状态
      this.detailImages = this.returnToImageDetailImages || [];
      this.detailCurrentIndex = this.returnToImageDetailIndex || 0;
      // 恢复到原始面板
      if (this.returnToImageDetailPanel && this.returnToImageDetailPanel !== this.currentPanel) {
        if (this.returnToImageDetailPanel === 'image') {
          this.openImageManager();
        } else if (this.returnToImageDetailPanel === 'prompt') {
          this.openPromptManager();
        }
      }
      // 关闭编辑模态框
      document.getElementById('editModal').classList.remove('active');
      // 刷新数据
      await this.loadPrompts();
      this.renderTagFilters();
      // 打开图像详情界面
      document.getElementById('imageDetailModal').classList.add('active');
      // 刷新图像显示
      await this.updateImageDetailView();
      // 清理临时状态
      this.returnToImageDetailImages = null;
      this.returnToImageDetailIndex = null;
      this.returnToImageDetailPanel = null;
    } else {
      this.closeEditModal(false);
      await this.loadPrompts();
      this.renderTagFilters();
    }
  }

  /**
   * 删除 Prompt
   * 将 Prompt 移动到回收站
   * @param {string} id - 要删除的 Prompt ID
   */
  async deletePrompt(id) {
    try {
      await window.electronAPI.deletePrompt(id);
      this.showToast('Prompt 已删除');
      await this.loadPrompts();
    } catch (error) {
      console.error('deletePrompt error:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 切换收藏状态
   * @param {string} id - Prompt ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleFavorite(id, isFavorite) {
    try {
      await window.electronAPI.toggleFavoritePrompt(id, isFavorite);
      // 更新本地数据
      const prompt = this.prompts.find(p => p.id === id);
      if (prompt) {
        prompt.isFavorite = isFavorite;
        // 收藏状态通过 isFavorite 字段单独处理，不添加到 tags 数组
      }
      this.showToast(isFavorite ? '已收藏' : '已取消收藏', 'success');
      // 只更新单个卡片的UI，避免重新渲染整个列表
      this.updateFavoriteUI(id, isFavorite);
      // 重新渲染标签筛选器以更新计数
      this.renderTagFilters();
    } catch (error) {
      console.error('toggleFavorite error:', error);
      this.showToast('操作失败: ' + error.message, 'error');
    }
  }

  /**
   * 更新收藏按钮UI
   * @param {string} id - Prompt ID
   * @param {boolean} isFavorite - 是否收藏
   */
  updateFavoriteUI(id, isFavorite) {
    // 统一更新收藏按钮 UI
    const updateBtn = (btn) => {
      if (!btn) return;
      if (isFavorite) {
        btn.classList.add('active');
        btn.title = '取消收藏';
        btn.innerHTML = this.ICONS.favorite.filled;
      } else {
        btn.classList.remove('active');
        btn.title = '收藏';
        btn.innerHTML = this.ICONS.favorite.outline;
      }
    };

    // 更新卡片视图
    const card = document.querySelector(`.prompt-card[data-id="${id}"]`);
    if (card) {
      updateBtn(card.querySelector('.favorite-btn'));
      // 更新卡片边框样式
      card.classList.toggle('is-favorite', isFavorite);
    }

    // 更新列表视图
    const listItem = document.querySelector(`.prompt-list-item[data-id="${id}"]`);
    if (listItem) {
      updateBtn(listItem.querySelector('.favorite-btn'));
      // 更新列表项边框样式
      listItem.classList.toggle('is-favorite', isFavorite);
    }
  }

  /**
   * 复制当前查看的 Prompt 内容到剪贴板
   */
  /**
   * 导入 Prompts
   * 从 JSON 文件导入 Prompt 数据
   */
  async importPrompts() {
    try {
      const result = await window.electronAPI.importPrompts();
      if (result) {
        this.prompts = result;
        this.render();
        this.showToast('导入成功');
      }
    } catch (error) {
      this.showToast('导入失败: ' + error.message, 'error');
    }
  }

  /**
   * 导出 Prompts
   * 将 Prompt 数据导出为 JSON 文件
   */
  async exportPrompts() {
    try {
      const result = await window.electronAPI.exportPrompts(this.prompts);
      if (result) {
        this.showToast('导出成功');
      }
    } catch (error) {
      this.showToast('导出失败: ' + error.message, 'error');
    }
  }

  /**
   * 恢复面板状态
   * 根据保存的状态打开对应的面板
   */
  restorePanelState() {
    if (this.currentPanel === 'image') {
      this.openImageManager();
    } else {
      this.openPromptManager();
    }
  }

  /**
   * 保存面板状态
   * 将当前面板状态保存到 localStorage
   */
  savePanelState() {
    localStorage.setItem('currentPanel', this.currentPanel);
  }

  /**
   * 打开提示词管理面板
   * 显示提示词列表，隐藏图像面板
   */
  openPromptManager() {
    this.currentPanel = 'prompt';
    document.getElementById('promptPanel').style.display = 'flex';
    document.getElementById('imagePanel').style.display = 'none';
    this.clearImageSelection();
    this.updateSidebarButtonState();
    this.savePanelState();
  }

  /**
   * 打开图像管理面板
   * 显示图像列表，隐藏提示词面板
   */
  async openImageManager() {
    this.currentPanel = 'image';
    document.getElementById('promptPanel').style.display = 'none';
    document.getElementById('imagePanel').style.display = 'flex';
    await this.renderImageTagFilters();
    await this.renderImageGrid();
    this.updateSidebarButtonState();
    this.savePanelState();
  }

  /**
   * 渲染图像标签筛选器
   * 获取所有图像标签并显示在筛选区域（左右分栏布局，支持分组）
   */
  async renderImageTagFilters() {
    try {
      const container = document.getElementById('imageTagFilterList');
      const specialTagsContainer = document.getElementById('imageTagFilterSpecialTags');
      const clearBtn = document.getElementById('clearImageTagFilter');

      // Get all images to count tags
      const allImages = await window.electronAPI.getImages();

      // 根据 viewMode 过滤图像（safe 模式只统计安全内容）
      const visibleImages = this.viewMode === 'safe'
        ? allImages.filter(img => img.is_safe !== 0)
        : allImages;

      // 计算收藏数量（根据 viewMode 过滤）
      const favoriteCount = visibleImages.filter(img => img.isFavorite).length;

      // 计算未引用数量（没有被任何提示词引用，根据 viewMode 过滤）
      const unreferencedCount = visibleImages.filter(img => !img.promptRefs || img.promptRefs.length === 0).length;

      // 计算多引用数量（被多个提示词引用，根据 viewMode 过滤）
      const multiRefCount = visibleImages.filter(img => img.promptRefs && img.promptRefs.length > 1).length;

      // 计算违单图像数量（根据 viewMode 过滤）
      const violatingCount = visibleImages.filter(img => img.tags && img.tags.includes(PromptManager.VIOLATING_TAG)).length;

      // 收集所有标签及其数量（基于可见的图像）
      const tagCounts = {};
      visibleImages.forEach(img => {
        if (img.tags && img.tags.length > 0) {
          img.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      // 获取标签组信息
      let tagGroups = [];
      let tagsWithGroup = [];
      try {
        tagsWithGroup = await window.electronAPI.getImageTagsWithGroup();
        tagGroups = await window.electronAPI.getImageTagGroups();
      } catch (error) {
        console.error('Failed to load image tag groups:', error);
      }

      // 构建特殊标签列表
      const specialTags = [];
      if (favoriteCount > 0) {
        specialTags.push({ tag: PromptManager.FAVORITE_TAG, count: favoriteCount, class: 'favorite-tag' });
      }
      // 仅在 nsfw 模式下显示安全/不安全标签
      if (this.viewMode === 'nsfw') {
        const safeCount = allImages.filter(img => img.is_safe !== 0).length;
        const unsafeCount = allImages.filter(img => img.is_safe === 0).length;
        if (safeCount > 0) {
          specialTags.push({ tag: PromptManager.SAFE_TAG, count: safeCount, class: 'safe-tag' });
        }
        if (unsafeCount > 0) {
          specialTags.push({ tag: PromptManager.UNSAFE_TAG, count: unsafeCount, class: 'unsafe-tag' });
        }
      }
      if (unreferencedCount > 0) {
        specialTags.push({ tag: PromptManager.UNREFERENCED_TAG, count: unreferencedCount, class: 'unreferenced-tag' });
      }
      if (multiRefCount > 0) {
        specialTags.push({ tag: PromptManager.MULTI_REF_TAG, count: multiRefCount, class: 'multi-ref-tag' });
      }
      if (violatingCount > 0) {
        specialTags.push({ tag: PromptManager.VIOLATING_TAG, count: violatingCount, class: 'violating-tag' });
      }

      // 按组组织标签
      const groupedTags = {};
      const ungroupedTags = [];

      // 初始化组
      tagGroups.forEach(group => {
        groupedTags[group.name] = { group, tags: [] };
      });

      // 从 tagsWithGroup 获取所有标签（包括计数为0的），而不是仅从 tagCounts
      const imageSpecialTags = PromptManager.getImageSpecialTags(true);
      tagsWithGroup.forEach(({ name: tag }) => {
        // 跳过特殊标签
        if (imageSpecialTags.includes(tag)) {
          return;
        }

        const count = tagCounts[tag] || 0;
        const tagInfo = tagsWithGroup.find(t => t.name === tag);
        if (tagInfo && tagInfo.groupName && groupedTags[tagInfo.groupName]) {
          groupedTags[tagInfo.groupName].tags.push({ tag, count });
        } else {
          ungroupedTags.push({ tag, count });
        }
      });

      // 根据排序设置对标签进行排序
      const sortTags = (tags) => {
        return tags.sort((a, b) => {
          if (this.imageTagFilterSortBy === 'count') {
            return this.imageTagFilterSortOrder === 'asc' ? a.count - b.count : b.count - a.count;
          } else if (this.imageTagFilterSortBy === 'name') {
            const nameA = a.tag.toLowerCase();
            const nameB = b.tag.toLowerCase();
            if (nameA < nameB) return this.imageTagFilterSortOrder === 'asc' ? -1 : 1;
            if (nameA > nameB) return this.imageTagFilterSortOrder === 'asc' ? 1 : -1;
            return 0;
          }
          return 0;
        });
      };

      // 渲染特殊标签（左侧）
      let specialTagsHtml = '';
      if (specialTags.length > 0) {
        specialTagsHtml += specialTags.map(({ tag, count, class: className }) => {
          const isActive = this.selectedImageTags.includes(tag);
          return `
            <button class="tag-filter-item ${isActive ? 'active' : ''} ${className}" data-tag="${this.escapeHtml(tag)}" data-is-special="true">
              <span class="tag-name">${this.escapeHtml(tag)}</span>
              <span class="tag-badge">${count}</span>
            </button>
          `;
        }).join('');
      }
      if (specialTagsContainer) {
        specialTagsContainer.innerHTML = specialTagsHtml || '<span class="tag-filter-empty">暂无特殊标签</span>';
      }

      // 渲染普通标签（右侧）
      let html = '';

      // 将分组标签转换为数组并按 sortOrder 排序
      const sortedGroups = Object.entries(groupedTags)
        .map(([groupName, data]) => ({ groupName, ...data }))
        .sort((a, b) => (a.group.sortOrder || 0) - (b.group.sortOrder || 0));

      // 渲染分组标签（只显示有标签的组）
      sortedGroups.forEach(({ groupName, group, tags }) => {
        // 过滤出计数大于0的标签
        const visibleTags = tags.filter(({ count }) => count > 0);
        if (visibleTags.length === 0) return;
        const sortedTags = sortTags([...visibleTags]);
        html += '<div class="tag-filter-group">';
        html += `<div class="tag-filter-group-title">${this.escapeHtml(groupName)} <span class="tag-filter-group-type">${group.type === 'single' ? '单选' : '多选'}</span></div>`;
        html += '<div class="tag-filter-group-content">';
        html += sortedTags.map(({ tag, count }) => {
          const isActive = this.selectedImageTags.includes(tag);
          return `
            <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}" draggable="true" data-drag-type="image-tag">
              <span class="tag-name">${this.escapeHtml(tag)}</span>
              <span class="tag-badge">${count}</span>
            </div>
          `;
        }).join('');
        html += '</div></div>';
      });

      // 渲染未分组标签（只显示计数大于0的）
      const visibleUngroupedTags = ungroupedTags.filter(({ count }) => count > 0);
      if (visibleUngroupedTags.length > 0) {
        const sortedTags = sortTags([...visibleUngroupedTags]);
        html += '<div class="tag-filter-group">';
        html += '<div class="tag-filter-group-title">未分组</div>';
        html += '<div class="tag-filter-group-content">';
        html += sortedTags.map(({ tag, count }) => {
          const isActive = this.selectedImageTags.includes(tag);
          return `
            <div class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}" draggable="true" data-drag-type="image-tag">
              <span class="tag-name">${this.escapeHtml(tag)}</span>
              <span class="tag-badge">${count}</span>
            </div>
          `;
        }).join('');
        html += '</div></div>';
      }

      if (html === '') {
        container.innerHTML = '<span class="tag-filter-empty">暂无标签</span>';
        if (clearBtn) clearBtn.style.display = 'none';
      } else {
        container.innerHTML = html;
      }

      // 显示/隐藏清除按钮
      if (clearBtn) clearBtn.style.display = this.selectedImageTags.length > 0 ? 'block' : 'none';

      // 更新摘要信息
      this.updateImageTagFilterSummary(specialTags, Object.values(groupedTags), ungroupedTags, tagsWithGroup);

      // 绑定点击事件（特殊标签和普通标签）
      const bindTagClick = (item) => {
        item.addEventListener('click', async (e) => {
          const tag = item.dataset.tag;

          // 获取标签所属的组信息
          const tagInfo = tagsWithGroup.find(t => t.name === tag);
          const isSingleSelectGroup = tagInfo && tagInfo.groupType === 'single';

          if (e.shiftKey) {
            // Shift+点击：多选模式（单选组仍限制单选）
            if (this.selectedImageTags.includes(tag)) {
              this.selectedImageTags = this.selectedImageTags.filter(t => t !== tag);
            } else {
              if (isSingleSelectGroup && tagInfo) {
                // 单选组：取消同组其他标签
                const groupId = tagInfo.groupId;
                const groupTags = tagsWithGroup.filter(t => t.groupId === groupId);
                groupTags.forEach(t => {
                  this.selectedImageTags = this.selectedImageTags.filter(st => st !== t.name);
                });
              }
              this.selectedImageTags.push(tag);
            }
          } else {
            // 普通点击：纯单选模式
            if (this.selectedImageTags.includes(tag)) {
              // 如果已选中，则取消选择
              this.selectedImageTags = this.selectedImageTags.filter(t => t !== tag);
            } else {
              // 未选中：清除所有选择，只选中当前
              this.selectedImageTags = [tag];
            }
          }
          this.renderImageTagFilters();
          // 先清除选择状态，再渲染
          this.selectedImageIds.clear();
          this.lastSelectedIndex = -1;
          await this.renderImageGrid();
          this.renderBatchOperationToolbar();
        });
      };

      // 绑定特殊标签点击事件
      if (specialTagsContainer) {
        specialTagsContainer.querySelectorAll('.tag-filter-item').forEach(bindTagClick);
      }
      // 绑定普通标签点击事件
      if (container) {
        container.querySelectorAll('.tag-filter-item').forEach(bindTagClick);
      }

      // 绑定图像标签筛选区拖拽事件（支持拖拽到图像卡片）
      this.bindImageTagFilterDragEvents(container);
    } catch (error) {
      console.error('Failed to render image tag filters:', error);
    }
  }

  /**
   * 清除图像标签筛选
   * 重置筛选状态并重新渲染图像列表
   */
  async clearImageTagFilter() {
    this.selectedImageTags = [];
    // 先清除选择状态，再渲染
    this.selectedImageIds.clear();
    this.lastSelectedIndex = -1;
    await this.renderImageTagFilters();
    await this.renderImageGrid();
    this.renderBatchOperationToolbar();
  }

  /**
   * 更新图像标签筛选区域摘要（收起时显示）
   * @param {Array} specialTags - 特殊标签列表
   * @param {Array} groupedTags - 分组标签列表
   * @param {Array} ungroupedTags - 未分组标签列表
   * @param {Array} tagsWithGroup - 带组信息的标签列表
   */
  updateImageTagFilterSummary(specialTags, groupedTags, ungroupedTags, tagsWithGroup) {
    const summaryEl = document.getElementById('imageTagFilterSummary');
    if (!summaryEl) return;

    const tagsToShow = [];
    let topGroupInfo = null;

    // 1. 所有特殊标签
    specialTags.forEach(({ tag, count, class: className }) => {
      const isActive = this.selectedImageTags.includes(tag);
      tagsToShow.push({
        tag,
        count,
        className: `${className} ${isActive ? 'active' : ''}`,
        isSpecial: true,
        isTopGroup: false
      });
    });

    // 2. 优先级最高的标签组的所有标签（按 sort 字段排序，取最小的）
    const nonEmptyGroups = groupedTags.filter(g => g.tags.length > 0);
    if (nonEmptyGroups.length > 0) {
      // 按 sortOrder 字段排序，取第一个（sortOrder 数值最小的）
      const topGroup = nonEmptyGroups.sort((a, b) => (a.group.sortOrder || 0) - (b.group.sortOrder || 0))[0];
      topGroupInfo = topGroup;
      topGroup.tags.forEach(({ tag, count }) => {
        // 跳过计数为0的标签
        if (count === 0) return;
        // 避免重复添加
        if (!tagsToShow.some(t => t.tag === tag)) {
          const isActive = this.selectedImageTags.includes(tag);
          tagsToShow.push({
            tag,
            count,
            className: isActive ? 'active' : '',
            isSpecial: false,
            isTopGroup: true,
            isSingleSelect: topGroupInfo.group.type === 'single'
          });
        }
      });
    }

    // 3. 所有选中的普通标签（可能包含其他组的）
    this.selectedImageTags.forEach(tag => {
      // 排除已经在列表中的
      if (!tagsToShow.some(t => t.tag === tag)) {
        // 查找标签数量
        let count = 0;
        const groupTag = groupedTags.flatMap(g => g.tags).find(t => t.tag === tag);
        if (groupTag) {
          count = groupTag.count;
        } else {
          const ungroupedTag = ungroupedTags.find(t => t.tag === tag);
          if (ungroupedTag) {
            count = ungroupedTag.count;
          }
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
      summaryEl.innerHTML = '<span class="tag-filter-empty">暂无标签</span>';
    } else {
      summaryEl.innerHTML = tagsToShow.map(({ tag, count, className, isTopGroup, isSingleSelect }) => `
        <button class="tag-filter-item ${className}" data-tag="${this.escapeHtml(tag)}" data-is-special="true" data-is-top-group="${isTopGroup}" data-is-single-select="${isSingleSelect || false}">
          <span class="tag-name">${this.escapeHtml(tag)}</span>
          <span class="tag-badge">${count}</span>
        </button>
      `).join('');

      // 绑定点击事件
      summaryEl.querySelectorAll('.tag-filter-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          const tag = item.dataset.tag;
          const isTopGroupTag = item.dataset.isTopGroup === 'true';
          const isSingleSelectGroup = item.dataset.isSingleSelect === 'true';

          if (e.shiftKey) {
            // Shift+点击：多选模式（单选组仍限制单选）
            if (this.selectedImageTags.includes(tag)) {
              this.selectedImageTags = this.selectedImageTags.filter(t => t !== tag);
            } else {
              if (isTopGroupTag && isSingleSelectGroup && topGroupInfo) {
                // 单选组：取消同组其他标签
                const groupTags = topGroupInfo.tags.map(t => t.tag);
                groupTags.forEach(t => {
                  this.selectedImageTags = this.selectedImageTags.filter(st => st !== t);
                });
              }
              this.selectedImageTags.push(tag);
            }
          } else {
            // 普通点击：单选模式（特殊标签也单选）
            if (this.selectedImageTags.includes(tag)) {
              this.selectedImageTags = this.selectedImageTags.filter(t => t !== tag);
            } else {
              // 先清除所有已选标签
              this.selectedImageTags = [];
              this.selectedImageTags.push(tag);
            }
          }
          this.renderImageTagFilters();
          // 先清除选择状态，再渲染
          this.selectedImageIds.clear();
          this.lastSelectedIndex = -1;
          await this.renderImageGrid();
          this.renderBatchOperationToolbar();
        });
      });
    }
  }

  /**
   * 更新图像管理界面视图模式
   * 切换网格视图和列表视图的显示状态
   */
  updateImageViewMode() {
    const imageGrid = document.getElementById('imageGrid');
    const imageList = document.getElementById('imageList');
    const gridViewBtn = document.getElementById('imageGridViewBtn');
    const listViewBtn = document.getElementById('imageListViewBtn');
    const compactViewBtn = document.getElementById('imageCompactViewBtn');
    const thumbnailSizeSlider = document.getElementById('thumbnailSizeSlider');
    const thumbnailSizeSliderContainer = thumbnailSizeSlider?.closest('.thumbnail-size-slider');

    // 重置所有按钮状态
    if (gridViewBtn) gridViewBtn.classList.remove('active');
    if (listViewBtn) listViewBtn.classList.remove('active');
    if (compactViewBtn) compactViewBtn.classList.remove('active');

    if (this.imageViewMode === 'grid') {
      imageGrid.style.display = 'grid';
      imageList.style.display = 'none';
      if (gridViewBtn) gridViewBtn.classList.add('active');
      // 显示缩略图尺寸滑杆
      if (thumbnailSizeSliderContainer) {
        thumbnailSizeSliderContainer.style.display = 'flex';
      }
    } else {
      imageGrid.style.display = 'none';
      imageList.style.display = 'flex';
      // 隐藏缩略图尺寸滑杆（列表视图不需要）
      if (thumbnailSizeSliderContainer) {
        thumbnailSizeSliderContainer.style.display = 'none';
      }

      if (this.imageViewMode === 'list') {
        if (listViewBtn) listViewBtn.classList.add('active');
      } else if (this.imageViewMode === 'list-compact') {
        if (compactViewBtn) compactViewBtn.classList.add('active');
      }
    }
  }

  /**
   * 更新提示词管理界面视图模式
   * 切换网格视图、列表视图和紧凑视图的显示状态
   */
  updatePromptViewMode() {
    const promptList = document.getElementById('promptList');
    const promptListView = document.getElementById('promptListView');
    const gridViewBtn = document.getElementById('promptGridViewBtn');
    const listViewBtn = document.getElementById('promptListViewBtn');
    const compactViewBtn = document.getElementById('promptCompactViewBtn');
    const cardSizeSlider = document.getElementById('promptCardSizeSlider');
    const cardSizeSliderContainer = cardSizeSlider?.closest('.thumbnail-size-slider');

    // 重置所有按钮状态
    if (gridViewBtn) gridViewBtn.classList.remove('active');
    if (listViewBtn) listViewBtn.classList.remove('active');
    if (compactViewBtn) compactViewBtn.classList.remove('active');

    if (this.promptViewMode === 'grid') {
      promptList.style.display = 'grid';
      promptListView.style.display = 'none';
      if (gridViewBtn) gridViewBtn.classList.add('active');
      // 显示卡片尺寸滑杆
      if (cardSizeSliderContainer) {
        cardSizeSliderContainer.style.display = 'flex';
      }
    } else if (this.promptViewMode === 'list') {
      promptList.style.display = 'none';
      promptListView.style.display = 'flex';
      promptListView.classList.remove('is-compact');
      if (listViewBtn) listViewBtn.classList.add('active');
      // 隐藏卡片尺寸滑杆（列表视图不需要）
      if (cardSizeSliderContainer) {
        cardSizeSliderContainer.style.display = 'none';
      }
    } else if (this.promptViewMode === 'list-compact') {
      promptList.style.display = 'none';
      promptListView.style.display = 'flex';
      promptListView.classList.add('is-compact');
      if (compactViewBtn) compactViewBtn.classList.add('active');
      // 隐藏卡片尺寸滑杆（紧凑视图不需要）
      if (cardSizeSliderContainer) {
        cardSizeSliderContainer.style.display = 'none';
      }
    }
  }

  /**
   * 更新侧边栏按钮状态
   * 根据当前面板高亮对应按钮
   */
  updateSidebarButtonState() {
    const promptBtn = document.getElementById('promptManagerBtn');
    const imageBtn = document.getElementById('imageManagerBtn');

    if (this.currentPanel === 'prompt') {
      promptBtn.classList.add('active');
      imageBtn.classList.remove('active');
    } else {
      promptBtn.classList.remove('active');
      imageBtn.classList.add('active');
    }
  }

  /**
   * 渲染批量操作工具栏
   * 列表视图多选时显示
   */
  renderBatchOperationToolbar() {
    const toolbar = document.getElementById('imageBatchToolbar');
    const selectAllCheckbox = document.getElementById('batchSelectAllCheckbox');
    const selectedCountEl = document.getElementById('batchSelectedCount');
    const actionsContainer = document.getElementById('batchToolbarActions');

    if (!toolbar || !selectAllCheckbox || !selectedCountEl || !actionsContainer) return;

    const selectedCount = this.selectedImageIds.size;
    const totalCount = this.imageGridImages?.length || 0;

    // 更新全选复选框状态
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalCount;

    if (selectedCount === 0) {
      toolbar.style.display = 'none';
      return;
    }

    toolbar.style.display = 'flex';
    selectedCountEl.textContent = `已选择 ${selectedCount} 项`;

    // 根据选中图像的收藏状态决定按钮文字
    const selectedImages = this.imageGridImages.filter(img => this.selectedImageIds.has(img.id));
    const allFavorited = selectedImages.length > 0 && selectedImages.every(img => img.isFavorite);
    const favoriteBtnText = allFavorited ? '批量取消收藏' : '批量收藏';

    // 渲染操作按钮
    actionsContainer.innerHTML = `
      <button type="button" class="btn btn-sm btn-secondary" id="batchInvertBtn" title="反选">
        反选
      </button>
      <button type="button" class="btn btn-sm btn-primary" id="batchFavoriteBtn" title="${favoriteBtnText}">
        ${favoriteBtnText}
      </button>
      <button type="button" class="btn btn-sm btn-primary" id="batchAddTagBtn" title="批量添加标签">
        批量添加标签
      </button>
      <button type="button" class="btn btn-sm btn-danger" id="batchDeleteBtn" title="批量删除">
        批量删除
      </button>
      <button type="button" class="btn btn-sm btn-secondary" id="batchCancelBtn" title="取消选择">
        取消选择
      </button>
    `;

    // 绑定事件
    document.getElementById('batchInvertBtn').onclick = () => this.invertImageSelection();
    document.getElementById('batchFavoriteBtn').onclick = () => this.batchFavoriteImages();
    document.getElementById('batchAddTagBtn').onclick = () => this.batchAddTagsToImages();
    document.getElementById('batchDeleteBtn').onclick = () => this.batchDeleteImages();
    document.getElementById('batchCancelBtn').onclick = () => this.clearImageSelection();
  }

  /**
   * 渲染图像网格
   * 显示所有保存的图像（每张图像只显示一次）
   * 支持按图像标签筛选
   */
  async renderImageGrid() {
    const imageGrid = document.getElementById('imageGrid');
    const imageList = document.getElementById('imageList');
    const imageEmptyState = document.getElementById('imageEmptyState');

    try {
      // 获取所有图像信息（每张图像只返回一条记录），传入排序参数
      const allImages = await window.electronAPI.getImages(this.imageSortBy, this.imageSortOrder);

      // 根据 viewMode 过滤（safe 模式只显示安全内容）
      let filteredImages = allImages;
      if (this.viewMode === 'safe') {
        filteredImages = allImages.filter(img => img.is_safe !== 0);
      }

      // 根据选中的标签筛选图像（多选时同时符合）
      if (this.selectedImageTags.length > 0) {
        filteredImages = filteredImages.filter(img =>
          this.selectedImageTags.every(tag => {
            if (tag === PromptManager.FAVORITE_TAG) {
              return img.isFavorite;
            } else if (tag === PromptManager.SAFE_TAG) {
              return img.is_safe !== 0;
            } else if (tag === PromptManager.UNSAFE_TAG) {
              return img.is_safe === 0;
            } else if (tag === PromptManager.UNREFERENCED_TAG) {
              return !img.promptRefs || img.promptRefs.length === 0;
            } else if (tag === PromptManager.MULTI_REF_TAG) {
              return img.promptRefs && img.promptRefs.length > 1;
            } else {
              return img.tags && img.tags.includes(tag);
            }
          })
        );
      }

      // 根据搜索关键词筛选图像（支持文件名、标签、备注搜索）
      if (this.imageSearchQuery) {
        const lowerQuery = this.imageSearchQuery.toLowerCase();
        filteredImages = filteredImages.filter(img =>
          img.fileName.toLowerCase().includes(lowerQuery) ||
          (img.tags && img.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) ||
          (img.note && img.note.toLowerCase().includes(lowerQuery))
        );
      }

      // 保存图像列表到实例变量，供详情页使用
      this.imageGridImages = filteredImages;

      if (filteredImages.length === 0) {
        imageGrid.innerHTML = '';
        if (imageList) imageList.innerHTML = '';
        imageEmptyState.style.display = 'flex';
        return;
      }

      imageEmptyState.style.display = 'none';

      // 异步获取所有图像的完整路径
      const imageData = await Promise.all(
        filteredImages.map(async (img, index) => {
          const imagePath = img.thumbnailPath || img.relativePath;
          if (!imagePath) return null;

          try {
            const fullPath = await window.electronAPI.getImagePath(imagePath);
            // 获取关联的提示词信息（取第一个关联的提示词）
            const promptRef = img.promptRefs && img.promptRefs.length > 0 ? img.promptRefs[0] : null;
            // 判断是否未引用
            const isUnreferenced = !img.promptRefs || img.promptRefs.length === 0;
            // 收藏按钮图标
            const favoriteIcon = img.isFavorite ? this.ICONS.favorite.filled : this.ICONS.favorite.outline;
            // 未引用标记
            const unreferencedBadge = isUnreferenced
              ? `<div class="image-card-unreferenced-badge" title="未引用图像">未引用</div>`
              : '';
            // 获取提示词内容（用于hover显示）
            let promptContent = '';
            if (promptRef && promptRef.promptContent) {
              promptContent = promptRef.promptContent;
            } else if (img.promptContent) {
              promptContent = img.promptContent;
            }
            const displayPrompt = promptContent || (isUnreferenced ? '未引用图像' : '无提示词');
            // 获取备注
            const note = img.note || '';
            return {
              index,
              img,
              fullPath,
              promptRef,
              isUnreferenced,
              favoriteIcon,
              unreferencedBadge,
              displayPrompt,
              note
            };
          } catch (error) {
            console.error('Failed to get image path:', error);
            return null;
          }
        })
      );

      // 过滤掉 null 值
      const validImageData = imageData.filter(data => data !== null);

      // 根据视图模式渲染
      if (this.imageViewMode === 'grid') {
        // 渲染网格视图
        const imageCards = validImageData.map(({ index, img, fullPath, promptRef, isUnreferenced, favoriteIcon, unreferencedBadge, displayPrompt }) => {
          // 生成标签 HTML
          const tagsHtml = this.generateTagsHtml(img.tags, 'image-card-tag', 'image-card-tag-empty');
          // 根据排序规则确定底部显示内容
          let dynamicInfo = '';
          if (this.imageSortBy === 'updatedAt' && img.updatedAt) {
            const date = new Date(img.updatedAt);
            dynamicInfo = `<div class="image-card-dynamic-info">更新于 ${date.toLocaleDateString('zh-CN')}</div>`;
          } else if (this.imageSortBy === 'createdAt' && img.createdAt) {
            const date = new Date(img.createdAt);
            dynamicInfo = `<div class="image-card-dynamic-info">创建于 ${date.toLocaleDateString('zh-CN')}</div>`;
          } else if (this.imageSortBy === 'fileName') {
            dynamicInfo = `<div class="image-card-file-name">${this.escapeHtml(img.fileName)}</div>`;
          } else if (this.imageSortBy === 'width' && img.width) {
            dynamicInfo = `<div class="image-card-dimensions">${img.width} x ${img.height || '?'} 像素</div>`;
          } else if (this.imageSortBy === 'height' && img.height) {
            dynamicInfo = `<div class="image-card-dimensions">${img.width || '?'} x ${img.height} 像素</div>`;
          } else if (this.imageSortBy === 'fileSize' && img.fileSize) {
            dynamicInfo = `<div class="image-card-file-size">${this.formatFileSize(img.fileSize)}</div>`;
          } else {
            dynamicInfo = `<div class="image-card-file-name">${this.escapeHtml(img.fileName)}</div>`;
          }
          return `
            <div class="image-card ${img.isFavorite ? 'is-favorite' : ''} ${isUnreferenced ? 'is-unreferenced' : ''}" data-index="${index}" data-prompt-id="${promptRef ? promptRef.promptId : ''}" data-image-id="${img.id}" data-prompt-content="${this.escapeAttr(displayPrompt)}" data-image-path="${fullPath}" data-drop-target="image">
              <div class="image-card-bg card__bg"></div>
              <div class="image-card-overlay card__overlay">
                <div class="image-card-header card__header">
                  <div class="image-card-actions-left">
                    <button type="button" class="favorite-btn ${img.isFavorite ? 'active' : ''}" data-image-id="${img.id}" title="${img.isFavorite ? '取消收藏' : '收藏'}">
                      ${favoriteIcon}
                    </button>
                  </div>
                  <div class="image-card-actions-right">
                    <button type="button" class="image-card-delete-btn" data-image-id="${img.id}" title="删除图像">
                      ${this.ICONS.delete}
                    </button>
                  </div>
                </div>
                <div class="image-card-content"></div>
                <div class="image-card-footer card__footer">
                  <div class="image-card-tags">${tagsHtml}</div>
                  ${dynamicInfo}
                </div>
                ${unreferencedBadge}
              </div>
            </div>
          `;
        });
        imageGrid.innerHTML = imageCards.join('');
        if (imageList) imageList.innerHTML = '';

        // 异步加载背景图
        this.loadImageCardBackgrounds();
      } else {
        // 渲染列表视图
        const allSelected = validImageData.length > 0 && validImageData.every(({ img }) => this.selectedImageIds.has(img.id));
        const listItems = validImageData.map(({ index, img, fullPath, promptRef, isUnreferenced, favoriteIcon, displayPrompt, note }) => {
          // 生成标签和备注 HTML
          const tagsHtml = this.generateTagsHtml(img.tags, 'image-list-tag', 'image-list-tag-empty');
          const noteHtml = this.generateNoteHtml(note, 'image-list-note');
          const isSelected = this.selectedImageIds.has(img.id);
          const isCompact = this.imageViewMode === 'list-compact';
          return `
            <div class="image-list-item ${img.isFavorite ? 'is-favorite' : ''} ${isUnreferenced ? 'is-unreferenced' : ''} ${isSelected ? 'is-selected' : ''} ${isCompact ? 'is-compact' : ''}" data-index="${index}" data-image-id="${img.id}" data-prompt-content="${this.escapeAttr(displayPrompt)}" data-drop-target="image">
              <input type="checkbox" class="image-list-checkbox" data-image-id="${img.id}" data-index="${index}" ${isSelected ? 'checked' : ''}>
              <img src="file://${fullPath}" alt="${img.fileName}" class="image-list-thumbnail">
              <div class="image-list-text-content">
                <div class="image-list-item-header">
                  <div class="image-list-file-name">${img.fileName}</div>
                  <div class="image-list-tags">${tagsHtml}</div>
                </div>
                <div class="image-list-prompt">${this.escapeHtml(displayPrompt)}</div>
                ${noteHtml}
              </div>
              <div class="image-list-actions">
                <button type="button" class="favorite-btn ${img.isFavorite ? 'active' : ''}" data-image-id="${img.id}" title="${img.isFavorite ? '取消收藏' : '收藏'}">
                  ${favoriteIcon}
                </button>
                <button type="button" class="delete-btn" data-image-id="${img.id}" title="删除图像">
                  ${this.ICONS.delete}
                </button>
              </div>
            </div>
          `;
        });
        imageGrid.innerHTML = '';
        if (imageList) {
          imageList.innerHTML = listItems.join('');
        }
      }

      // 定义容器变量（供后续使用）
      const container = this.imageViewMode === 'grid' ? imageGrid : imageList;

      // 绑定点击事件 - 打开图像详情（仅网格视图，列表视图在 bindListViewCheckboxEvents 中处理）
      if (this.imageViewMode === 'grid') {
        imageGrid.querySelectorAll('.image-card').forEach((item, index) => {
          item.addEventListener('click', async () => {
            const img = this.imageGridImages[index];
            if (!img) return;

            // 查找所属的 Prompt 信息（取第一个关联的提示词）
            let promptInfo = null;
            if (img.promptRefs && img.promptRefs.length > 0) {
              const promptRef = img.promptRefs[0];
              // 优先从本地缓存查找，如果没有则使用数据库返回的数据
              promptInfo = this.prompts.find(p => p.id === promptRef.promptId);
              if (!promptInfo && promptRef.promptContent) {
                promptInfo = {
                  title: promptRef.promptTitle,
                  content: promptRef.promptContent,
                  tags: []
                };
              }
            }

            // 打开图像详情模态框，传递图像列表和当前索引以支持导航
            await this.openImageDetailModal(img, promptInfo, this.imageGridImages, index);
          });
        });
      }

      // 绑定收藏按钮事件
      container.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation(); // 阻止冒泡，避免打开详情
          const imageId = e.currentTarget.dataset.imageId;
          const img = this.imageGridImages.find(i => i.id === imageId);
          if (img) {
            await this.toggleImageFavorite(imageId, !img.isFavorite);
          }
        });
      });

      // 绑定删除按钮事件
      if (this.imageViewMode === 'grid') {
        imageGrid.querySelectorAll('.image-card-delete-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // 阻止冒泡，避免打开详情
            const imageId = e.currentTarget.dataset.imageId;
            await this.deleteImage(imageId);
          });
        });
      } else {
        imageList.querySelectorAll('.delete-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // 阻止冒泡，避免打开详情
            const imageId = e.currentTarget.dataset.imageId;
            await this.deleteImage(imageId);
          });
        });

        // 绑定列表视图复选框事件
        this.bindListViewCheckboxEvents(imageList);
      }

      // 绑定图像卡片拖放事件 - 接收提示词标签
      this.bindImageCardDropEvents(container);

      // 绑定图像 hover 预览事件（使用 HoverTooltipManager）
      const selector = this.imageViewMode === 'grid' ? '.image-card' : '.image-list-item';
      this.bindImageHoverPreview(selector);
    } catch (error) {
      console.error('Failed to render image grid:', error);
      this.showToast('加载图像失败', 'error');
    }
  }

  /**
   * 绑定列表视图复选框事件
   * @param {HTMLElement} imageList - 列表容器
   */
  bindListViewCheckboxEvents(imageList) {
    if (!imageList) return;

    // 行复选框
    imageList.querySelectorAll('.image-list-checkbox').forEach(checkbox => {
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止冒泡，避免触发行的点击事件
      });

      checkbox.addEventListener('change', (e) => {
        const imageId = e.target.dataset.imageId;
        const index = parseInt(e.target.dataset.index);

        if (e.target.checked) {
          this.selectedImageIds.add(imageId);
          this.lastSelectedIndex = index;
        } else {
          this.selectedImageIds.delete(imageId);
        }

        this.renderImageGrid();
        this.renderBatchOperationToolbar();
      });
    });

    // 列表项点击事件（支持 Ctrl+点击和 Shift+点击多选，普通点击打开详情）
    imageList.querySelectorAll('.image-list-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        // 如果点击的是复选框，不处理
        if (e.target.classList.contains('image-list-checkbox')) return;

        const imageId = item.dataset.imageId;
        const index = parseInt(item.dataset.index);

        if (e.ctrlKey || e.metaKey) {
          // Ctrl+点击：切换选中状态
          if (this.selectedImageIds.has(imageId)) {
            this.selectedImageIds.delete(imageId);
          } else {
            this.selectedImageIds.add(imageId);
            this.lastSelectedIndex = index;
          }
          this.renderImageGrid();
          this.renderBatchOperationToolbar();
        } else if (e.shiftKey && this.lastSelectedIndex !== -1) {
          // Shift+点击：范围选择
          const start = Math.min(this.lastSelectedIndex, index);
          const end = Math.max(this.lastSelectedIndex, index);
          for (let i = start; i <= end; i++) {
            const img = this.imageGridImages[i];
            if (img) {
              this.selectedImageIds.add(img.id);
            }
          }
          this.lastSelectedIndex = index;
          this.renderImageGrid();
          this.renderBatchOperationToolbar();
        } else {
          // 普通点击：打开图像详情
          const img = this.imageGridImages[index];
          if (!img) return;

          // 查找所属的 Prompt 信息（取第一个关联的提示词）
          let promptInfo = null;
          if (img.promptRefs && img.promptRefs.length > 0) {
            const promptRef = img.promptRefs[0];
            // 优先从本地缓存查找，如果没有则使用数据库返回的数据
            promptInfo = this.prompts.find(p => p.id === promptRef.promptId);
            if (!promptInfo && promptRef.promptContent) {
              promptInfo = {
                title: promptRef.promptTitle,
                content: promptRef.promptContent,
                tags: []
              };
            }
          }

          // 打开图像详情模态框，传递图像列表和当前索引以支持导航
          await this.openImageDetailModal(img, promptInfo, this.imageGridImages, index);
        }
      });
    });
  }

  /**
   * 绑定批量操作工具栏事件
   * 在初始化时调用一次
   */
  bindBatchToolbarEvents() {
    const selectAllCheckbox = document.getElementById('batchSelectAllCheckbox');
    const selectAllText = document.querySelector('.batch-select-all-text');

    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        if (isChecked) {
          // 全选
          this.imageGridImages.forEach(img => this.selectedImageIds.add(img.id));
        } else {
          // 取消全选
          this.selectedImageIds.clear();
        }
        this.lastSelectedIndex = -1;
        this.renderImageGrid();
        this.renderBatchOperationToolbar();
      });
    }

    // 点击"全选"文字也能切换
    if (selectAllText) {
      selectAllText.addEventListener('click', () => {
        if (selectAllCheckbox) {
          selectAllCheckbox.click();
        }
      });
    }
  }

  /**
   * 反选图像
   * 选中的取消，未选中的选中
   */
  invertImageSelection() {
    // 获取当前所有可见图像
    const visibleImageIds = new Set(this.imageGridImages.map(img => img.id));
    
    // 新的选择集合
    const newSelection = new Set();
    
    // 遍历所有可见图像
    this.imageGridImages.forEach((img, index) => {
      if (!this.selectedImageIds.has(img.id)) {
        // 未选中的 -> 选中
        newSelection.add(img.id);
      }
      // 已选中的 -> 不加入新集合（即取消选中）
    });
    
    // 更新选择状态
    this.selectedImageIds = newSelection;
    this.lastSelectedIndex = -1;
    
    // 重新渲染
    this.renderImageGrid();
    this.renderBatchOperationToolbar();
  }

  /**
   * 清除图像选择
   */
  clearImageSelection() {
    this.selectedImageIds.clear();
    this.lastSelectedIndex = -1;
    this.renderImageGrid();
    this.renderBatchOperationToolbar();
  }

  /**
   * 批量收藏图像
   */
  async batchFavoriteImages() {
    const ids = Array.from(this.selectedImageIds);
    if (ids.length === 0) return;

    try {
      // 获取当前选中图像的收藏状态
      const images = this.imageGridImages.filter(img => this.selectedImageIds.has(img.id));
      const allFavorited = images.every(img => img.isFavorite);
      const newState = !allFavorited;

      for (const id of ids) {
        await window.electronAPI.toggleFavoriteImage(id, newState);
      }

      this.showToast(`${ids.length} 个图像已${newState ? '收藏' : '取消收藏'}`);
      await this.loadImages();  // 使用统一加载方法
      this.renderBatchOperationToolbar();
    } catch (error) {
      console.error('Batch favorite images error:', error);
      this.showToast('批量收藏失败', 'error');
    }
  }

  /**
   * 批量添加标签到图像
   */
  async batchAddTagsToImages() {
    const ids = Array.from(this.selectedImageIds);
    if (ids.length === 0) return;

    const tag = await this.showInputDialog('添加标签', '输入要添加的标签（多个标签用逗号分隔）');
    if (!tag || tag.trim() === '') return;

    try {
      const tags = tag.split(',').map(t => t.trim()).filter(t => t);
      for (const id of ids) {
        await window.electronAPI.addImageTags(id, tags);
      }

      this.showToast(`${ids.length} 个图像已添加标签`);
      await this.loadImages();  // 使用统一加载方法
      this.renderBatchOperationToolbar();
    } catch (error) {
      console.error('Batch add tags error:', error);
      this.showToast('批量添加标签失败', 'error');
    }
  }

  /**
   * 批量删除图像
   */
  async batchDeleteImages() {
    const ids = Array.from(this.selectedImageIds);
    if (ids.length === 0) return;

    const confirmed = await this.showConfirmDialog(
      '确认批量删除',
      `确定要将 ${ids.length} 个图像移动到回收站吗？`
    );
    if (!confirmed) return;

    try {
      for (const id of ids) {
        await window.electronAPI.softDeleteImage(id);
      }

      this.showToast(`${ids.length} 个图像已移动到回收站`);
      // 从选择中移除已删除的图像
      ids.forEach(id => this.selectedImageIds.delete(id));
      await this.loadImages();  // 使用统一加载方法
      this.renderBatchOperationToolbar();
    } catch (error) {
      console.error('Batch delete images error:', error);
      this.showToast('批量删除失败', 'error');
    }
  }

  /**
   * 删除图像（移动到回收站）
   * @param {string} imageId - 要删除的图像 ID
   */
  async deleteImage(imageId) {
    const confirmed = await this.showConfirmDialog('确认删除图像', '确定要将这个图像移动到回收站吗？');
    if (!confirmed) return;

    try {
      await window.electronAPI.softDeleteImage(imageId);
      this.showToast('图像已移动到回收站');
      await this.loadImages();  // 使用统一加载方法
    } catch (error) {
      console.error('Failed to delete image:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 绑定图像卡片拖放事件 - 接收提示词标签
   * @param {HTMLElement} container - 图像卡片容器
   */
  bindImageCardDropEvents(container) {
    if (!container) {
      console.error('Container is null or undefined');
      return;
    }

    const imageCards = container.querySelectorAll('[data-drop-target="image"]');

    if (imageCards.length === 0) {
      return;
    }

    imageCards.forEach(card => {
      // 使用 DOM 属性存储处理函数，以便移除
      if (!card._dragHandlers) {
        card._dragHandlers = {};
      }

      // 移除旧的事件监听器
      if (card._dragHandlers.dragover) {
        card.removeEventListener('dragover', card._dragHandlers.dragover);
      }
      if (card._dragHandlers.dragleave) {
        card.removeEventListener('dragleave', card._dragHandlers.dragleave);
      }
      if (card._dragHandlers.drop) {
        card.removeEventListener('drop', card._dragHandlers.drop);
      }

      // 定义事件处理函数
      card._dragHandlers.dragover = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        card.classList.add('drag-over');
      };

      card._dragHandlers.dragleave = (e) => {
        e.stopPropagation();
        card.classList.remove('drag-over');
      };

      card._dragHandlers.drop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over');

        const tagName = e.dataTransfer.getData('text/plain');
        const dragSource = e.dataTransfer.getData('drag-source');
        const imageId = card.dataset.imageId;

        if (!tagName || !imageId) {
          return;
        }

        // 只处理来自图像标签的拖拽
        if (dragSource !== 'image-tag') {
          return;
        }

        try {
          await this.addTagToImage(imageId, tagName);
          this.showToast(`标签 "${tagName}" 已添加到图像`);
        } catch (error) {
          console.error('Failed to add tag to image:', error);
          this.showToast('添加标签失败: ' + error.message, 'error');
        }
      };

      // 绑定事件
      card.addEventListener('dragover', card._dragHandlers.dragover);
      card.addEventListener('dragleave', card._dragHandlers.dragleave);
      card.addEventListener('drop', card._dragHandlers.drop);
    });
  }

  /**
   * 绑定提示词卡片拖放事件 - 接收标签
   * @param {HTMLElement} container - 提示词卡片容器
   */
  bindPromptCardDropEvents(container) {
    if (!container) {
      console.error('Prompt container is null or undefined');
      return;
    }

    const promptCards = container.querySelectorAll('[data-drop-target="prompt"]');

    if (promptCards.length === 0) {
      return;
    }

    promptCards.forEach(card => {
      // 使用 DOM 属性存储处理函数
      if (!card._dragHandlers) {
        card._dragHandlers = {};
      }

      // 移除旧的事件监听器
      if (card._dragHandlers.dragover) {
        card.removeEventListener('dragover', card._dragHandlers.dragover);
      }
      if (card._dragHandlers.dragleave) {
        card.removeEventListener('dragleave', card._dragHandlers.dragleave);
      }
      if (card._dragHandlers.drop) {
        card.removeEventListener('drop', card._dragHandlers.drop);
      }

      // 定义事件处理函数
      card._dragHandlers.dragover = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        card.classList.add('drag-over');
      };

      card._dragHandlers.dragleave = (e) => {
        e.stopPropagation();
        card.classList.remove('drag-over');
      };

      card._dragHandlers.drop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over');

        const tagName = e.dataTransfer.getData('text/plain');
        const dragSource = e.dataTransfer.getData('drag-source');
        const promptId = card.dataset.id;

        if (!tagName || !promptId) {
          return;
        }

        // 只处理来自提示词标签的拖拽
        if (dragSource !== 'prompt-tag') {
          return;
        }

        try {
          await this.addTagToPrompt(promptId, tagName);
          this.showToast(`标签 "${tagName}" 已添加到提示词`);
        } catch (error) {
          console.error('Failed to add tag to prompt:', error);
          this.showToast('添加标签失败: ' + error.message, 'error');
        }
      };

      // 绑定事件
      card.addEventListener('dragover', card._dragHandlers.dragover);
      card.addEventListener('dragleave', card._dragHandlers.dragleave);
      card.addEventListener('drop', card._dragHandlers.drop);
    });
  }

  /**
   * 添加标签到提示词
   * @param {string} promptId - 提示词ID
   * @param {string} tagName - 标签名称
   */
  async addTagToPrompt(promptId, tagName) {
    // 查找提示词
    const prompt = this.prompts.find(p => p.id === promptId);
    if (!prompt) {
      throw new Error('提示词不存在');
    }

    // 检查是否已有该标签
    if (prompt.tags && prompt.tags.includes(tagName)) {
      throw new Error('该提示词已存在此标签');
    }

    // 获取当前标签列表
    let currentTags = prompt.tags ? [...prompt.tags] : [];

    // 使用 TagManager 的违单检查逻辑
    const tagsWithGroup = await window.electronAPI.getPromptTagsWithGroup();
    const result = await TagManager.addTagWithViolationCheck(currentTags, tagName, tagsWithGroup);
    currentTags = result.tags;

    await window.electronAPI.updatePrompt(promptId, {
      tags: currentTags
    });

    prompt.tags = currentTags;
    this.render();
  }

  /**
   * 添加标签到图像
   * @param {string} imageId - 图像ID
   * @param {string} tagName - 标签名称
   */
  async addTagToImage(imageId, tagName) {
    // 先检查图像是否已有该标签
    const img = this.imageGridImages.find(i => i.id === imageId);
    if (img && img.tags && img.tags.includes(tagName)) {
      throw new Error('该图像已存在此标签');
    }

    // 获取当前标签列表
    let currentTags = img && img.tags ? [...img.tags] : [];

    const tagsWithGroup = await window.electronAPI.getImageTagsWithGroup();
    const result = await TagManager.addTagWithViolationCheck(currentTags, tagName, tagsWithGroup);
    currentTags = result.tags;

    await window.electronAPI.updateImageTags(imageId, currentTags);

    if (img) {
      img.tags = currentTags;
    }

    await this.renderImageGrid();
    this.renderImageTagFilters();
  }

  /**
   * 切换图像收藏状态
   * @param {string} id - 图像ID
   * @param {boolean} isFavorite - 是否收藏
   */
  async toggleImageFavorite(id, isFavorite) {
    try {
      await window.electronAPI.toggleFavoriteImage(id, isFavorite);
      // 更新本地数据
      const img = this.imageGridImages.find(i => i.id === id);
      if (img) {
        img.isFavorite = isFavorite;
        // 收藏状态通过 isFavorite 字段单独处理，不添加到 tags 数组
      }
      this.showToast(isFavorite ? '已收藏' : '已取消收藏', 'success');
      // 只更新单个卡片的UI
      this.updateImageFavoriteUI(id, isFavorite);
      // 重新渲染标签筛选器以更新计数
      this.renderImageTagFilters();
    } catch (error) {
      console.error('toggleImageFavorite error:', error);
      this.showToast('操作失败: ' + error.message, 'error');
    }
  }

  /**
   * 更新图像收藏按钮UI
   * @param {string} id - 图像ID
   * @param {boolean} isFavorite - 是否收藏
   */
  updateImageFavoriteUI(id, isFavorite) {
    // 统一更新收藏按钮 UI
    const updateBtn = (btn) => {
      if (!btn) return;
      if (isFavorite) {
        btn.classList.add('active');
        btn.title = '取消收藏';
        btn.innerHTML = this.ICONS.favorite.filled;
      } else {
        btn.classList.remove('active');
        btn.title = '收藏';
        btn.innerHTML = this.ICONS.favorite.outline;
      }
    };

    // 更新卡片视图
    const card = document.querySelector(`.image-card[data-image-id="${id}"]`);
    if (card) {
      updateBtn(card.querySelector('.favorite-btn'));
      card.classList.toggle('is-favorite', isFavorite);
    }

    // 更新列表视图
    const listItem = document.querySelector(`.image-list-item[data-image-id="${id}"]`);
    if (listItem) {
      updateBtn(listItem.querySelector('.favorite-btn'));
      listItem.classList.toggle('is-favorite', isFavorite);
    }
  }

  /**
   * 从缓存渲染图像网格
   */
  async renderImageGridFromCache() {
    const imageGrid = document.getElementById('imageGrid');
    const imageEmptyState = document.getElementById('imageEmptyState');

    if (this.imageGridImages.length === 0) {
      imageGrid.innerHTML = '';
      imageEmptyState.style.display = 'flex';
      return;
    }

    imageEmptyState.style.display = 'none';

    // 异步获取所有图像的完整路径
    const imageCards = await Promise.all(
      this.imageGridImages.map(async (img, index) => {
        const imagePath = img.thumbnailPath || img.relativePath;
        if (!imagePath) return '';

        try {
          const fullPath = await window.electronAPI.getImagePath(imagePath);
          const promptRef = img.promptRefs && img.promptRefs.length > 0 ? img.promptRefs[0] : null;
          const favoriteIcon = img.isFavorite ? this.ICONS.favorite.filled : this.ICONS.favorite.outline;
          return `
            <div class="image-card ${img.isFavorite ? 'is-favorite' : ''}" data-index="${index}" data-prompt-id="${promptRef ? promptRef.promptId : ''}" data-image-id="${img.id}" data-drop-target="image">
              <div class="image-card-thumbnail-wrapper">
                <img src="file://${fullPath}" alt="${img.fileName}" class="image-card-thumbnail">
                <button type="button" class="favorite-btn ${img.isFavorite ? 'active' : ''}" data-image-id="${img.id}" title="${img.isFavorite ? '取消收藏' : '收藏'}">
                  ${favoriteIcon}
                </button>
                <button type="button" class="image-card-delete-btn" data-image-id="${img.id}" title="删除图像">
                  ${this.ICONS.delete}
                </button>
              </div>
            </div>
          `;
        } catch (error) {
          console.error('Failed to get image path:', error);
          return '';
        }
      })
    );

    imageGrid.innerHTML = imageCards.filter(card => card).join('');

    // 绑定点击事件
    imageGrid.querySelectorAll('.image-card').forEach((card, index) => {
      card.addEventListener('click', async () => {
        const img = this.imageGridImages[index];
        if (!img) return;

        let promptInfo = null;
        if (img.promptRefs && img.promptRefs.length > 0) {
          const promptRef = img.promptRefs[0];
          promptInfo = this.prompts.find(p => p.id === promptRef.promptId);
          if (!promptInfo && promptRef.promptContent) {
            promptInfo = {
              title: promptRef.promptTitle,
              content: promptRef.promptContent,
              tags: []
            };
          }
        }

        await this.openImageDetailModal(img, promptInfo, this.imageGridImages, index);
      });
    });

    // 绑定收藏按钮事件
    imageGrid.querySelectorAll('.image-card-favorite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const imageId = e.currentTarget.dataset.imageId;
        const img = this.imageGridImages.find(i => i.id === imageId);
        if (img) {
          await this.toggleImageFavorite(imageId, !img.isFavorite);
        }
      });
    });

    // 绑定删除按钮事件
    imageGrid.querySelectorAll('.image-card-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const imageId = e.currentTarget.dataset.imageId;
        await this.deleteImage(imageId);
      });
    });

    // 绑定图像卡片拖放事件 - 接收提示词标签
    this.bindImageCardDropEvents(imageGrid);
  }

  /**
   * 打开图像上传模态框（简化版）
   */
  openImageUploadModal() {
    this.selectedUploadImage = null;
    document.getElementById('imageUploadForm').reset();
    document.getElementById('modalUploadPlaceholder').style.display = 'block';
    document.getElementById('modalImagePreviewSingle').style.display = 'none';
    document.getElementById('modalSinglePreviewImg').src = '';
    document.getElementById('confirmImageUploadBtn').disabled = true;
    document.getElementById('imageUploadModal').classList.add('active');

    // 初始化文本框高度
    setTimeout(() => {
      const uploadImagePrompt = document.getElementById('uploadImagePrompt');
      this.autoResizeTextarea(uploadImagePrompt);
    }, 0);
  }

  /**
   * 关闭图像上传模态框
   */
  closeImageUploadModal() {
    document.getElementById('imageUploadModal').classList.remove('active');
    this.selectedUploadImage = null;
  }

  /**
   * 绑定图像上传模态框事件（简化版）
   */
  bindImageUploadModalEvents() {
    // 关闭按钮
    document.getElementById('closeImageUploadModal').addEventListener('click', () => this.closeImageUploadModal());
    document.getElementById('cancelImageUploadBtn').addEventListener('click', () => this.closeImageUploadModal());

    // 点击外部关闭
    document.getElementById('imageUploadModal').addEventListener('click', (e) => {
      if (e.target.id === 'imageUploadModal') this.closeImageUploadModal();
    });

    // 上传图像模态框文本框自动调整高度
    const uploadImagePrompt = document.getElementById('uploadImagePrompt');
    if (uploadImagePrompt) {
      uploadImagePrompt.addEventListener('input', () => {
        this.autoResizeTextarea(uploadImagePrompt);
      });
    }

    // 点击上传区域选择文件
    document.getElementById('modalImageUploadArea').addEventListener('click', (e) => {
      if (e.target.closest('.remove-image')) return;
      document.getElementById('modalSingleImageInput').click();
    });

    // 文件选择
    document.getElementById('modalSingleImageInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleSingleImageSelect(file);
      }
    });

    // 删除已选图像
    document.getElementById('modalRemoveSingleImage').addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectedUploadImage = null;
      document.getElementById('modalUploadPlaceholder').style.display = 'block';
      document.getElementById('modalImagePreviewSingle').style.display = 'none';
      document.getElementById('modalSinglePreviewImg').src = '';
      document.getElementById('modalSingleImageInput').value = '';
      document.getElementById('confirmImageUploadBtn').disabled = true;
    });

    // 确认上传
    document.getElementById('confirmImageUploadBtn').addEventListener('click', () => this.confirmImageUpload());
  }

  /**
   * 处理单张图像选择（简化版）
   * @param {File} file - 选择的图像文件
   */
  handleSingleImageSelect(file) {
    if (!file.type.startsWith('image/')) {
      this.showToast('请选择图像文件', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.selectedUploadImage = file;
      document.getElementById('modalSinglePreviewImg').src = e.target.result;
      document.getElementById('modalUploadPlaceholder').style.display = 'none';
      document.getElementById('modalImagePreviewSingle').style.display = 'block';
      document.getElementById('confirmImageUploadBtn').disabled = false;
    };
    reader.readAsDataURL(file);
  }

  /**
   * 确认上传图像（简化版）
   */
  async confirmImageUpload() {
    if (!this.selectedUploadImage) {
      this.showToast('请先选择图像', 'error');
      return;
    }

    const prompt = document.getElementById('uploadImagePrompt').value.trim();

    // 保存文件名，因为 closeImageUploadModal 会将 selectedUploadImage 设为 null
    const fileName = this.selectedUploadImage.name;

    try {
      // 将文件保存到临时位置并上传
      const arrayBuffer = await this.selectedUploadImage.arrayBuffer();
      const tempPath = await window.electronAPI.saveTempFile(fileName, arrayBuffer);

      // 保存图像文件
      const imageInfo = await window.electronAPI.saveImageFile(tempPath, fileName);

      if (imageInfo.isDuplicate) {
        this.showToast(imageInfo.duplicateMessage || '图像已存在', 'info');
      } else {
        // 生成唯一的时间戳标题
        let title = this.generateUniqueTimestamp();

        // 检查标题是否已存在，如果存在则添加随机后缀
        let isExists = await window.electronAPI.isTitleExists(title);
        while (isExists) {
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          title = `${title}_${randomSuffix}`;
          isExists = await window.electronAPI.isTitleExists(title);
        }

        // 创建一个新的提示词（无论是否填写了提示词内容）
        await window.electronAPI.addPrompt({
          title: title,
          tags: [],
          content: prompt || '(无提示词内容)', // 如果没有输入提示词，显示默认文本
          images: [{ id: imageInfo.id, fileName: imageInfo.fileName }],
          is_safe: 1
        });

        this.showToast('图像上传成功');
      }

      this.closeImageUploadModal();
      // 刷新提示词列表，确保新创建的提示词能正确显示
      await this.loadPrompts();
      this.renderImageGrid();
      this.renderImageTagFilters();
    } catch (error) {
      console.error('Failed to upload image:', error);
      this.showToast('上传图像失败: ' + error.message, 'error');
    }
  }

  /**
   * 上传图像到图像库（旧方法，保留用于兼容）
   * 独立上传图像，不与特定 Prompt 关联
   */
  async uploadImageToLibrary() {
    try {
      const filePaths = await window.electronAPI.selectImageFiles();

      if (filePaths && filePaths.length > 0) {
        let uploadedCount = 0;
        let duplicateCount = 0;

        for (const filePath of filePaths) {
          const fileName = filePath.split(/[\\/]/).pop();
          const imageInfo = await window.electronAPI.saveImageFile(filePath, fileName);

          // 检查是否是重复图像
          if (imageInfo.isDuplicate) {
            duplicateCount++;
            if (imageInfo.duplicateMessage) {
              this.showToast(imageInfo.duplicateMessage, 'info');
            }
          } else {
            uploadedCount++;
          }
        }

        if (uploadedCount > 0) {
          this.showToast(`成功上传 ${uploadedCount} 张图像${duplicateCount > 0 ? `，${duplicateCount} 张已存在` : ''}`);
        } else if (duplicateCount > 0) {
          this.showToast(`${duplicateCount} 张图像已存在，直接使用已保存的版本`, 'info');
        }
        this.renderImageGrid();
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      this.showToast('上传图像失败: ' + error.message, 'error');
    }
  }

  /**
   * 显示确认对话框
   * @param {string} title - 对话框标题
   * @param {string} message - 对话框消息
   * @returns {Promise<boolean>} - 用户是否点击确定
   */
  showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      this.confirmResolve = resolve;
      document.getElementById('confirmModalTitle').textContent = title;
      document.getElementById('confirmModalMessage').textContent = message;
      document.getElementById('confirmModal').classList.add('active');
    });
  }

  /**
   * 关闭确认对话框
   */
  closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    if (this.confirmResolve) {
      this.confirmResolve(false);
      this.confirmResolve = null;
    }
  }

  /**
   * 处理确认对话框确定按钮
   */
  handleConfirmOk() {
    document.getElementById('confirmModal').classList.remove('active');
    if (this.confirmResolve) {
      this.confirmResolve(true);
      this.confirmResolve = null;
    }
  }

  /**
   * 显示输入对话框
   * @param {string} title - 对话框标题
   * @param {string} label - 输入标签文本
   * @param {string} defaultValue - 默认值
   * @returns {Promise<string|null>} - 用户输入的内容，取消返回 null
   */
  showInputDialog(title, label, defaultValue = '', options = {}) {
    return new Promise((resolve) => {
      this.inputResolve = resolve;
      this.inputOptions = options;
      document.getElementById('inputModalTitle').textContent = title;
      document.getElementById('inputModalLabel').textContent = label;
      const inputField = document.getElementById('inputModalField');
      inputField.value = defaultValue;

      // 处理标签组选择
      const groupSection = document.getElementById('inputModalGroupSection');
      const groupSelect = document.getElementById('inputModalGroupSelect');
      if (options.showGroupSelect && options.groups) {
        groupSection.style.display = 'block';
        groupSelect.innerHTML = '<option value="">未分组</option>' +
          options.groups.map(g => `<option value="${g.id}">${this.escapeHtml(g.name)}</option>`).join('');
        if (options.defaultGroupId) {
          groupSelect.value = options.defaultGroupId;
        }
      } else {
        groupSection.style.display = 'none';
      }

      document.getElementById('inputModal').classList.add('active');
      inputField.focus();
      inputField.select();
    });
  }

  /**
   * 关闭输入对话框
   */
  closeInputModal() {
    document.getElementById('inputModal').classList.remove('active');
    if (this.inputResolve) {
      this.inputResolve(null);
      this.inputResolve = null;
    }
  }

  /**
   * 处理输入对话框确定按钮
   */
  handleInputOk() {
    const value = document.getElementById('inputModalField').value.trim();
    const groupSelect = document.getElementById('inputModalGroupSelect');
    const groupId = groupSelect.value ? parseInt(groupSelect.value) : null;
    document.getElementById('inputModal').classList.remove('active');
    if (this.inputResolve) {
      if (this.inputOptions && this.inputOptions.showGroupSelect) {
        // 返回对象包含值和组ID
        this.inputResolve(value ? { value, groupId } : null);
      } else {
        // 只返回值
        this.inputResolve(value || null);
      }
      this.inputResolve = null;
    }
  }

  /**
   * 显示选择对话框
   * @param {string} title - 对话框标题
   * @param {string} label - 选择标签文本
   * @param {Array<{value: string, label: string}>} options - 选项列表
   * @param {string} defaultValue - 默认值
   * @returns {Promise<string|null>} - 用户选择的值，取消返回 null
   */
  showSelectDialog(title, label, options, defaultValue = '') {
    return new Promise((resolve) => {
      this.selectResolve = resolve;
      document.getElementById('selectModalTitle').textContent = title;
      document.getElementById('selectModalLabel').textContent = label;
      const selectField = document.getElementById('selectModalField');
      selectField.innerHTML = options.map(opt =>
        `<option value="${this.escapeHtml(opt.value)}" ${opt.value === defaultValue ? 'selected' : ''}>${this.escapeHtml(opt.label)}</option>`
      ).join('');
      document.getElementById('selectModal').classList.add('active');
    });
  }

  /**
   * 关闭选择对话框
   */
  closeSelectModal() {
    document.getElementById('selectModal').classList.remove('active');
    if (this.selectResolve) {
      this.selectResolve(null);
      this.selectResolve = null;
    }
  }

  /**
   * 处理选择对话框确定按钮
   */
  handleSelectOk() {
    const value = document.getElementById('selectModalField').value;
    document.getElementById('selectModal').classList.remove('active');
    if (this.selectResolve) {
      this.selectResolve(value || null);
      this.selectResolve = null;
    }
  }

  /**
   * 显示 Toast 提示消息
   * @param {string} message - 提示消息内容
   * @param {string} type - 消息类型 ('success' | 'error')
   */
  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    if (!toast || !toastMessage) {
      console.error('Toast elements not found');
      return;
    }

    toastMessage.textContent = message;

    // 移除之前的类型类
    toast.classList.remove('error', 'success', 'info');
    // 添加新的类型类
    if (type === 'error') {
      toast.classList.add('error');
    } else if (type === 'success') {
      toast.classList.add('success');
    } else if (type === 'info') {
      toast.classList.add('info');
    }

    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  /**
   * 显示右键菜单
   * @param {MouseEvent} event - 鼠标事件
   * @param {Array<{label: string, action: Function}>} items - 菜单项数组
   */
  showContextMenu(event, items) {
    // 移除已有的右键菜单
    const existingMenu = document.getElementById('dynamicContextMenu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // 创建右键菜单
    const menu = document.createElement('div');
    menu.id = 'dynamicContextMenu';
    menu.className = 'context-menu';

    // 生成菜单项
    menu.innerHTML = items.map((item, index) =>
      `<div class="context-menu-item" data-index="${index}">${this.escapeHtml(item.label)}</div>`
    ).join('');

    // 设置菜单位置
    menu.style.position = 'fixed';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.style.zIndex = '10000';

    document.body.appendChild(menu);

    // 绑定菜单项点击事件
    menu.querySelectorAll('.context-menu-item').forEach((menuItem, index) => {
      menuItem.addEventListener('click', () => {
        items[index].action();
        menu.remove();
      });
    });

    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }

  /**
   * HTML 转义
   * 防止 XSS 攻击
   * @param {string} text - 要转义的文本
   * @returns {string} 转义后的 HTML 字符串
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 转义 HTML 属性值
   * 处理引号、换行等特殊字符，用于 data-* 属性
   */
  escapeAttr(text) {
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
  getNormalTags(tags) {
    return tags ? tags.filter(tag => !PromptManager.ALL_SPECIAL_TAGS.includes(tag)) : [];
  }

  /**
   * 生成标签列表 HTML
   * @param {Array} tags - 标签数组
   * @param {string} tagClass - 标签元素的 CSS 类名
   * @param {string} emptyClass - 空标签状态的 CSS 类名
   * @returns {string} 标签列表 HTML 字符串
   */
  generateTagsHtml(tags, tagClass, emptyClass) {
    // 统一过滤所有特殊标签
    const normalTags = this.getNormalTags(tags);

    if (normalTags.length === 0) {
      return `<span class="${tagClass} ${emptyClass}">无标签</span>`;
    }

    return normalTags.map(tag => {
      return `<span class="${tagClass}">${this.escapeHtml(tag)}</span>`;
    }).join('');
  }

  /**
   * 生成备注 HTML
   * @param {string} note - 备注内容
   * @param {string} noteClass - 备注元素的 CSS 类名
   * @returns {string} 备注 HTML 字符串
   */
  generateNoteHtml(note, noteClass) {
    if (!note) return '';
    return `<div class="${noteClass}" title="${this.escapeAttr(note)}">${this.escapeHtml(note)}</div>`;
  }

  /**
   * 打开统计模态框
   * 获取并显示数据库统计信息
   */
  async openStatisticsModal() {
    const modal = document.getElementById('statisticsModal');

    try {
      const stats = await window.electronAPI.getStatistics();

      // 更新统计数据
      document.getElementById('statPromptsTotal').textContent = stats.prompts.total;
      document.getElementById('statPromptsActive').textContent = stats.prompts.active;
      document.getElementById('statPromptsDeleted').textContent = stats.prompts.deleted;
      document.getElementById('statPromptTagsTotal').textContent = stats.prompts.tags;
      document.getElementById('statImagesTotal').textContent = stats.images.total;
      document.getElementById('statImagesReferenced').textContent = stats.images.referenced;
      document.getElementById('statImagesUnreferenced').textContent = stats.images.unreferenced;
      document.getElementById('statImagesDeleted').textContent = stats.images.deleted;
      document.getElementById('statImageTagsTotal').textContent = stats.images.tags;
      document.getElementById('statPromptsWithImages').textContent = stats.relations.promptsWithImages;
    } catch (error) {
      console.error('Failed to get statistics:', error);
      this.showToast('Failed to load statistics', 'error');
    }

    modal.classList.add('active');
  }

  /**
   * 关闭统计模态框
   */
  closeStatisticsModal() {
    document.getElementById('statisticsModal').classList.remove('active');
  }

  /**
   * 打开图像选择器（用于提示词编辑）
   * 显示图像选择器模态框，允许从图像管理中选择图像
   */
  async openImageSelectorForPrompt() {
    const modal = document.getElementById('imageSelectorModal');
    modal.classList.add('active');

    // 初始化选择状态
    this.selectedImagesForPrompt = [];
    document.getElementById('confirmImageSelectorBtn').disabled = true;

    // 重置搜索和筛选状态
    const searchInput = document.getElementById('imageSelectorSearchInput');
    const tagFilter = document.getElementById('imageSelectorTagFilter');
    if (searchInput) searchInput.value = '';
    if (tagFilter) tagFilter.value = '';

    // 加载图像列表
    await this.renderImageSelectorGrid();
    await this.renderImageSelectorTagFilters();

    // 绑定事件
    this.bindImageSelectorEvents();
  }

  /**
   * 关闭图像选择器
   */
  closeImageSelectorModal() {
    document.getElementById('imageSelectorModal').classList.remove('active');
    this.selectedImagesForPrompt = [];
  }

  /**
   * 渲染图像选择器网格
   */
  async renderImageSelectorGrid() {
    const grid = document.getElementById('imageSelectorGrid');
    const emptyState = document.getElementById('imageSelectorEmpty');
    const searchInput = document.getElementById('imageSelectorSearchInput');
    const tagFilter = document.getElementById('imageSelectorTagFilter');

    try {
      // 获取所有图像（使用选择图像界面独立的排序设置）
      let images = await window.electronAPI.getImages(this.imageSelectorSortBy, this.imageSelectorSortOrder);

      // 根据 viewMode 过滤（safe 模式只显示安全内容）
      if (this.viewMode === 'safe') {
        images = images.filter(img => img.is_safe !== 0);
      }

      // 应用搜索过滤
      const searchTerm = searchInput?.value?.trim().toLowerCase();
      if (searchTerm) {
        images = images.filter(img =>
          img.fileName?.toLowerCase().includes(searchTerm) ||
          img.note?.toLowerCase().includes(searchTerm)
        );
      }

      // 应用标签过滤
      const selectedTag = tagFilter?.value;
      if (selectedTag) {
        images = images.filter(img =>
          img.tags?.includes(selectedTag)
        );
      }

      if (images.length === 0) {
        grid.innerHTML = '';
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
      }

      grid.style.display = 'grid';
      emptyState.style.display = 'none';

      // 获取所有图像的完整路径
      const imageItems = await Promise.all(images.map(async (image) => {
        const imagePath = image.thumbnailPath || image.relativePath;
        const fullPath = imagePath ? await window.electronAPI.getImagePath(imagePath) : '';
        return { ...image, fullPath };
      }));

      grid.innerHTML = imageItems.map(image => `
        <div class="image-selector-item" data-image-id="${image.id}" data-image-path="${this.escapeHtml(image.relativePath || image.path)}">
          <img src="file://${this.escapeHtml(image.fullPath)}" alt="${this.escapeHtml(image.name || image.fileName)}" loading="lazy">
        </div>
      `).join('');

      // 绑定点击事件
      grid.querySelectorAll('.image-selector-item').forEach(item => {
        item.addEventListener('click', () => {
          // 单选模式
          grid.querySelectorAll('.image-selector-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');

          const imageId = item.dataset.imageId;
          const imagePath = item.dataset.imagePath;
          this.selectedImagesForPrompt = [{ id: imageId, path: imagePath }];
          document.getElementById('confirmImageSelectorBtn').disabled = false;
        });
      });
    } catch (error) {
      console.error('Failed to render image selector:', error);
      grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">加载失败</p>';
    }
  }

  /**
   * 渲染图像选择器标签筛选器
   */
  async renderImageSelectorTagFilters() {
    const tagFilter = document.getElementById('imageSelectorTagFilter');
    if (!tagFilter) return;

    try {
      const tags = await window.electronAPI.getImageTags();
      tagFilter.innerHTML = '<option value="">所有标签</option>' +
        tags.map(tag => `<option value="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</option>`).join('');
    } catch (error) {
      console.error('Failed to render image selector tag filters:', error);
    }
  }

  /**
   * 绑定图像选择器事件
   */
  bindImageSelectorEvents() {
    // 关闭按钮
    document.getElementById('closeImageSelectorModal').addEventListener('click', () => this.closeImageSelectorModal());
    document.getElementById('cancelImageSelectorBtn').addEventListener('click', () => this.closeImageSelectorModal());

    // 搜索输入
    const searchInput = document.getElementById('imageSelectorSearchInput');
    const clearImageSelectorSearchBtn = document.getElementById('clearImageSelectorSearchBtn');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.renderImageSelectorGrid();
        // 显示/隐藏清空按钮
        if (clearImageSelectorSearchBtn) {
          clearImageSelectorSearchBtn.style.display = searchInput.value ? 'flex' : 'none';
        }
      });
    }
    // 清空选择图像搜索按钮
    if (clearImageSelectorSearchBtn) {
      clearImageSelectorSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.renderImageSelectorGrid();
        clearImageSelectorSearchBtn.style.display = 'none';
        searchInput.focus();
      });
    }

    // 标签筛选
    const tagFilter = document.getElementById('imageSelectorTagFilter');
    if (tagFilter) {
      tagFilter.addEventListener('change', () => {
        this.renderImageSelectorGrid();
      });
    }

    // 排序选择（使用独立的状态）
    const sortSelect = document.getElementById('imageSelectorSortSelect');
    if (sortSelect) {
      sortSelect.value = `${this.imageSelectorSortBy}-${this.imageSelectorSortOrder}`;
      sortSelect.addEventListener('change', (e) => {
        const [sortBy, sortOrder] = e.target.value.split('-');
        this.imageSelectorSortBy = sortBy;
        this.imageSelectorSortOrder = sortOrder;
        this.renderImageSelectorGrid();
      });
    }

    // 排序逆序按钮（使用独立的状态）
    const sortReverseBtn = document.getElementById('imageSelectorSortReverseBtn');
    if (sortReverseBtn) {
      sortReverseBtn.addEventListener('click', () => {
        this.imageSelectorSortOrder = this.imageSelectorSortOrder === 'asc' ? 'desc' : 'asc';
        if (sortSelect) {
          sortSelect.value = `${this.imageSelectorSortBy}-${this.imageSelectorSortOrder}`;
        }
        this.renderImageSelectorGrid();
      });
    }

    // 确认选择
    document.getElementById('confirmImageSelectorBtn').addEventListener('click', () => {
      this.confirmImageSelectionForPrompt();
    });

    // 点击外部关闭
    document.getElementById('imageSelectorModal').addEventListener('click', (e) => {
      if (e.target.id === 'imageSelectorModal') this.closeImageSelectorModal();
    });
  }

  /**
   * 确认图像选择（用于提示词编辑）
   */
  async confirmImageSelectionForPrompt() {
    if (!this.selectedImagesForPrompt || this.selectedImagesForPrompt.length === 0) return;

    const selectedImage = this.selectedImagesForPrompt[0];

    // 添加到当前提示词的图像列表
    if (!this.currentImages) {
      this.currentImages = [];
    }

    // 检查是否已存在
    if (!this.currentImages.some(img => img.id === selectedImage.id)) {
      this.currentImages.push({
        id: selectedImage.id,
        path: selectedImage.path,
        isExisting: true // 标记为已存在的图像
      });
      this.renderImagePreviews();
      this.showToast('图像已添加');

      // 立即保存到数据库
      const promptId = document.getElementById('promptId').value;
      if (promptId) {
        await this.savePromptField('images', this.currentImages);
      }
    } else {
      this.showToast('该图像已存在', 'info');
    }

    this.closeImageSelectorModal();
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new PromptManager();
});
