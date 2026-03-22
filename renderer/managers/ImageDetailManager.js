/**
 * 图像详情管理器
 * 负责管理图像详情模态框
 */
import { DetailViewManager } from './DetailViewManager.js';
import { SaveManager, HtmlUtils, ImageSaveStrategy, validateFileName } from '../utils/index.js';
import { SimpleTagManager } from '../managers/SimpleTagManager.js';
import { EditableTagList } from '../components/EditableTagList.js';
import { isSameId } from '../utils/isSameId.js';
import { Constants } from '../constants.js';
import { cacheManager } from '../utils/CacheManager.js';
import { DialogService, DialogConfig } from '../services/DialogService.js';

export class ImageDetailManager extends DetailViewManager {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 应用实例
   */
  constructor(options) {
    super({
      app: options.app,
      modalId: 'imageDetailModal',
      closeBtnId: 'imageDetailCloseBtn'
    });

    this.tagManager = options.tagManager;
  }

  /**
   * 打开图像详情模态框
   * @param {Object} image - 图像对象
   * @param {Object} options - 选项
   * @param {Array} options.filteredList - 过滤后的图像列表（用于导航）
   */
  async open(image, options = {}) {
    const modal = document.getElementById(this.modalId);
    if (!modal) {
      window.electronAPI.logError('ImageDetailManager.js', 'Image detail modal not found');
      return;
    }

    this.returnToManager = options.returnToManager;
    this.returnToItem = options.returnToItem;
    this.app.isFromDetailJump = !!options.returnToManager || this.app.isFromDetailJump;

    try {
      // 保存当前编辑的图像
      this.currentItem = image;

      // 填充基本数据
      this.fillFormData(image);

      // 设置安全状态
      this.setSafeState(image.isSafe !== 0);

      // 更新收藏按钮
      this.updateFavoriteBtnUI(image.isFavorite);

      // 渲染图像信息
      await this.renderImageInfo(image);

      // 初始化标签管理器
      this.initTagManager(image);

      // 渲染关联提示词信息
      await this.renderPromptInfo(image);

      // 初始化保存管理器
      this.initSaveManager(image);

      // 初始化导航器
      await this.initNavigatorForImage(image, options);

      // 显示模态框
      this.showModal();

      // 自动调整文本框高度
      const noteInput = document.getElementById('imageDetailNote');
      if (noteInput) {
        this.app.autoResizeTextarea(noteInput);
      }
    } catch (error) {
      window.electronAPI.logError('ImageDetailManager.js', 'Failed to open image detail modal:', error);
      this.app.showToast('打开图像详情失败', 'error');
    }
  }

  /**
   * 填充表单数据
   * @param {Object} image - 图像对象
   * @private
   */
  fillFormData(image) {
    const fileNameInput = document.getElementById('imageDetailFileName');
    if (fileNameInput) {
      fileNameInput.value = image.fileName || '';
    }

    const noteInput = document.getElementById('imageDetailNote');
    if (noteInput) {
      noteInput.value = image.note || '';
    }
  }

  /**
   * 设置安全状态
   * @param {boolean} isSafe - 是否安全
   * @private
   */
  setSafeState(isSafe) {
    const safeToggle = document.getElementById('imageDetailSafeToggle');
    if (safeToggle) {
      safeToggle.checked = isSafe;
    }
  }

