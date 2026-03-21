import { DialogService, DialogConfig } from '../services/DialogService.js';
import { localTime } from '../../utils/TimeUtils.js';

/**
 * 回收站管理器
 * 管理已删除的提示词和图像，支持恢复和永久删除
 */
export class TrashManager {
  /**
   * 回收站类型配置
   */
  static TRASH_CONFIG = {
    prompt: {
      api: 'getPromptTrash',
      emptyApi: 'emptyPromptTrash',
      restoreApi: 'restorePromptFromTrash',
      deleteApi: 'permanentDeletePrompt',
      containerId: 'promptTrashList',
      label: '提示词'
    },
    image: {
      api: 'getImageTrash',
      emptyApi: 'emptyImageTrash',
      restoreApi: 'restoreImageFromTrash',
      deleteApi: 'permanentDeleteImage',
      containerId: 'imageTrashList',
      label: '图像'
    }
  };

  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 主应用引用
   * @param {Object} options.eventBus - 事件总线
   */
  constructor(options) {
    this.app = options.app;
    this.eventBus = options.eventBus;
    this.trashItems = [];
    this.currentType = 'prompt'; // 'prompt' | 'image'
  }

  /**
   * 初始化回收站
   */
  async init() {
    await this.loadTrash();
    this.bindEvents();
  }

  /**
   * 获取当前类型的配置
   * @returns {Object} 配置对象
   */
  getCurrentConfig() {
    return TrashManager.TRASH_CONFIG[this.currentType];
  }

