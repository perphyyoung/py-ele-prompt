/**
 * 提示词详情管理器
 * 负责管理提示词详情模态框
 */
import { DetailViewManager } from './DetailViewManager.js';
import { SaveManager, PromptSaveStrategy, validateTitle, HtmlUtils } from '../utils/index.js';
import { isSameId } from '../utils/isSameId.js';
import { Constants } from '../constants.js';
import { cacheManager } from '../utils/CacheManager.js';
import { DirectSaveStrategy } from '../services/UploadStrategies.js';
import { SimpleTagManager } from './SimpleTagManager.js';
import { EditableTagList } from '../components/EditableTagList.js';

export class PromptDetailManager extends DetailViewManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options) {
    super({
      app: options.app,
      modalId: 'promptDetailModal',
      closeBtnId: 'promptDetailCloseBtn'
    });

    this.tagManager = options.tagManager;

    // 图像上传策略（直接保存，适合频繁操作）
    this.uploadStrategy = new DirectSaveStrategy(this.app);
  }

  /**
   * 打开提示词详情模态框
   * @param {Object} prompt - 提示词对象
   * @param {Object} options - 选项
   * @param {Array} options.filteredList - 过滤后的提示词列表（用于导航）
   */
  async open(prompt, options = {}) {
    const modal = document.getElementById(this.modalId);
    if (!modal) {
      window.electronAPI.logError('PromptDetailManager.js', 'Prompt detail modal not found');
      return;
    }

    this.returnToManager = options.returnToManager;
    this.returnToItem = options.returnToItem;
    this.app.isFromDetailJump = !!options.returnToManager;

    try {
      this.currentItem = prompt;

      this.fillFormData(prompt);

      this.setSafeState(prompt.isSafe !== 0);

      this.updateFavoriteBtnUI(prompt.isFavorite);

      await this.loadImages(prompt);

      this.initTagManager(prompt);

      this.initSaveManager(prompt);

      await this.initNavigatorForPrompt(prompt, options);

      this.showModal();

      this.bindImageUploadEvents();

      this.autoResizeAllTextareas();
    } catch (error) {
      window.electronAPI.logError('PromptDetailManager.js', 'Failed to open prompt detail modal:', error);
      this.app.showToast('打开编辑界面失败', 'error');
    }
  }

  /**
   * 填充表单数据
   * @param {Object} prompt - 提示词对象
   * @private
   */
  fillFormData(prompt) {
    document.getElementById('promptDetailId').value = prompt.id || '';
    document.getElementById('promptDetailTitle').value = prompt.title || '';
    document.getElementById('promptDetailContent').value = prompt.content || '';
    document.getElementById('promptDetailTranslate').value = prompt.contentTranslate || '';
    document.getElementById('promptDetailNote').value = prompt.note || '';
  }

  /**
   * 设置安全状态
   * @param {boolean} isSafe - 是否安全
   * @private
   */
  setSafeState(isSafe) {
    const safeToggle = document.getElementById('promptDetailSafeToggle');
    if (safeToggle) {
      safeToggle.checked = isSafe;
    }
  }

  /**
   * 更新收藏按钮 UI
   * @param {boolean} isFavorite - 是否收藏
   */
  updateFavoriteBtnUI(isFavorite) {
    const btn = document.getElementById('promptDetailFavoriteBtn');
    if (!btn) return;

    if (isFavorite) {
      btn.classList.add('active');
      btn.title = '取消收藏';
      btn.innerHTML = Constants.ICONS.favorite.filled;
    } else {
      btn.classList.remove('active');
      btn.title = '收藏';
      btn.innerHTML = Constants.ICONS.favorite.outline;
    }
  }

  /**
   * 加载图像
   * @param {Object} prompt - 提示词对象
   * @private
   */
  async loadImages(prompt) {
    // 清空 currentImages 缓存
    this.app.currentImagesCache.clear();
    if (prompt.images && Array.isArray(prompt.images)) {
      prompt.images.forEach(img => {
        if (img && img.id) {
          this.app.currentImagesCache.set(String(img.id), img);
        }
      });
    }

    // 调用 app 的方法渲染图像预览
    if (this.app.renderImagePreviews) {
      await this.app.renderImagePreviews();
    }
  }

  /**
   * 初始化标签管理器
   * @param {Object} prompt - 提示词对象
   * @private
   */
  initTagManager(prompt) {
    // 清理旧的标签管理器
    if (this.simpleTagManager) {
      this.simpleTagManager = null;
    }

    // 清理旧的可编辑标签列表组件
    if (this.editableTagList) {
      this.editableTagList = null;
    }

    // 创建新的标签管理器
    this.simpleTagManager = new SimpleTagManager({
      onSave: async (tags, options = {}) => {
        try {
          await window.electronAPI.updatePrompt(prompt.id, { tags });
          // 更新本地数据
          prompt.tags = tags;

          // 显示保存成功提示
          if (options.action === 'add') {
            this.app.showToast('标签添加成功', 'success');
            // 违单提示
            if (options.hasViolation && options.violationGroup) {
              this.app.showToast(`警告：违反单选组限制 (${options.violationGroup})`, 'warning');
            }
          } else if (options.action === 'remove') {
            this.app.showToast('标签删除成功', 'success');
          }

          // 刷新主界面
          if (this.app.promptPanelManager) {
            await this.app.promptPanelManager.refreshAfterUpdate();
          }
        } catch (error) {
          window.electronAPI.logError('PromptDetailManager.js', 'Failed to save prompt tags:', error);
          throw error;
        }
      },
      onRender: (tags) => {
        // 使用 EditableTagList 组件渲染
        if (!this.editableTagList) {
          this.editableTagList = new EditableTagList({
            containerId: 'promptDetailTags',
            tagManager: this.simpleTagManager,
            onRemove: async (tagName) => {
              await this.simpleTagManager.removeTag(tagName);
            }
          });
        }
        this.editableTagList.renderWithInit();
      },
      getTagsWithGroup: async () => {
        // 获取提示词标签及其组信息
        const allTags = await window.electronAPI.getPromptTagsWithGroup();
        if (!allTags || allTags.length === 0) return [];

        // 按组组织标签
        const groupsMap = new Map();
        allTags.forEach(tag => {
          const groupId = tag.groupId || 'ungrouped';
          if (!groupsMap.has(groupId)) {
            groupsMap.set(groupId, {
              id: groupId,
              name: tag.groupName || '未分组',
              type: tag.groupType || 'multi',
              tags: []
            });
          }
          groupsMap.get(groupId).tags.push(tag.name);
        });

        return Array.from(groupsMap.values());
      },
      saveDelay: 800
    });

    // 设置初始标签
    this.simpleTagManager.setTags(prompt.tags);

    // 绑定标签输入事件
    this.bindTagInputEvents();
  }

  /**
   * 绑定标签输入事件
   * @private
   */
  bindTagInputEvents() {
    const input = document.getElementById('promptDetailTagsInput');
    if (!input) return;

    // 移除旧的事件监听器（如果存在）
    if (this.tagInputHandler) {
      input.removeEventListener('keydown', this.tagInputHandler);
    }

    // 创建新的事件处理函数
    this.tagInputHandler = async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        let tagName = input.value.trim();
        // 去除开头和结尾的逗号
        tagName = tagName.replace(/^[，,]+|[，,]+$/g, '');
        if (tagName) {
          try {
            // 支持批量添加（逗号或空格分隔）
            const tagNames = tagName.split(/[,，\s]+/).filter(t => t.trim());
            if (tagNames.length > 1) {
              await this.simpleTagManager.addTags(tagNames);
            } else {
              await this.simpleTagManager.addTag(tagName);
            }
            input.value = '';
          } catch (error) {
            window.electronAPI.logError('PromptDetailManager.js', 'Failed to add tag:', error);
            this.app.showToast(error.message, 'error');
          }
        }
      }
    };

    input.addEventListener('keydown', this.tagInputHandler);
  }

  /**
   * 初始化保存管理器
   * @param {Object} prompt - 提示词对象
   * @private
   */
  initSaveManager(prompt) {
    // 清理旧的
    if (this.saveManager) {
      this.saveManager.destroy();
    }

    // 清理收藏按钮事件监听器
    if (this.favoriteBtnHandler) {
      const favoriteBtn = document.getElementById('promptDetailFavoriteBtn');
      if (favoriteBtn) {
        favoriteBtn.removeEventListener('click', this.favoriteBtnHandler);
      }
      this.favoriteBtnHandler = null;
    }

    // 创建保存策略
    const strategy = new PromptSaveStrategy(this.app);

    // 创建保存管理器
    this.saveManager = new SaveManager({
      strategy,
      itemId: prompt.id,
      onAfterSave: async () => {
        if (this.app.promptPanelManager) {
          await this.app.promptPanelManager.refreshAfterUpdate();
        }
        if (this.app.imagePanelManager) {
          await this.app.imagePanelManager.refreshAfterUpdate();
        }
        this.app.eventBus?.emit('promptsChanged');
        this.app.eventBus?.emit('imagesChanged');
      }
    });

    // 注册所有字段
    this.registerFields(prompt);
  }

  /**
   * 注册所有字段到 SaveManager
   * @param {Object} prompt - 提示词对象
   * @private
   */
  registerFields(prompt) {
    // 1. 标题 - 防抖保存
    this.saveManager.registerField('title', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'promptDetailTitle',
      statusId: 'promptDetailTitleStatus',
      validate: (value) => validateTitle(value)
    });

    // 2. 内容 - 防抖保存
    this.saveManager.registerField('content', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'promptDetailContent',
      autoResize: true,
      statusId: 'promptDetailContentStatus'
    });

    // 3. 翻译 - 防抖保存
    this.saveManager.registerField('contentTranslate', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'promptDetailTranslate',
      autoResize: true,
      statusId: 'promptDetailTranslateStatus'
    });

    // 4. 备注 - 防抖保存
    this.saveManager.registerField('note', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'promptDetailNote',
      autoResize: true,
      statusId: 'promptDetailNoteStatus'
    });

    // 5. 安全状态 - 防抖保存
    this.saveManager.registerField('isSafe', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'promptDetailSafeToggle',
      getValue: (element) => element.checked ? 1 : 0,
      onChange: (value) => {
        this.app.showToast(value ? '已标记为安全' : '已标记为不安全', 'success');
      }
    });

    // 6. 收藏 - 防抖保存（通过按钮点击触发）
    this.saveManager.registerField('isFavorite', {
      saveMode: 'debounce',
      delay: 800,
      onChange: (value) => {
        this.updateFavoriteBtnUI(value);
        this.app.showToast(value ? '已收藏' : '已取消收藏', 'success');
      }
    });

    // 手动绑定收藏按钮点击事件
    const favoriteBtn = document.getElementById('promptDetailFavoriteBtn');
    if (favoriteBtn) {
      this.favoriteBtnHandler = async () => {
        const newState = !this.currentItem?.isFavorite;
        await this.saveManager.triggerSave('isFavorite', newState, this.currentItem?.id);
      };
      favoriteBtn.addEventListener('click', this.favoriteBtnHandler);
    }
  }

  /**
   * 初始化提示词导航器
   * @param {Object} prompt - 提示词对象
   * @param {Object} options - 选项
   * @private
   */
  async initNavigatorForPrompt(prompt, options = {}) {
    // 如果导航器已存在，先销毁旧的事件监听器
    if (this.navigator) {
      this.navigator.destroy();
    }

    // 记录当前提示词列表的快照
    const items = options.filteredList && options.filteredList.length > 0
      ? [...options.filteredList]
      : Array.from(this.app.promptCache.values());

    const onNavigate = async (targetPrompt) => {
      // 使用 targetPrompt，因为它来自快照，已经包含所需的图像信息
      // 但需要确保图像数据是最新的，从缓存中同步
      const latestPrompt = cacheManager.getCachedPrompt(targetPrompt.id);

      // 如果找到了最新的 prompt，使用它的 images 字段
      const nextPrompt = latestPrompt ? { ...targetPrompt, images: latestPrompt.images } : targetPrompt;

      // 强制重置 currentImages 缓存，确保导航时不会残留旧数据
      this.app.currentImagesCache.clear();

      await this.updateView(nextPrompt);
    };

    this.initNavigator(prompt, items, {
      first: document.getElementById('promptDetailFirstNavBtn'),
      prev: document.getElementById('promptDetailPrevNavBtn'),
      next: document.getElementById('promptDetailNextNavBtn'),
      last: document.getElementById('promptDetailLastNavBtn')
    }, onNavigate);
  }

  /**
   * 获取导航按钮前缀
   * @returns {string} 前缀
   */
  getNavButtonPrefix() {
    return 'promptDetail';
  }

  /**
   * 更新视图
   * @param {Object} prompt - 提示词对象
   */
  async updateView(prompt) {
    // 更新当前提示词
    this.currentItem = prompt;

    // 填充表单数据
    this.fillFormData(prompt);

    // 设置安全状态
    this.setSafeState(prompt.isSafe !== 0);

    // 更新收藏按钮
    this.updateFavoriteBtnUI(prompt.isFavorite);

    // 重新加载图像
    await this.loadImages(prompt);

    // 重新初始化标签管理器
    this.initTagManager(prompt);

    // 重新初始化保存管理器
    this.initSaveManager(prompt);

    // 自动调整文本框高度
    this.autoResizeAllTextareas();
  }

  /**
   * 自动调整所有文本框高度
   * @private
   */
  autoResizeAllTextareas() {
    ['promptDetailContent', 'promptDetailTranslate', 'promptDetailNote'].forEach(id => {
      const textarea = document.getElementById(id);
      if (textarea) {
        this.app.autoResizeTextarea(textarea);
      }
    });
  }

  /**
   * 绑定图像上传事件
   * @private
   */
  bindImageUploadEvents() {
    // 点击上传区域选择多图
    const uploadArea = document.getElementById('imageUploadArea');
    if (uploadArea) {
      uploadArea.addEventListener('click', async (e) => {
        if (e.target.closest('.remove-image')) return;
        await this.handleSelectImages();
      });

      // 禁止拖拽上传
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'none';
      });
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
      });
    }

    document.getElementById('promptDetailSelectFromImageManagerBtn')?.addEventListener('click', () => {
      this.openImageSelectorForPrompt();
    });
  }

  /**
   * 处理选择多图并立即保存
   * @private
   */
  async handleSelectImages() {
    const filePaths = await window.electronAPI.openImageFiles();

    const result = await this.uploadStrategy.selectFiles(filePaths, 'prompt-detail');
    if (!result.success) {
      if (result.message) {
        this.app.showToast(result.message, 'error');
      }
      return;
    }

    // 更新缓存并保存
    for (const image of result.images) {
      this.app.currentImagesCache.set(String(image.id), {
        id: image.id,
        fileName: image.fileName
      });
    }

    // 更新全局图像缓存，确保 renderImagePreviews 能获取完整信息
    cacheManager.cacheImages(result.images);

    const promptId = document.getElementById('promptDetailId').value;
    if (promptId) {
      const updatedImages = Array.from(this.app.currentImagesCache.values());
      await this.savePromptField('images', updatedImages);
    }

    if (this.app.renderImagePreviews) {
      await this.app.renderImagePreviews();
    }
  }

  /**
   * 处理删除图像
   * @param {number} index - 图像索引
   * @private
   */
  async handleRemoveImage(index) {
    const result = await this.uploadStrategy.removeFile(index);
    if (result.success) {
      // 更新缓存
      this.app.currentImagesCache.clear();
      result.images.forEach(img => {
        this.app.currentImagesCache.set(String(img.id), img);
      });

      // 保存到数据库
      const promptId = document.getElementById('promptDetailId').value;
      if (promptId) {
        const updatedImages = Array.from(this.app.currentImagesCache.values());
        await this.savePromptField('images', updatedImages);
      }

      // 重新渲染
      if (this.app.renderImagePreviews) {
        await this.app.renderImagePreviews();
      }
    }
  }

  /**
   * 处理设为首张
   * @param {number} index - 图像索引
   * @private
   */
  async handleSetFirst(index) {
    const result = this.uploadStrategy.setFirst(index);
    if (result.success) {
      // 更新缓存
      this.app.currentImagesCache.clear();
      result.images.forEach(img => {
        this.app.currentImagesCache.set(String(img.id), img);
      });

      // 保存到数据库
      const promptId = document.getElementById('promptDetailId').value;
      if (promptId) {
        const updatedImages = Array.from(this.app.currentImagesCache.values());
        await this.savePromptField('images', updatedImages);
      }

      // 重新渲染
      if (this.app.renderImagePreviews) {
        await this.app.renderImagePreviews();
      }
    }
  }

  /**
   * 保存提示词字段
   * @param {string} field - 字段名
   * @param {*} value - 字段值
   * @private
   */
  async savePromptField(field, value) {
    const promptId = document.getElementById('promptDetailId').value;
    if (!promptId) return;

    try {
      const updates = { [field]: value };
      await window.electronAPI.updatePrompt(promptId, updates);

      this.app.eventBus?.emit('imagesChanged');
      this.app.eventBus?.emit('promptsChanged');
    } catch (error) {
      window.electronAPI.logError('PromptDetailManager', `Failed to save prompt field: ${error.message}`, error);
    }
  }

  /**
   * 打开图像选择器
   * @private
   */
  async openImageSelectorForPrompt() {
    if (this.app.imageSelectorManager) {
      this.app.imageSelectorManager.open({
        onConfirm: (selectedImage) => {
          if (selectedImage && selectedImage.id) {
            if (!this.app.currentImagesCache.has(String(selectedImage.id))) {
              this.app.currentImagesCache.set(String(selectedImage.id), selectedImage);
            }

            this.app.renderImagePreviews?.();

            const promptId = document.getElementById('promptDetailId').value;
            if (promptId) {
              const updatedImages = Array.from(this.app.currentImagesCache.values());
              this.savePromptField('images', updatedImages);
            }
          }
        }
      });
    }
  }

  async close() {
    const returnToManager = this.returnToManager;
    const returnToItem = this.returnToItem;

    this.app.isFromDetailJump = false;

    // 清理图像缓存
    this.app.currentImagesCache.clear();

    await super.close();

    if (returnToManager && returnToItem) {
      await returnToManager.open(returnToItem);
    }
  }

}
