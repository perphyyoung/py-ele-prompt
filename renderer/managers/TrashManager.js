/**
 * 回收站管理器
 * 管理已删除的提示词和图像，支持恢复和永久删除
 */
export class TrashManager {
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
  }

  /**
   * 初始化回收站
   */
  async init() {
    await this.loadTrash();
    this.bindEvents();
  }

  /**
   * 加载回收站列表
   */
  async loadTrash() {
    try {
      this.trashItems = await window.electronAPI.getTrashItems();
      this.renderTrashList();
      this.eventBus.emit('trashLoaded', { items: this.trashItems });
    } catch (error) {
      console.error('Failed to load trash:', error);
      this.app.showToast('加载回收站失败', 'error');
    }
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 清空回收站按钮
    const clearBtn = document.getElementById('emptyRecycleBinBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.confirmClearTrash());
    }
  }

  /**
   * 渲染回收站列表
   */
  renderTrashList() {
    const container = document.getElementById('recycleBinList');
    if (!container) return;

    if (this.trashItems.length === 0) {
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

    container.innerHTML = this.trashItems.map(item => this.renderTrashItem(item)).join('');
    this.bindTrashItemEvents();
    this.loadCardBackgrounds();
  }

  /**
   * 渲染回收站项
   * @param {Object} item - 回收站项
   * @returns {string} HTML 字符串
   */
  renderTrashItem(item) {
    const date = new Date(item.deletedAt);
    const dateStr = date.toLocaleString('zh-CN');
    
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
   * 绑定回收站项事件
   */
  bindTrashItemEvents() {
    const items = document.querySelectorAll('.recycle-bin-card');
    
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
   * 异步加载卡片背景图
   */
  async loadCardBackgrounds() {
    const container = document.getElementById('recycleBinList');
    if (!container) return;

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
        console.error('Failed to load recycle bin card background:', error);
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
      if (itemType === 'prompt') {
        await window.electronAPI.restoreFromRecycleBin(itemId);
      } else if (itemType === 'image') {
        await window.electronAPI.restoreImage(itemId);
      }

      this.app.showToast('已恢复', 'success');
      
      // 重新加载回收站
      await this.loadTrash();
      
      // 刷新主界面数据
      if (itemType === 'prompt' && this.app.promptPanelManager) {
        await this.app.promptPanelManager.loadPrompts();
        await this.app.promptPanelManager.renderList();
        await this.app.promptPanelManager.renderTagFilters();
      } else if (itemType === 'image' && this.app.imagePanelManager) {
        await this.app.imagePanelManager.loadImages();
        await this.app.imagePanelManager.renderGrid();
        await this.app.imagePanelManager.renderTagFilters();
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
      console.error('Failed to restore item:', error);
      this.app.showToast('恢复失败', 'error');
    }
  }

  /**
   * 永久删除项目
   * @param {string} itemId - 项目 ID
   * @param {string} itemType - 项目类型
   */
  async permanentlyDeleteItem(itemId, itemType) {
    const confirmed = await this.app.showConfirm(
      '确定要永久删除此项吗？\n此操作不可恢复！'
    );

    if (!confirmed) return;

    try {
      if (itemType === 'prompt') {
        await window.electronAPI.permanentlyDelete(itemId);
      } else if (itemType === 'image') {
        await window.electronAPI.permanentDeleteImage(itemId);
      }

      this.app.showToast('已永久删除', 'success');
      
      // 重新加载回收站
      await this.loadTrash();
      
      // 刷新主界面数据（如果是从主界面删除的）
      if (itemType === 'prompt' && this.app.promptPanelManager) {
        await this.app.promptPanelManager.loadPrompts();
        await this.app.promptPanelManager.renderList();
        await this.app.promptPanelManager.renderTagFilters();
      } else if (itemType === 'image' && this.app.imagePanelManager) {
        await this.app.imagePanelManager.loadImages();
        await this.app.imagePanelManager.renderGrid();
        await this.app.imagePanelManager.renderTagFilters();
      }
      
      // 刷新统计界面
      if (this.app.currentPanel === 'statistics') {
        await this.app.renderStatistics();
      }
    } catch (error) {
      console.error('Failed to permanently delete item:', error);
      this.app.showToast('删除失败', 'error');
    }
  }

  /**
   * 确认清空回收站
   */
  async confirmClearTrash() {
    if (this.trashItems.length === 0) {
      this.app.showToast('回收站已经是空的', 'info');
      return;
    }

    const confirmed = await this.app.showConfirm(
      `确定要清空回收站吗？\n将永久删除所有 ${this.trashItems.length} 个项目，此操作不可恢复！`
    );

    if (!confirmed) return;

    await this.clearTrash();
  }

  /**
   * 清空回收站
   */
  async clearTrash() {
    try {
      await window.electronAPI.clearTrash();
      this.app.showToast('回收站已清空', 'success');
      
      // 重新加载
      await this.loadTrash();
    } catch (error) {
      console.error('Failed to clear trash:', error);
      this.app.showToast('清空失败', 'error');
    }
  }

  /**
   * 添加到回收站（内部使用）
   * @param {Object} item - 项目信息
   */
  addItem(item) {
    this.trashItems.unshift({
      ...item,
      deletedAt: new Date().toISOString()
    });
    this.renderTrashList();
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
}

export default TrashManager;
