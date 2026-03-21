/**
 * 提示词详情管理器
 * 负责管理提示词详情模态框
 */
import { DetailViewManager } from './DetailViewManager.js';
import { SaveManager, PromptSaveStrategy, validateTitle, HtmlUtils } from '../utils/index.js';
import { isSameId } from '../utils/isSameId.js';
import { Constants } from '../constants.js';
import { cacheManager } from '../utils/CacheManager.js';
import { ImageUploadHandler } from '../services/ImageUploadHandler.js';

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

      await this.renderTags(prompt);

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
   * 渲染标签
   * @param {Object} prompt - 提示词对象
   * @private
   */
  async renderTags(prompt) {
    const container = document.getElementById('promptDetailTags');
    if (!container) return;

    if (prompt.tags && prompt.tags.length > 0) {
      container.innerHTML = prompt.tags.map(tag =>
        `<span class="tag-editable">${HtmlUtils.escapeHtml(tag)}</span>`
      ).join('');
    } else {
      container.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
    }
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

    // 重新渲染标签
    await this.renderTags(prompt);

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
      this.autoResizeTextarea(document.getElementById(id));
    });
  }

  /**
   * 绑定图像上传事件
   * 支持点击上传和拖拽上传
   * @private
   */
  bindImageUploadEvents() {
    if (this.imageUploadHandler) return;

    this.imageUploadHandler = new ImageUploadHandler('imageUploadArea', 'imageInput', {
      onFilesSelected: (files) => this.handleImageFiles(files)
    });
    this.imageUploadHandler.bind();

    document.getElementById('promptDetailSelectFromImageManagerBtn')?.addEventListener('click', () => {
      this.openImageSelectorForPrompt();
    });
  }

  /**
   * 处理图像文件上传
   * @param {FileList} fileList - 要处理的图像文件列表
   * @private
   */
  async handleImageFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue;

      try {
        let filePath = file.path;

        if (!filePath) {
          const arrayBuffer = await file.arrayBuffer();
          filePath = await this.saveTempFile(arrayBuffer, file.name);
        }

        const imageInfo = await window.electronAPI.saveImageFile(filePath, file.name);

        if (imageInfo.isDuplicate && imageInfo.duplicateMessage) {
          this.app.showToast(imageInfo.duplicateMessage, 'info');
        }

        this.app.currentImagesCache.set(String(imageInfo.id), {
          id: imageInfo.id,
          fileName: imageInfo.fileName
        });

        const promptId = document.getElementById('promptDetailId').value;
        if (promptId) {
          const updatedImages = Array.from(this.app.currentImagesCache.values());
          await this.savePromptField('images', updatedImages);
        }
      } catch (error) {
        window.electronAPI.logError('PromptDetailManager', `Failed to save image: ${error.message}`, error);
        this.app.showToast('保存图像失败: ' + error.message, 'error');
      }
    }

    if (this.app.renderImagePreviews) {
      await this.app.renderImagePreviews();
    }
  }

  /**
   * 保存临时文件
   * @param {ArrayBuffer} arrayBuffer - 文件内容
   * @param {string} fileName - 文件名
   * @returns {Promise<string>} - 临时文件路径
   * @private
   */
  async saveTempFile(arrayBuffer, fileName) {
    const tempPath = await window.electronAPI.saveTempFile(fileName, arrayBuffer);
    return tempPath;
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

    await super.close();

    if (returnToManager && returnToItem) {
      await returnToManager.open(returnToItem);
    }
  }

}