  /**
   * 更新收藏按钮 UI
   * @param {boolean} isFavorite - 是否收藏
   */
  updateFavoriteBtnUI(isFavorite) {
    const btn = document.getElementById('imageDetailFavoriteBtn');
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
   * 渲染图像信息
   * @param {Object} image - 图像对象
   * @private
   */
  async renderImageInfo(image) {
    // 更新时间
    const updatedAtEl = document.getElementById('imageDetailUpdatedAt');
    if (updatedAtEl) {
      updatedAtEl.textContent = image.updatedAt || '-';
    }

    // 上传时间
    const createdAtEl = document.getElementById('imageDetailCreatedAt');
    if (createdAtEl) {
      createdAtEl.textContent = image.createdAt || '-';
    }

    // 图像尺寸
    const dimensionsEl = document.getElementById('imageDetailDimensions');
    if (dimensionsEl) {
      dimensionsEl.textContent = image.width && image.height ? `${image.width} × ${image.height}` : '-';
    }

    // 文件大小
    const fileSizeEl = document.getElementById('imageDetailFileSize');
    if (fileSizeEl) {
      fileSizeEl.textContent = image.fileSize ? HtmlUtils.formatFileSize(image.fileSize) : '-';
    }

    // 设置图像 - 异步获取完整路径
    const imgEl = document.getElementById('imageDetailImg');
    if (imgEl && image.relativePath) {
      try {
        const fullPath = await window.electronAPI.getImagePath(image.relativePath);
        imgEl.src = `file://${fullPath.replace(/"/g, '&quot;')}`;
        imgEl.alt = image.fileName || '图像';

        // 绑定双击打开全屏查看器
        if (this.app.imageFullscreenManager) {
          imgEl.ondblclick = () => {
            if (this.itemsSnapshot && this.itemsSnapshot.length > 0) {
              const currentIndex = this.itemsSnapshot.findIndex(i => isSameId(i.id, image.id));
              this.app.imageFullscreenManager.open(this.itemsSnapshot, currentIndex >= 0 ? currentIndex : 0);
            } else {
              this.app.imageFullscreenManager.open([image], 0);
            }
          };
        }
      } catch (error) {
        window.electronAPI.logError('ImageDetailManager.js', 'Failed to load image:', error);
        imgEl.alt = '加载图像失败';
      }
    }
  }

  /**
   * 初始化标签管理器
   * @param {Object} image - 图像对象
   * @private
   */
  initTagManager(image) {
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
          await window.electronAPI.updateImage(image.id, { tags });
          // 更新本地数据
          image.tags = tags;

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
          if (this.app.imagePanelManager) {
            await this.app.imagePanelManager.refreshAfterUpdate();
          }
        } catch (error) {
          window.electronAPI.logError('ImageDetailManager.js', 'Failed to save image tags:', error);
          throw error;
        }
      },
      onRender: (tags) => {
        // 使用 EditableTagList 组件渲染
        if (!this.editableTagList) {
          this.editableTagList = new EditableTagList({
            containerId: 'imageDetailImageTags',
            tagManager: this.simpleTagManager,
            onRemove: async (tagName) => {
              await this.simpleTagManager.removeTag(tagName);
            }
          });
        }
        this.editableTagList.renderWithInit();
      },
      getTagsWithGroup: async () => {
        // 获取图像标签及其组信息，转换为 SimpleTagManager 期望的格式
        const allTags = await window.electronAPI.getImageTagsWithGroup();
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
    this.simpleTagManager.setTags(image.tags);

    // 绑定标签输入事件
    this.bindTagInputEvents();
  }

