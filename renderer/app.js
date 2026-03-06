/**
 * Prompt Manager 主应用逻辑
 * 管理 Prompt 的增删改查、标签管理、图像处理等功能
 */
class PromptManager {
  /**
   * 构造函数 - 初始化应用状态和配置
   */
  constructor() {
    this.prompts = [];              // 所有 Prompt 数据
    this.searchQuery = '';          // 当前搜索关键词
    this.selectedTags = new Set();  // 当前选中的标签集合
    this.currentViewPrompt = null;  // 当前查看的 Prompt
    this.currentTheme = localStorage.getItem('theme') || 'light';  // 当前主题
    this.currentImages = [];        // 当前编辑的图像列表
    this.viewerImages = [];         // 图像查看器中的图像列表
    this.viewerCurrentIndex = 0;    // 图像查看器当前索引

    this.init();
  }

  /**
   * 初始化应用
   * 加载主题、绑定事件、加载数据
   */
  async init() {
    this.initTheme();
    this.bindEvents();
    await this.loadPrompts();
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

    // 更新图标
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    const themeText = document.getElementById('themeText');
    if (sunIcon && moonIcon) {
      if (theme === 'dark') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      }
    }
    if (themeText) {
      themeText.textContent = theme === 'dark' ? '明亮' : '暗黑';
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
    // 新建按钮
    document.getElementById('addBtn').addEventListener('click', () => this.openEditModal());
    
    // 搜索
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.debounceSearch();
    });

    // 清除标签筛选
    document.getElementById('clearTagFilter').addEventListener('click', () => this.clearTagFilter());

    // Modal 关闭
    document.getElementById('closeModal').addEventListener('click', () => this.closeEditModal());
    document.getElementById('cancelBtn').addEventListener('click', () => this.closeEditModal());
    document.getElementById('closeViewModal').addEventListener('click', () => this.closeViewModal());
    
    // 保存
    document.getElementById('saveBtn').addEventListener('click', () => this.savePrompt());
    
    // 查看 Modal 操作
    document.getElementById('editFromViewBtn').addEventListener('click', () => {
      const promptToEdit = this.currentViewPrompt;
      this.closeViewModal();
      if (promptToEdit) {
        this.openEditModal(promptToEdit);
      }
    });
    document.getElementById('copyBtn').addEventListener('click', () => this.copyCurrentPrompt());
    
    // 导入导出
    document.getElementById('importBtn').addEventListener('click', () => this.importPrompts());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportPrompts());

    // 主题切换
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

    // 图像上传
    this.bindImageUploadEvents();

    // 图像查看器事件
    this.bindImageViewerEvents();

    // 设置
    this.bindSettingsEvents();

    // 点击 Modal 外部关闭
    document.getElementById('editModal').addEventListener('click', (e) => {
      if (e.target.id === 'editModal') this.closeEditModal();
    });
    document.getElementById('viewModal').addEventListener('click', (e) => {
      if (e.target.id === 'viewModal') this.closeViewModal();
    });
    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') this.closeSettingsModal();
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeEditModal();
        this.closeViewModal();
        this.closeSettingsModal();
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
    document.getElementById('closeSettingsBtn').addEventListener('click', () => this.closeSettingsModal());

    // 更改数据目录
    document.getElementById('changeDataPathBtn').addEventListener('click', () => this.changeDataPath());

    // 清理未引用图像
    document.getElementById('cleanupImagesBtn').addEventListener('click', () => this.cleanupUnusedImages());

    // 刷新应用
    document.getElementById('refreshBtn').addEventListener('click', () => this.refreshApp());

    // 回收站
    document.getElementById('recycleBinBtn').addEventListener('click', () => this.openRecycleBinModal());
    document.getElementById('closeRecycleBinModal').addEventListener('click', () => this.closeRecycleBinModal());
    document.getElementById('emptyRecycleBinBtn').addEventListener('click', () => this.emptyRecycleBin());

    // 标签管理
    document.getElementById('tagManagerBtn').addEventListener('click', () => this.openTagManagerModal());
    document.getElementById('closeTagManagerModal').addEventListener('click', () => this.closeTagManagerModal());
    document.getElementById('addTagBtn').addEventListener('click', () => this.addNewTag());
    document.getElementById('newTagInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addNewTag();
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
      console.error('获取数据路径失败:', error);
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
      console.error('更改数据路径失败:', error);
      this.showToast('更改失败: ' + error.message, 'error');
    }
  }

  /**
   * 清理未引用的图像文件
   * 删除所有未被 Prompt 使用的图像和缩略图
   */
  async cleanupUnusedImages() {
    if (!confirm('确定要清理未引用的图像吗？\n这将删除所有未被 Prompt 使用的图像文件，此操作不可恢复。')) {
      return;
    }

    try {
      const result = await window.electronAPI.cleanupUnusedImages();
      if (result.totalDeleted > 0) {
        this.showToast(`清理完成：删除 ${result.deletedImages} 个图像，${result.deletedThumbnails} 个缩略图`, 'success');
      } else {
        this.showToast('没有需要清理的图像', 'success');
      }
    } catch (error) {
      console.error('清理图像失败:', error);
      this.showToast('清理失败: ' + error.message, 'error');
    }
  }

  /**
   * 重启应用
   * 显示确认对话框后重启 Electron 应用
   */
  async refreshApp() {
    const confirmed = await window.electronAPI.showConfirmDialog('确认重启', '确定要重启应用吗？未保存的数据可能会丢失。');
    if (!confirmed) return;

    try {
      this.showToast('正在重启应用...', 'success');
      await window.electronAPI.relaunchApp();
    } catch (error) {
      console.error('重启失败:', error);
      this.showToast('重启失败: ' + error.message, 'error');
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

      listContainer.style.display = 'flex';
      emptyState.style.display = 'none';

      // 按删除时间倒序排列
      items.sort((a, b) => b.deletedAt - a.deletedAt);

      listContainer.innerHTML = items.map(item => {
        const deletedDate = new Date(item.deletedAt).toLocaleString('zh-CN');
        return `
          <div class="recycle-bin-item" data-id="${item.id}">
            <div class="recycle-bin-item-info">
              <div class="recycle-bin-item-title">${this.escapeHtml(item.title)}</div>
              <div class="recycle-bin-item-date">删除时间: ${deletedDate}</div>
            </div>
            <div class="recycle-bin-item-actions">
              <button class="btn btn-primary btn-sm recycle-action-btn" data-id="${item.id}">恢复</button>
              <button class="btn btn-danger btn-sm recycle-action-btn" data-id="${item.id}">彻底删除</button>
            </div>
          </div>
        `;
      }).join('');

      // 绑定恢复按钮事件
      listContainer.querySelectorAll('.recycle-action-btn').forEach((btn, index) => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          if (index % 2 === 0) {
            await this.restoreFromRecycleBin(id);
          } else {
            await this.permanentlyDelete(id);
          }
        });
      });
    } catch (error) {
      console.error('渲染回收站失败:', error);
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
      console.error('恢复失败:', error);
      this.showToast('恢复失败: ' + error.message, 'error');
    }
  }

  /**
   * 彻底删除 Prompt
   * @param {string} id - 要删除的 Prompt ID
   */
  async permanentlyDelete(id) {
    const confirmed = await window.electronAPI.showConfirmDialog('确认彻底删除', '确定要彻底删除这个 Prompt 吗？此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.permanentlyDelete(id);
      this.showToast('已彻底删除');
      await this.renderRecycleBin();
    } catch (error) {
      console.error('删除失败:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 清空回收站
   * 删除所有回收站中的项目
   */
  async emptyRecycleBin() {
    const confirmed = await window.electronAPI.showConfirmDialog('确认清空回收站', '确定要清空回收站吗？所有项目将被彻底删除，此操作不可恢复。');
    if (!confirmed) return;

    try {
      await window.electronAPI.emptyRecycleBin();
      this.showToast('回收站已清空');
      await this.renderRecycleBin();
    } catch (error) {
      console.error('清空回收站失败:', error);
      this.showToast('清空失败: ' + error.message, 'error');
    }
  }

  /**
   * 打开标签管理模态框
   */
  async openTagManagerModal() {
    const modal = document.getElementById('tagManagerModal');
    await this.renderTagManager();
    modal.style.display = 'flex';
  }

  /**
   * 关闭标签管理模态框
   */
  closeTagManagerModal() {
    const modal = document.getElementById('tagManagerModal');
    modal.style.display = 'none';
  }

  /**
   * 渲染标签管理列表
   * 显示所有标签及其使用数量
   */
  async renderTagManager() {
    try {
      const tags = await window.electronAPI.getTags();
      const listContainer = document.getElementById('tagManagerList');
      const emptyState = document.getElementById('tagManagerEmpty');

      // 计算每个标签的使用数量
      const tagCounts = {};
      this.prompts.forEach(prompt => {
        if (prompt.tags && prompt.tags.length > 0) {
          prompt.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });

      if (tags.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
      }

      listContainer.style.display = 'flex';
      emptyState.style.display = 'none';

      listContainer.innerHTML = tags.map(tag => {
        const count = tagCounts[tag] || 0;
        return `
          <div class="tag-manager-item" data-tag="${this.escapeHtml(tag)}">
            <div class="tag-manager-item-name">
              <span class="tag-name-text">${this.escapeHtml(tag)}</span>
            </div>
            <span class="tag-manager-item-count">${count} 个 Prompt</span>
            <div class="tag-manager-item-actions">
              <button class="btn btn-secondary btn-sm rename-tag-btn" data-tag="${this.escapeHtml(tag)}">重命名</button>
              <button class="btn btn-danger btn-sm delete-tag-btn" data-tag="${this.escapeHtml(tag)}">删除</button>
            </div>
          </div>
        `;
      }).join('');

      // 绑定重命名按钮事件
      listContainer.querySelectorAll('.rename-tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tag = e.target.dataset.tag;
          this.startRenameTag(tag);
        });
      });

      // 绑定删除按钮事件
      listContainer.querySelectorAll('.delete-tag-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tag = e.target.dataset.tag;
          await this.deleteTag(tag);
        });
      });
    } catch (error) {
      console.error('渲染标签管理失败:', error);
      this.showToast('加载标签失败', 'error');
    }
  }

  /**
   * 开始重命名标签
   * 将标签名称转换为可编辑的输入框
   * @param {string} oldTag - 原标签名称
   */
  startRenameTag(oldTag) {
    const item = document.querySelector(`.tag-manager-item[data-tag="${oldTag}"]`);
    if (!item) return;

    const nameContainer = item.querySelector('.tag-manager-item-name');
    nameContainer.classList.add('editing');
    nameContainer.innerHTML = `
      <input type="text" value="${oldTag}" class="rename-tag-input">
      <button class="btn btn-primary btn-sm confirm-rename-btn">确认</button>
      <button class="btn btn-secondary btn-sm cancel-rename-btn">取消</button>
    `;

    const input = nameContainer.querySelector('.rename-tag-input');
    input.focus();
    input.select();

    const confirmBtn = nameContainer.querySelector('.confirm-rename-btn');
    const cancelBtn = nameContainer.querySelector('.cancel-rename-btn');

    confirmBtn.addEventListener('click', async () => {
      const newTag = input.value.trim();
      if (newTag && newTag !== oldTag) {
        await this.renameTag(oldTag, newTag);
      } else {
        await this.renderTagManager();
      }
    });

    cancelBtn.addEventListener('click', async () => {
      await this.renderTagManager();
    });

    input.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const newTag = input.value.trim();
        if (newTag && newTag !== oldTag) {
          await this.renameTag(oldTag, newTag);
        } else {
          await this.renderTagManager();
        }
      } else if (e.key === 'Escape') {
        await this.renderTagManager();
      }
    });
  }

  /**
   * 重命名标签
   * 更新标签名称并同步到所有使用该标签的 Prompt
   * @param {string} oldTag - 原标签名称
   * @param {string} newTag - 新标签名称
   */
  async renameTag(oldTag, newTag) {
    try {
      await window.electronAPI.renameTag(oldTag, newTag);
      this.showToast('标签已重命名');
      await this.renderTagManager();
      await this.loadPrompts();
      this.renderTagFilters();
    } catch (error) {
      console.error('重命名标签失败:', error);
      this.showToast('重命名失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除标签
   * 从标签列表中删除，并从所有 Prompt 中移除该标签
   * @param {string} tag - 要删除的标签名称
   */
  async deleteTag(tag) {
    const confirmed = await window.electronAPI.showConfirmDialog('确认删除标签', `确定要删除标签 "${tag}" 吗？此标签将从所有 Prompt 中移除。`);
    if (!confirmed) return;

    try {
      await window.electronAPI.deleteTag(tag);
      this.showToast('标签已删除');
      await this.renderTagManager();
      await this.loadPrompts();
      this.renderTagFilters();
    } catch (error) {
      console.error('删除标签失败:', error);
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  /**
   * 添加新标签
   * 将新标签添加到标签列表
   */
  async addNewTag() {
    const input = document.getElementById('newTagInput');
    const tag = input.value.trim();

    if (!tag) {
      this.showToast('请输入标签名称', 'error');
      return;
    }

    try {
      await window.electronAPI.addTag(tag);
      this.showToast('标签已添加');
      input.value = '';
      await this.renderTagManager();
      this.renderTagFilters();
    } catch (error) {
      console.error('添加标签失败:', error);
      this.showToast('添加失败: ' + error.message, 'error');
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
   * 绑定图像上传事件
   * 支持点击上传和拖拽上传
   */
  bindImageUploadEvents() {
    const uploadArea = document.getElementById('imageUploadArea');
    const imageInput = document.getElementById('imageInput');

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

        this.currentImages.push({
          id: Date.now() + Math.random().toString(36).substr(2, 9),
          name: imageInfo.fileName,
          storedName: imageInfo.storedName,
          relativePath: imageInfo.relativePath,
          path: imageInfo.path
        });
      } catch (error) {
        console.error('保存图像失败:', error);
        this.showToast('保存图像失败: ' + error.message, 'error');
      }
    }
    this.renderImagePreviews();
  }

  // 渲染图像预览
  async renderImagePreviews() {
    const container = document.getElementById('imagePreviewList');
    if (!container) return;

    // 过滤掉没有 relativePath 的图像（旧数据兼容）
    const validImages = this.currentImages.filter(img => img.relativePath);

    // 获取所有图像的完整路径并渲染
    const previews = await Promise.all(
      validImages.map(async (img, index) => {
        const imagePath = await window.electronAPI.getImagePath(img.relativePath);
        return `
          <div class="image-preview-item" data-index="${index}">
            <img src="file://${imagePath}" alt="${img.name}">
            <button class="remove-image" data-index="${index}" title="删除">×</button>
          </div>
        `;
      })
    );

    container.innerHTML = previews.join('');

    // 绑定删除事件
    container.querySelectorAll('.remove-image').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        const img = this.currentImages[index];

        // 删除图像文件
        if (img && img.storedName) {
          await window.electronAPI.deleteImageFile(img.storedName);
        }

        this.currentImages.splice(index, 1);
        this.renderImagePreviews();
      });
    });
  }

  // 绑定图像查看器事件
  bindImageViewerEvents() {
    const viewer = document.getElementById('imageViewer');
    const closeBtn = document.getElementById('imageViewerClose');
    const prevBtn = document.getElementById('imageViewerPrev');
    const nextBtn = document.getElementById('imageViewerNext');
    const clickLeft = document.getElementById('imageViewerClickLeft');
    const clickRight = document.getElementById('imageViewerClickRight');
    const wrapper = document.getElementById('imageViewerWrapper');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeImageViewer());
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.showPrevImage());
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.showNextImage());
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
      } else if (e.key === 'ArrowLeft') {
        this.showPrevImage();
      } else if (e.key === 'ArrowRight') {
        this.showNextImage();
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
      console.error('进入全屏失败:', error);
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
      console.error('退出全屏失败:', error);
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

  // 更新查看器显示
  async updateImageViewer() {
    const img = document.getElementById('imageViewerImg');
    const counter = document.getElementById('imageViewerCounter');
    const prevBtn = document.getElementById('imageViewerPrev');
    const nextBtn = document.getElementById('imageViewerNext');

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
    prevBtn.disabled = this.viewerCurrentIndex === 0;
    nextBtn.disabled = this.viewerCurrentIndex === this.viewerImages.length - 1;
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
    this.prompts = await window.electronAPI.getPrompts();
    this.render();
  }
  
  render() {
    this.renderTagFilters();
    this.renderPromptList();
  }

  // 渲染标签筛选器
  renderTagFilters() {
    const container = document.getElementById('tagFilterList');
    const clearBtn = document.getElementById('clearTagFilter');

    // 收集所有标签及其数量
    const tagCounts = {};
    this.prompts.forEach(prompt => {
      if (prompt.tags && prompt.tags.length > 0) {
        prompt.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    // 按数量排序
    const sortedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1]);

    if (sortedTags.length === 0) {
      container.innerHTML = '<span class="tag-filter-empty">暂无标签</span>';
      clearBtn.style.display = 'none';
      return;
    }

    // 渲染标签
    container.innerHTML = sortedTags.map(([tag, count]) => {
      const isActive = this.selectedTags.has(tag);
      return `
        <button class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}">
          <span>${this.escapeHtml(tag)}</span>
          <span class="count">${count}</span>
        </button>
      `;
    }).join('');

    // 显示/隐藏清除按钮
    clearBtn.style.display = this.selectedTags.size > 0 ? 'block' : 'none';

    // 绑定点击事件
    container.querySelectorAll('.tag-filter-item').forEach(item => {
      item.addEventListener('click', () => {
        const tag = item.dataset.tag;
        if (this.selectedTags.has(tag)) {
          this.selectedTags.delete(tag);
        } else {
          this.selectedTags.add(tag);
        }
        this.render();
      });
    });
  }

  // 清除标签筛选
  clearTagFilter() {
    this.selectedTags.clear();
    this.render();
  }

  renderPromptList() {
    const container = document.getElementById('promptList');
    const emptyState = document.getElementById('emptyState');

    // 过滤 Prompts
    let filtered = this.prompts;

    // 标签筛选
    if (this.selectedTags.size > 0) {
      filtered = filtered.filter(prompt => {
        if (!prompt.tags || prompt.tags.length === 0) return false;
        return prompt.tags.some(tag => this.selectedTags.has(tag));
      });
    }

    if (filtered.length === 0) {
      container.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    container.style.display = 'grid';
    emptyState.style.display = 'none';

    container.innerHTML = filtered.map(prompt => this.createPromptCard(prompt)).join('');

    // 绑定卡片事件
    filtered.forEach(prompt => {
      const card = document.querySelector(`[data-id="${prompt.id}"]`);
      if (card) {
        card.addEventListener('click', (e) => {
          if (!e.target.closest('.action-btn')) {
            this.openViewModal(prompt);
          }
        });

        const copyBtn = card.querySelector('.copy-btn');
        const editBtn = card.querySelector('.edit-btn');
        const deleteBtn = card.querySelector('.delete-btn');

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

        if (editBtn) {
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openEditModal(prompt);
          });
        }

        if (deleteBtn) {
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            // 弹出确认对话框
            const confirmed = await window.electronAPI.showConfirmDialog('确认删除', '确定要删除这个 Prompt 吗？此操作不可恢复。');
            if (confirmed) {
              await this.deletePrompt(prompt.id);
            }
          });
        }
      }

      // 异步加载缩略图
      if (prompt.images && prompt.images.length > 0) {
        this.loadCardThumbnails(prompt);
      }
    });
  }
  
  /**
   * 创建 Prompt 卡片 HTML
   * @param {Object} prompt - Prompt 数据对象
   * @returns {string} 卡片 HTML 字符串
   */
  createPromptCard(prompt) {
    const tags = prompt.tags ? prompt.tags.map(tag => `<span class="tag">${tag}</span>`).join('') : '';
    const date = new Date(prompt.updatedAt).toLocaleDateString('zh-CN');

    // 检查是否有图像
    const hasImages = prompt.images && prompt.images.length > 0;
    const imageCount = hasImages ? prompt.images.length : 0;

    return `
      <div class="prompt-card" data-id="${prompt.id}">
        <div class="prompt-card-header">
          <div class="prompt-card-title">${this.escapeHtml(prompt.title)}</div>
          <div class="prompt-card-actions">
            <button class="action-btn copy-btn" title="复制内容">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button class="action-btn edit-btn" title="编辑">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="action-btn delete-btn" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        ${hasImages ? `<div class="prompt-card-thumbnails" data-prompt-id="${prompt.id}"></div>` : ''}
        <div class="prompt-card-content">${this.escapeHtml(prompt.content)}</div>
        <div class="prompt-card-footer">
          <div class="prompt-card-tags">${tags}</div>
          <div class="prompt-card-date">${date}</div>
        </div>
      </div>
    `;
  }

  /**
   * 异步加载卡片缩略图
   * 为 Prompt 卡片加载图像缩略图
   * @param {Object} prompt - Prompt 数据对象
   */
  async loadCardThumbnails(prompt) {
    if (!prompt.images || prompt.images.length === 0) return;

    const container = document.querySelector(`.prompt-card-thumbnails[data-prompt-id="${prompt.id}"]`);
    if (!container) return;

    // 只显示前3张缩略图
    const imagesToShow = prompt.images.slice(0, 3);
    const remainingCount = prompt.images.length - imagesToShow.length;

    const thumbnails = await Promise.all(
      imagesToShow.map(async (img) => {
        // 优先使用缩略图，如果没有则使用原图
        const imagePath = img.thumbnailPath || img.relativePath;
        if (!imagePath) return '';

        const fullPath = await window.electronAPI.getImagePath(imagePath);
        return `<div class="thumbnail-item"><img src="file://${fullPath}" alt="${img.fileName || ''}"></div>`;
      })
    );

    let html = thumbnails.join('');
    if (remainingCount > 0) {
      html += `<div class="thumbnail-more">+${remainingCount}</div>`;
    }

    container.innerHTML = html;
  }
  
  openEditModal(prompt = null) {
    const modal = document.getElementById('editModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('promptForm');

    // 重置图像
    this.currentImages = [];

    if (prompt && prompt.id) {
      title.textContent = '编辑 Prompt';
      document.getElementById('promptId').value = prompt.id;
      document.getElementById('promptTitle').value = prompt.title || '';
      document.getElementById('promptTags').value = prompt.tags ? prompt.tags.join(', ') : '';
      document.getElementById('promptContent').value = prompt.content || '';

      // 加载已有图像
      if (prompt.images && prompt.images.length > 0) {
        this.currentImages = [...prompt.images];
      }
    } else {
      title.textContent = '新建 Prompt';
      form.reset();
      document.getElementById('promptId').value = '';
    }

    this.renderImagePreviews();
    modal.classList.add('active');
    document.getElementById('promptTitle').focus();
  }

  /**
   * 关闭编辑模态框
   */
  closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
  }

  /**
   * 打开查看模态框
   * 显示 Prompt 的详细内容
   * @param {Object} prompt - 要查看的 Prompt 对象
   */
  openViewModal(prompt) {
    this.currentViewPrompt = prompt;
    const modal = document.getElementById('viewModal');

    document.getElementById('viewTitle').textContent = prompt.title;
    document.getElementById('viewContent').textContent = prompt.content;

    const tagsContainer = document.getElementById('viewTags');
    if (prompt.tags && prompt.tags.length > 0) {
      tagsContainer.innerHTML = prompt.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('');
    } else {
      tagsContainer.innerHTML = '';
    }

    // 显示图像
    const imagesContainer = document.getElementById('viewImages');
    // 过滤掉没有 relativePath 的图像（旧数据兼容）
    const validImages = prompt.images ? prompt.images.filter(img => img.relativePath) : [];

    if (validImages.length > 0) {
      // 异步加载图像路径
      Promise.all(validImages.map(async (img, index) => {
        const imagePath = await window.electronAPI.getImagePath(img.relativePath);
        return `
          <div class="view-image-item" data-index="${index}">
            <img src="file://${imagePath}" alt="${img.name}">
          </div>
        `;
      })).then(htmlArray => {
        imagesContainer.innerHTML = htmlArray.join('');
        imagesContainer.style.display = 'flex';

        // 绑定点击事件打开全屏查看器
        imagesContainer.querySelectorAll('.view-image-item').forEach((item, index) => {
          item.addEventListener('click', () => {
            this.openImageViewer(validImages, index);
          });
        });
      });
    } else {
      imagesContainer.innerHTML = '';
      imagesContainer.style.display = 'none';
    }

    modal.classList.add('active');
  }

  /**
   * 关闭查看模态框
   */
  closeViewModal() {
    document.getElementById('viewModal').classList.remove('active');
    this.currentViewPrompt = null;
  }

  /**
   * 保存 Prompt
   * 创建新 Prompt 或更新现有 Prompt
   */
  async savePrompt() {
    const id = document.getElementById('promptId').value;
    const title = document.getElementById('promptTitle').value.trim();
    const tagsInput = document.getElementById('promptTags').value.trim();
    const content = document.getElementById('promptContent').value.trim();

    if (!title || !content) {
      this.showToast('请填写标题和内容', 'error');
      return;
    }

    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
    const images = this.currentImages;

    try {
      // 将新标签添加到标签列表
      if (tags.length > 0) {
        const existingTags = await window.electronAPI.getTags();
        const newTags = tags.filter(tag => !existingTags.includes(tag));
        for (const tag of newTags) {
          await window.electronAPI.addTag(tag);
        }
      }

      if (id) {
        // 更新
        const result = await window.electronAPI.updatePrompt(id, { title, tags, content, images });
        if (result === null) {
          throw new Error('找不到要更新的 Prompt');
        }
        this.showToast('Prompt 已更新');
      } else {
        // 新建
        await window.electronAPI.addPrompt({ title, tags, content, images });
        this.showToast('Prompt 已创建');
      }

      this.closeEditModal();
      await this.loadPrompts();
      this.renderTagFilters();
    } catch (error) {
      console.error('Save error:', error);
      this.showToast('保存失败: ' + error.message, 'error');
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
   * 复制当前查看的 Prompt 内容到剪贴板
   */
  async copyCurrentPrompt() {
    if (!this.currentViewPrompt) return;

    try {
      await window.electronAPI.copyToClipboard(this.currentViewPrompt.content);
      this.showToast('已复制到剪贴板');
    } catch (error) {
      this.showToast('复制失败', 'error');
    }
  }

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
    toast.classList.remove('error', 'success');
    // 添加新的类型类
    if (type === 'error') {
      toast.classList.add('error');
    } else if (type === 'success') {
      toast.classList.add('success');
    }

    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
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
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new PromptManager();
});