  /**
   * 加载回收站列表
   */
  async loadTrash() {
    try {
      const config = this.getCurrentConfig();
      this.trashItems = await window.electronAPI[config.api]();
      
      await this.renderTrashList();
      this.eventBus.emit('trashLoaded', { items: this.trashItems });
    } catch (error) {
      window.electronAPI.logError('TrashManager.js', 'Failed to load trash:', error);
      this.app.showToast('加载回收站失败', 'error');
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 清空回收站按钮
    const clearBtn = document.getElementById('emptyPromptTrashBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.confirmClearTrash());
    }
  }

  /**
   * 渲染回收站列表
   */
  async renderTrashList() {
    // 分别渲染提示词和图像到各自的容器
    await this.renderTrashListForType('prompt');
    await this.renderTrashListForType('image');
  }

  /**
   * 渲染指定类型的回收站列表
   * @param {string} type - 类型 ('prompt' | 'image')
   */
  async renderTrashListForType(type) {
    const containerId = type === 'prompt' ? 'promptTrashList' : 'imageTrashList';
    const container = document.getElementById(containerId);
    
    if (!container) return;

    // 过滤出该类型的项目
    const items = this.trashItems.filter(item => item.type === type);

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          <p>回收站为空</p>
        </div>
      `;
      return;
    }

    const html = items.map(item => this.renderTrashItem(item)).join('');
    container.innerHTML = html;
    this.bindTrashItemEventsForContainer(container);
    this.loadCardBackgroundsForContainer(container);
  }

  /**
   * 渲染回收站项
   * @param {Object} item - 回收站项
   * @returns {string} HTML 字符串
   */
  renderTrashItem(item) {
    const dateStr = item.deletedAt;
    
    // 图像显示空背景（后续异步加载），提示词也显示空背景（后续加载关联图像）
    // 都不需要图标占位符
    const bgHTML = `<div class="card__bg"></div>`;
    
    return `
      <div class="recycle-bin-card" data-id="${item.id}" data-type="${item.type}">
        ${bgHTML}
        <div class="card__overlay">
          <div class="card__header">
            <button class="btn btn-sm card__btn--primary" style="position: absolute; top: 8px; left: 8px;" data-action="restore">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
            </button>
            <span class="recycle-bin-card-info">${item.type === 'prompt' ? '提示词' : '图像'}</span>
          </div>
          <button class="btn btn-sm card__btn--danger" data-action="delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div class="card__footer">
          <div class="recycle-bin-card-title">${item.title || item.fileName || '无标题'}</div>
          <div class="recycle-bin-card-meta">删除于 ${dateStr}</div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定回收站项事件（针对指定容器）
   * @param {HTMLElement} container - 容器元素
   */
  bindTrashItemEventsForContainer(container) {
    const items = container.querySelectorAll('.recycle-bin-card');
    
    items.forEach(item => {
      // 恢复按钮
      const restoreBtn = item.querySelector('[data-action="restore"]');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const itemId = item.dataset.id;
          const itemType = item.dataset.type;
          await this.restoreItem(itemId, itemType);
        });
      }

      // 删除按钮
      const deleteBtn = item.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const itemId = item.dataset.id;
          const itemType = item.dataset.type;
          await this.permanentlyDeleteItem(itemId, itemType);
        });
      }

      // 点击卡片本身恢复
      item.addEventListener('click', async (e) => {
        // 如果点击的是按钮，不触发恢复
        if (e.target.closest('[data-action]')) {
          return;
        }
        const itemId = item.dataset.id;
        const itemType = item.dataset.type;
        await this.restoreItem(itemId, itemType);
      });
    });
  }

  /**
   * 异步加载卡片背景图（针对指定容器）
   * @param {HTMLElement} container - 容器元素
   */
  async loadCardBackgroundsForContainer(container) {
    const cards = container.querySelectorAll('.recycle-bin-card');
    
    for (const card of cards) {
      const itemId = card.dataset.id;
      const itemType = card.dataset.type;
      
      const item = this.trashItems.find(i => String(i.id) === String(itemId));
      
      // 获取图像路径
      let imagePath = null;
      if (itemType === 'image') {
        // 图像类型：使用自身的 thumbnailPath
        imagePath = item.thumbnailPath;
      } else if (itemType === 'prompt' && item.images && item.images.length > 0) {
        // 提示词类型：使用关联的第一张图像
        imagePath = item.images[0].thumbnailPath;
      }
      
      if (!imagePath) continue;

      try {
        const fullPath = await window.electronAPI.getImagePath(imagePath);
        const bgElement = card.querySelector('.card__bg');
        if (bgElement) {
          bgElement.style.backgroundImage = `url('file://${fullPath.replace(/\\/g, '/')}')`;
        }
      } catch (error) {
        window.electronAPI.logError('TrashManager.js', 'Failed to load recycle bin card background:', error);
      }
    }
  }

  /**
   * 恢复项目
   * @param {string} itemId - 项目 ID
   * @param {string} itemType - 项目类型 (prompt/image)
   */
  async restoreItem(itemId, itemType) {
    try {
      const config = TrashManager.TRASH_CONFIG[itemType];
      await window.electronAPI[config.restoreApi](itemId);

      this.app.showToast('已恢复', 'success');
      
      // 重新加载回收站
      await this.loadTrash();
      
      // 刷新主界面数据
      if (itemType === 'prompt' && this.app.promptPanelManager) {
        await this.app.promptPanelManager.loadData();
        await this.app.promptPanelManager.renderView();
        await this.app.promptPanelManager.renderTagFilters();
        this.app.eventBus?.emit('promptsChanged');
      } else if (itemType === 'image' && this.app.imagePanelManager) {
        await this.app.imagePanelManager.loadData();
        await this.app.imagePanelManager.renderView();
        await this.app.imagePanelManager.renderTagFilters();
        this.app.eventBus?.emit('imagesChanged');
      }
      
      // 刷新统计界面
      if (this.app.currentPanel === 'statistics') {
        await this.app.renderStatistics();
      }
      
      // 通知事件
      this.eventBus.emit('itemRestored', {
        id: itemId,
        type: itemType
      });
    } catch (error) {
      window.electronAPI.logError('TrashManager.js', 'Failed to restore item:', error);
      this.app.showToast('恢复失败', 'error');
    }
  }

  /**
   * 永久删除项目
   * @param {string} itemId - 项目 ID
   * @param {string} itemType - 项目类型
   */
  async permanentlyDeleteItem(itemId, itemType) {
    const confirmed = await DialogService.showConfirmDialogByConfig({
      ...DialogConfig.PERMANENT_DELETE,
      data: { type: itemType }
    });

    if (!confirmed) return;

    try {
      const config = TrashManager.TRASH_CONFIG[itemType];
      await window.electronAPI[config.deleteApi](itemId);

      this.app.showToast('已永久删除', 'success');

      // 重新加载回收站
      await this.loadTrash();

      // 刷新主界面数据（如果是从主界面删除的）
      if (itemType === 'prompt' && this.app.promptPanelManager) {
        await this.app.promptPanelManager.loadData();
        await this.app.promptPanelManager.renderView();
        await this.app.promptPanelManager.renderTagFilters();
        this.app.eventBus?.emit('promptsChanged');
      } else if (itemType === 'image' && this.app.imagePanelManager) {
        await this.app.imagePanelManager.loadData();
        await this.app.imagePanelManager.renderView();
        await this.app.imagePanelManager.renderTagFilters();
        this.app.eventBus?.emit('imagesChanged');
      }

      // 刷新统计界面
      if (this.app.currentPanel === 'statistics') {
        await this.app.renderStatistics();
      }
    } catch (error) {
      window.electronAPI.logError('TrashManager.js', 'Failed to permanently delete item:', error);
      this.app.showToast('删除失败', 'error');
    }
  }

  /**
   * 清空回收站
   */
  async clearTrash() {
    try {
      const config = TrashManager.TRASH_CONFIG[this.currentType];
      await window.electronAPI[config.emptyApi]();
      this.app.showToast('回收站已清空', 'success');

      await this.loadTrash();

      if (this.currentType === 'prompt') {
        this.app.eventBus?.emit('promptsChanged');
      } else if (this.currentType === 'image') {
        this.app.eventBus?.emit('imagesChanged');
      }
    } catch (error) {
      window.electronAPI.logError('TrashManager.js', 'Failed to clear trash:', error);
      this.app.showToast('清空失败', 'error');
    }
  }

  /**
   * 添加到回收站（内部使用）
   * @param {Object} item - 项目信息
   */
  async addItem(item) {
    this.trashItems.unshift({
      ...item,
      deletedAt: localTime()
    });
    await this.renderTrashList();
  }

  /**
   * 获取回收站项目数量
   * @returns {number} 项目数量
   */
  getCount() {
    return this.trashItems.length;
  }

  /**
   * 获取回收站项目
   * @returns {Array} 项目列表
   */
  getItems() {
    return this.trashItems;
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.trashItems = [];
    this.filter = 'all';
  }

  /**
   * 打开回收站
   * @param {string} type - 类型 ('prompt' | 'image')
   */
  async open(type = 'prompt') {
    this.currentType = type;
    await this.loadTrash();
    this.app.modalManager?.openTrashModal(type);
  }

  /**
   * 关闭回收站
   */
  close() {
    this.app.modalManager?.closeTrashModal(this.currentType);
  }

  /**
   * 清空回收站
   */
  async empty() {
    const confirmed = await DialogService.showConfirmDialogByConfig({
      ...DialogConfig.EMPTY_TRASH,
      data: { type: this.currentType }
    });
    if (!confirmed) return;

    try {
      const config = TrashManager.TRASH_CONFIG[this.currentType];
      await window.electronAPI[config.emptyApi]();
      this.app.showToast('回收站已清空', 'success');
      await this.loadTrash();
    } catch (error) {
      window.electronAPI.logError('TrashManager.js', 'Failed to empty recycle bin:', error);
      this.app.showToast('清空回收站失败', 'error');
    }
  }
}

export default TrashManager;