  /**
   * 绑定标签输入事件
   * @private
   */
  bindTagInputEvents() {
    const input = document.getElementById('imageDetailTagInput');
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
            window.electronAPI.logError('ImageDetailManager.js', 'Failed to add tag:', error);
            this.app.showToast(error.message, 'error');
          }
        }
      }
    };

    input.addEventListener('keydown', this.tagInputHandler);
  }

  /**
   * 渲染关联提示词信息
   * @param {Object} image - 图像对象
   * @private
   */
  async renderPromptInfo(image) {
    const promptTitleContainer = document.getElementById('imageDetailPromptTitle');
    const promptContentEl = document.getElementById('imageDetailPromptContent');
    const promptTranslateEl = document.getElementById('imageDetailPromptTranslate');
    const promptNoteEl = document.getElementById('imageDetailPromptNote');
    const tagsContainer = document.getElementById('imageDetailTags');
    const editPromptBtn = document.getElementById('editPromptFromImageBtn');
    const editPromptBtnText = document.getElementById('editPromptBtnText');

    // 收集所有引用的提示词信息
    let allPromptRefs = [];

    if (image.promptRefs && image.promptRefs.length > 0) {
      allPromptRefs = image.promptRefs.map(ref => {
        // 优先从缓存查找
        const cachedPrompt = cacheManager.getCachedPrompt(ref.promptId);
        if (cachedPrompt) {
          return cachedPrompt;
        }
        // 如果缓存中没有，使用数据库返回的数据并添加到缓存
        if (ref.promptContent) {
          const prompt = {
            id: ref.promptId,
            title: ref.promptTitle,
            content: ref.promptContent,
            contentTranslate: ref.promptContentTranslate,
            note: ref.promptNote,
            tags: []
          };
          cacheManager.cachePrompt(prompt);
          return prompt;
        }
        return null;
      }).filter(p => p !== null);
    }

    if (allPromptRefs.length > 0) {
      // 多引用情况：显示所有提示词标题列表
      if (allPromptRefs.length > 1) {
        promptTitleContainer.innerHTML = allPromptRefs.map((p, index) =>
          `<div class="prompt-ref-item" data-prompt-id="${p.id}">
            <span class="prompt-ref-number">${index + 1}.</span>
            <span class="prompt-ref-title">${HtmlUtils.escapeHtml(p.title || '未命名')}</span>
            <span class="prompt-ref-unlink" title="解除关联">×</span>
          </div>`
        ).join('');

        // 绑定点击事件 - 点击标题切换显示
        promptTitleContainer.querySelectorAll('.prompt-ref-item').forEach(item => {
          const titleEl = item.querySelector('.prompt-ref-title');
          if (titleEl) {
            titleEl.addEventListener('click', () => {
              const promptId = item.dataset.promptId;
              const selectedPrompt = allPromptRefs.find(p => isSameId(p.id, promptId));
              if (selectedPrompt) {
                this.showPromptDetail(selectedPrompt);
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
            const promptRef = allPromptRefs.find(p => isSameId(p.id, promptId));
            if (promptRef) {
              await this.unlinkFromPrompt(image.id, promptId, promptRef.title);
            }
          });
        });
      } else {
        // 单引用情况：显示标题和解除关联按钮
        const p = allPromptRefs[0];
        promptTitleContainer.innerHTML =
          `<div class="prompt-ref-item single-ref" data-prompt-id="${p.id}">
            <span class="prompt-ref-title">${HtmlUtils.escapeHtml(p.title || '未命名')}</span>
            <span class="prompt-ref-unlink" title="解除关联">×</span>
          </div>`;

        // 绑定解除关联事件
        const unlinkBtn = promptTitleContainer.querySelector('.prompt-ref-unlink');
        if (unlinkBtn) {
          unlinkBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.unlinkFromPrompt(image.id, p.id, p.title);
          });
        }
      }

      // 显示第一个提示词的详细内容
      const firstPrompt = allPromptRefs[0];
      if (promptContentEl) promptContentEl.textContent = firstPrompt.content || '-';
      if (promptTranslateEl) promptTranslateEl.textContent = firstPrompt.contentTranslate || '-';
      if (promptNoteEl) promptNoteEl.textContent = firstPrompt.note || '-';

      // 设置标签
      if (tagsContainer) {
        if (firstPrompt.tags && firstPrompt.tags.length > 0) {
          tagsContainer.innerHTML = firstPrompt.tags.map(tag =>
            `<span class="tag-editable">${HtmlUtils.escapeHtml(tag)}</span>`
          ).join('');
        } else {
          tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
        }
      }

      const isFromDetailJump = this.app.isFromDetailJump;
      if (editPromptBtn) {
        editPromptBtn.style.display = 'flex';
        if (isFromDetailJump) {
          editPromptBtn.disabled = true;
          editPromptBtn.classList.add('disabled-secondary');
          editPromptBtn.title = '已从详情界面跳转，禁止再次跳转';
        } else {
          editPromptBtn.disabled = false;
          editPromptBtn.classList.remove('disabled-secondary');
          editPromptBtn.title = '';
          editPromptBtn.onclick = () => {
            const currentPrompt = allPromptRefs.find(p => isSameId(p.id, this.currentDetailPromptId));
            if (currentPrompt) {
              this.openPromptDetail(currentPrompt);
            }
          };
        }
      }
      if (editPromptBtnText) editPromptBtnText.textContent = allPromptRefs.length > 1 ? '编辑提示词 (1)' : '编辑提示词';
      this.currentDetailPromptId = firstPrompt.id;
      this.currentDetailPromptRefs = allPromptRefs;
    } else {
      // 没有关联提示词
      if (promptTitleContainer) promptTitleContainer.textContent = '-';
      if (promptContentEl) promptContentEl.textContent = '-';
      if (promptTranslateEl) promptTranslateEl.textContent = '-';
      if (promptNoteEl) promptNoteEl.textContent = '-';
      if (tagsContainer) tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';

      const isFromDetailJump = this.app.isFromDetailJump;
      if (editPromptBtn) {
        editPromptBtn.style.display = 'flex';
        if (isFromDetailJump) {
          editPromptBtn.disabled = true;
          editPromptBtn.classList.add('disabled-secondary');
          editPromptBtn.title = '已从详情界面跳转，禁止再次跳转';
          editPromptBtn.onclick = null;
        } else {
          editPromptBtn.disabled = false;
          editPromptBtn.classList.remove('disabled-secondary');
          editPromptBtn.title = '';
          editPromptBtn.onclick = () => this.createPromptForImage(image);
        }
      }
      if (editPromptBtnText) editPromptBtnText.textContent = '添加提示词';
      this.currentDetailPromptId = null;
      this.currentDetailPromptRefs = [];
    }
  }

  /**
   * 显示提示词详情
   * @param {Object} promptInfo - 提示词信息对象
   * @private
   */
  showPromptDetail(promptInfo) {
    if (!promptInfo) return;

    // 更新当前选中的提示词ID
    this.currentDetailPromptId = promptInfo.id;

    // 更新提示词标题区域的选中状态
    const promptTitleContainer = document.getElementById('imageDetailPromptTitle');
    if (promptTitleContainer) {
      promptTitleContainer.querySelectorAll('.prompt-ref-item').forEach(item => {
        if (isSameId(item.dataset.promptId, promptInfo.id)) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    // 更新提示词内容
    const promptContentEl = document.getElementById('imageDetailPromptContent');
    const promptTranslateEl = document.getElementById('imageDetailPromptTranslate');
    const promptNoteEl = document.getElementById('imageDetailPromptNote');
    const tagsContainer = document.getElementById('imageDetailTags');

    if (promptContentEl) promptContentEl.textContent = promptInfo.content || '-';
    if (promptTranslateEl) promptTranslateEl.textContent = promptInfo.contentTranslate || '-';
    if (promptNoteEl) promptNoteEl.textContent = promptInfo.note || '-';

    // 更新标签
    if (tagsContainer) {
      if (promptInfo.tags && promptInfo.tags.length > 0) {
        tagsContainer.innerHTML = promptInfo.tags.map(tag =>
          `<span class="tag-editable">${HtmlUtils.escapeHtml(tag)}</span>`
        ).join('');
      } else {
        tagsContainer.innerHTML = '<span style="color: var(--text-secondary);">无标签</span>';
      }
    }

    // 更新编辑按钮文本
    const editPromptBtnText = document.getElementById('editPromptBtnText');
    const allRefs = this.currentDetailPromptRefs || [];
    const currentIndex = allRefs.findIndex(p => isSameId(p.id, promptInfo.id));
    if (editPromptBtnText && currentIndex >= 0) {
      editPromptBtnText.textContent = `编辑提示词 (${currentIndex + 1})`;
    }
  }

  /**
   * 解除图像与提示词的关联
   * @param {string} imageId - 图像ID
   * @param {string} promptId - 提示词ID
   * @param {string} promptTitle - 提示词标题（用于确认消息）
   * @private
   */
  async unlinkFromPrompt(imageId, promptId, promptTitle) {
    const confirmed = await DialogService.showConfirmDialogByConfig({
      ...DialogConfig.UNLINK_FROM_PROMPT,
      data: { promptTitle }
    });

    if (!confirmed) return;

    try {
      const currentPrompts = this.currentItem?.promptRefs || [];
      const newPrompts = currentPrompts.filter(p => !isSameId(p.promptId, promptId));
      await window.electronAPI.updateImage(imageId, { prompts: newPrompts });

      if (this.currentItem) {
        this.currentItem.promptRefs = newPrompts;
        const cachedImage = cacheManager.getCachedImage(imageId);
        if (cachedImage) {
          cachedImage.promptRefs = newPrompts;
        }
        await this.renderPromptInfo(this.currentItem);
      }

      if (this.app.promptPanelManager) {
        await this.app.promptPanelManager.refreshAfterUpdate();
      }
      if (this.app.imagePanelManager) {
        await this.app.imagePanelManager.refreshAfterUpdate();
      }
      this.app.showToast('关联已解除', 'success');
    } catch (error) {
      window.electronAPI.logError('ImageDetailManager.js', 'Failed to unlink image from prompt:', error);
      this.app.showToast('解除关联失败', 'error');
    }
  }

  /**
   * 初始化保存管理器
   * @param {Object} image - 图像对象
   * @private
   */
  initSaveManager(image) {
    // 清理旧的
    if (this.saveManager) {
      this.saveManager.destroy();
    }

    // 清理收藏按钮事件监听器
    if (this.favoriteBtnHandler) {
      const favoriteBtn = document.getElementById('imageDetailFavoriteBtn');
      if (favoriteBtn) {
        favoriteBtn.removeEventListener('click', this.favoriteBtnHandler);
      }
      this.favoriteBtnHandler = null;
    }

    // 创建保存策略
    const strategy = new ImageSaveStrategy(this.app);

    // 创建保存管理器
    this.saveManager = new SaveManager({
      strategy,
      itemId: image.id,
      onAfterSave: async () => {
        // 刷新主界面
        if (this.app.imagePanelManager) {
          await this.app.imagePanelManager.refreshAfterUpdate();
        }
      }
    });

    // 注册所有字段
    this.registerFields(image);
  }

  /**
   * 注册所有字段到 SaveManager
   * @param {Object} image - 图像对象
   * @private
   */
  registerFields(image) {
    // 1. 文件名 - 防抖保存
    this.saveManager.registerField('fileName', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'imageDetailFileName',
      statusId: 'imageDetailFileNameStatus',
      validate: (value) => validateFileName(value)
    });

    // 2. 备注 - 防抖保存
    this.saveManager.registerField('note', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'imageDetailNote',
      autoResize: true,
      statusId: 'imageDetailNoteStatus'
    });

    // 3. 安全状态 - 防抖保存
    this.saveManager.registerField('isSafe', {
      saveMode: 'debounce',
      delay: 800,
      elementId: 'imageDetailSafeToggle',
      getValue: (element) => element.checked ? 1 : 0,
      onChange: (value) => {
        this.app.showToast(value ? '已标记为安全' : '已标记为不安全', 'success');
      }
    });

    // 4. 收藏 - 防抖保存（通过按钮点击触发）
    this.saveManager.registerField('isFavorite', {
      saveMode: 'debounce',
      delay: 800,
      onChange: (value) => {
        this.updateFavoriteBtnUI(value);
        this.app.showToast(value ? '已收藏' : '已取消收藏', 'success');
      }
    });

    // 手动绑定收藏按钮点击事件
    const favoriteBtn = document.getElementById('imageDetailFavoriteBtn');
    if (favoriteBtn) {
      this.favoriteBtnHandler = async () => {
        const newState = !this.currentItem?.isFavorite;
        await this.saveManager.triggerSave('isFavorite', newState, this.currentItem?.id);
      };
      favoriteBtn.addEventListener('click', this.favoriteBtnHandler);
    }
  }

  /**
   * 初始化图像导航器
   * @param {Object} image - 图像对象
   * @param {Object} options - 选项
   * @private
   */
  async initNavigatorForImage(image, options = {}) {
    // 记录当前图像列表的快照
    const items = options.filteredList && options.filteredList.length > 0
      ? [...options.filteredList]
      : Array.from(this.app.imageCache.values());

    const onNavigate = async (targetImage) => {
      // 直接使用 targetImage，不要重新查找，避免数据不一致
      await this.updateView(targetImage);
    };

    this.initNavigator(image, items, {
      first: document.getElementById('imageDetailFirstNavBtn'),
      prev: document.getElementById('imageDetailPrevNavBtn'),
      next: document.getElementById('imageDetailNextNavBtn'),
      last: document.getElementById('imageDetailLastNavBtn')
    }, onNavigate);
  }

  /**
   * 获取导航按钮前缀
   * @returns {string} 前缀
   */
  getNavButtonPrefix() {
    return 'imageDetail';
  }

  /**
   * 更新视图
   * @param {Object} image - 图像对象
   */
  async updateView(image) {
    // 更新当前图像
    this.currentItem = image;

    // 填充表单数据
    this.fillFormData(image);

    // 设置安全状态
    this.setSafeState(image.isSafe !== 0);

    // 更新收藏按钮
    this.updateFavoriteBtnUI(image.isFavorite);

    // 渲染图像信息（包括图像显示）
    await this.renderImageInfo(image);

    // 重新初始化保存管理器
    this.initSaveManager(image);

    // 重新初始化标签管理器
    this.initTagManager(image);

    // 渲染关联提示词信息
    await this.renderPromptInfo(image);

    // 自动调整文本框高度
    const noteInput = document.getElementById('imageDetailNote');
    if (noteInput) {
      this.app.autoResizeTextarea(noteInput);
    }
  }

  /**
   * 为图像创建新提示词
   * @param {Object} image - 图像对象
   * @private
   */
  async createPromptForImage(image) {
    try {
      // 打开新建提示词页面，预填充当前图像
      await this.app.newPromptManager.open([image]);
      // 关闭图像详情模态框
      this.close();
    } catch (error) {
      window.electronAPI.logError('ImageDetailManager.js', 'Failed to create prompt for image:', error);
      this.app.showToast('打开新建提示词页面失败', 'error');
    }
  }

  /**
   * 打开提示词详情页面
   * @param {Object} prompt - 提示词对象
   * @private
   */
  async openPromptDetail(prompt) {
    try {
      await this.app.promptDetailManager.open(prompt, {
        returnToManager: this,
        returnToItem: this.currentItem
      });
      this.close();
    } catch (error) {
      window.electronAPI.logError('ImageDetailManager.js', 'Failed to open prompt detail:', error);
      this.app.showToast('打开提示词详情失败', 'error');
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
