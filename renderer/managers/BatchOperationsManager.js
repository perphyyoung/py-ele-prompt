import { isSameId } from '../utils/isSameId.js';
import { cacheManager } from '../utils/CacheManager.js';
import { DialogService, DialogConfig } from '../services/DialogService.js';

/**
 * 批量操作策略基类
 */
class BatchOperationStrategy {
  async delete(id) {
    throw new Error('delete() must be implemented by subclass');
  }

  async addTag(id, tagName) {
    throw new Error('addTag() must be implemented by subclass');
  }

  async setSafe(id, isSafe) {
    throw new Error('setSafe() must be implemented by subclass');
  }

  getCache() {
    throw new Error('getCache() must be implemented by subclass');
  }
}

/**
 * Prompt 批量操作策略
 */
class PromptBatchStrategy extends BatchOperationStrategy {
  constructor(app) {
    super();
    this.app = app;
  }

  async delete(id) {
    await window.electronAPI.softDeletePrompt(id);
  }

  async addTag(id, tagName) {
    const prompt = cacheManager.getCachedPrompt(id);
    if (prompt) {
      const tags = prompt.tags ? [...prompt.tags] : [];
      if (!tags.includes(tagName)) {
        tags.push(tagName);
        await window.electronAPI.updatePrompt(id, { tags });
      }
    }
  }

  async setSafe(id, isSafe) {
    await window.electronAPI.updatePrompt(id, { isSafe: isSafe ? 1 : 0 });
  }

  getCache() {
    return this.app.promptCache;
  }
}

/**
 * Image 批量操作策略
 */
class ImageBatchStrategy extends BatchOperationStrategy {
  constructor(app) {
    super();
    this.app = app;
  }

  async delete(id) {
    await window.electronAPI.deleteImage(id);
  }

  async addTag(id, tagName) {
    const image = cacheManager.getCachedImage(id);
    if (image) {
      const tags = image.tags ? [...image.tags] : [];
      if (!tags.includes(tagName)) {
        tags.push(tagName);
        await window.electronAPI.updateImage(id, { tags });
      }
    }
  }

  async setSafe(id, isSafe) {
    await window.electronAPI.updateImage(id, { isSafe: isSafe ? 1 : 0 });
  }

  getCache() {
    return this.app.imageCache;
  }
}

/**
 * 批量操作管理器
 * 管理批量选择、批量删除、批量修改标签等操作
 */
export class BatchOperationsManager {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {Object} options.app - 主应用引用
   * @param {Object} options.eventBus - 事件总线
   */
  constructor(options) {
    this.app = options.app;
    this.eventBus = options.eventBus;
    this.selectedItems = new Map(); // Map<id, type>
    this.isSelecting = false;
    this.strategies = {
      prompt: new PromptBatchStrategy(options.app),
      image: new ImageBatchStrategy(options.app)
    };
  }

  /**
   * 初始化
   */
  init() {
    this.bindEvents();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 批量工具栏按钮
    document.getElementById('batchDeleteBtn')?.addEventListener('click', () => {
      this.confirmBatchDelete();
    });

    document.getElementById('batchAddTagBtn')?.addEventListener('click', () => {
      this.showBatchAddTagModal();
    });

    document.getElementById('batchSetSafeBtn')?.addEventListener('click', () => {
      this.batchSetSafe(true);
    });

    document.getElementById('batchSetUnsafeBtn')?.addEventListener('click', () => {
      this.batchSetSafe(false);
    });

    document.getElementById('batchCancelBtn')?.addEventListener('click', () => {
      this.cancelBatchSelection();
    });

    // Ctrl 键按下/松开
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Control') {
        this.isSelecting = true;
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Control') {
        this.isSelecting = false;
      }
    });
  }

  /**
   * 选择项目
   * @param {string} id - 项目 ID
   * @param {string} type - 类型 (prompt/image)
   * @param {boolean} toggle - 是否切换选择状态
   */
  selectItem(id, type, toggle = false) {
    if (toggle) {
      if (this.selectedItems.has(id)) {
        this.selectedItems.delete(id);
      } else {
        this.selectedItems.set(id, type);
      }
    } else {
      this.selectedItems.set(id, type);
    }

    this.updateBatchToolbar();
    this.updateItemSelectionUI(id, this.selectedItems.has(id));
  }

  /**
   * 取消选择项目
   * @param {string} id - 项目 ID
   */
  deselectItem(id) {
    this.selectedItems.delete(id);
    this.updateBatchToolbar();
    this.updateItemSelectionUI(id, false);
  }

  /**
   * 全选当前列表
   * @param {Array} items - 项目列表
   */
  selectAll(items) {
    items.forEach(item => {
      this.selectedItems.set(item.id, item.type || 'prompt');
    });
    this.updateBatchToolbar();
    this.updateAllSelectionUI(items, true);
  }

  /**
   * 取消全选
   * @param {Array} items - 项目列表
   */
  deselectAll(items) {
    items.forEach(item => {
      this.selectedItems.delete(item.id);
    });
    this.updateBatchToolbar();
    this.updateAllSelectionUI(items, false);
  }

  /**
   * 更新批量工具栏
   */
  updateBatchToolbar() {
    const count = this.selectedItems.size;
    const toolbar = document.getElementById('batchToolbar');
    const countEl = document.getElementById('batchSelectedCount');

    if (count === 0) {
      if (toolbar) toolbar.classList.remove('active');
    } else {
      if (toolbar) toolbar.classList.add('active');
      if (countEl) countEl.textContent = count;
    }
  }

  /**
   * 更新项目选择 UI
   * @param {string} id - 项目 ID
   * @param {boolean} selected - 是否选中
   */
  updateItemSelectionUI(id, selected) {
    const card = document.querySelector(`[data-id="${id}"]`);
    if (card) {
      if (selected) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    }
  }

  /**
   * 更新所有项目选择 UI
   * @param {Array} items - 项目列表
   * @param {boolean} selected - 是否选中
   */
  updateAllSelectionUI(items, selected) {
    items.forEach(item => {
      this.updateItemSelectionUI(item.id, selected);
    });
  }

  /**
   * 确认批量删除
   */
  async confirmBatchDelete() {
    const count = this.selectedItems.size;
    if (count === 0) return;

    const confirmed = await DialogService.showConfirmDialogByConfig({
      ...DialogConfig.BATCH_DELETE,
      data: { count }
    });

    if (!confirmed) return;

    await this.batchDelete();
  }

  /**
   * 批量删除
   */
  async batchDelete() {
    const successIds = [];
    const failedIds = [];

    try {
      const firstType = Array.from(this.selectedItems.values())[0];
      const strategy = this.strategies[firstType];

      for (const [id, type] of this.selectedItems.entries()) {
        try {
          await strategy.delete(id);
          successIds.push(id);
        } catch (error) {
          window.electronAPI.logError('BatchOperationsManager.js', `Failed to delete ${id}:`, error);
          failedIds.push(id);
        }
      }

      const cache = strategy.getCache();
      successIds.forEach(id => {
        cache.delete(String(id));
      });

      this.app.showToast(`已删除 ${successIds.length} 个项目`, 'success');

      // 通知事件
      this.eventBus.emit('batchDeleteCompleted', {
        successIds,
        failedIds
      });

      // 清空选择
      this.selectedItems.clear();
      this.updateBatchToolbar();

      // 重新渲染列表
      this.app.promptPanelManager?.renderView();
      this.app.imagePanelManager?.renderView();
    } catch (error) {
      window.electronAPI.logError('BatchOperationsManager.js', 'Batch delete failed:', error);
      this.app.showToast('批量删除失败', 'error');
    }
  }

  /**
   * 显示批量添加标签模态框
   */
  showBatchAddTagModal() {
    const count = this.selectedItems.size;
    if (count === 0) {
      this.app.showToast('请先选择项目', 'info');
      return;
    }

    const modal = document.getElementById('batchAddTagModal');
    if (!modal) {
      window.electronAPI.logError('BatchOperationsManager.js', 'Batch add tag modal not found');
      return;
    }

    document.getElementById('batchTagCount').textContent = count;
    document.getElementById('batchTagName').value = '';

    modal.classList.add('active');
  }

  /**
   * 批量添加标签
   * @param {string} tagName - 标签名称
   */
  async batchAddTag(tagName) {
    if (!tagName) {
      this.app.showToast('标签名称不能为空', 'error');
      return;
    }

    const count = this.selectedItems.size;
    let successCount = 0;
    let failedCount = 0;

    try {
      const firstType = Array.from(this.selectedItems.values())[0];
      const strategy = this.strategies[firstType];

      for (const [id, type] of this.selectedItems.entries()) {
        try {
          await strategy.addTag(id, tagName);
          successCount++;
        } catch (error) {
          window.electronAPI.logError('BatchOperationsManager.js', `Failed to add tag to ${id}:`, error);
          failedCount++;
        }
      }

      this.app.showToast(`已为 ${successCount} 个项目添加标签`, 'success');

      // 关闭模态框
      const modal = document.getElementById('batchAddTagModal');
      if (modal) {
        modal.classList.remove('active');
      }

      // 清空选择
      this.selectedItems.clear();
      this.updateBatchToolbar();

      // 重新渲染列表
      this.app.promptPanelManager?.renderView();
      this.app.imagePanelManager?.renderView();
    } catch (error) {
      window.electronAPI.logError('BatchOperationsManager.js', 'Batch add tag failed:', error);
      this.app.showToast('批量添加标签失败', 'error');
    }
  }

  /**
   * 批量设置安全状态
   * @param {boolean} isSafe - 是否安全
   */
  async batchSetSafe(isSafe) {
    const count = this.selectedItems.size;
    if (count === 0) return;

    let successCount = 0;
    let failedCount = 0;

    try {
      const firstType = Array.from(this.selectedItems.values())[0];
      const strategy = this.strategies[firstType];

      for (const [id, type] of this.selectedItems.entries()) {
        try {
          await strategy.setSafe(id, isSafe);
          successCount++;
        } catch (error) {
          window.electronAPI.logError('BatchOperationsManager.js', `Failed to set safe status for ${id}:`, error);
          failedCount++;
        }
      }

      this.app.showToast(`已设置 ${successCount} 个项目为${isSafe ? '安全' : '不安全'}`, 'success');

      // 清空选择
      this.selectedItems.clear();
      this.updateBatchToolbar();

      // 重新渲染列表
      this.app.promptPanelManager?.renderView();
      this.app.imagePanelManager?.renderView();

      // 通知事件
      this.eventBus.emit('safeRatingChanged', {
        targetType: 'batch',
        isSafe
      });
    } catch (error) {
      window.electronAPI.logError('BatchOperationsManager.js', 'Batch set safe status failed:', error);
      this.app.showToast('批量设置安全状态失败', 'error');
    }
  }

  /**
   * 取消批量选择
   */
  cancelBatchSelection() {
    const items = Array.from(this.selectedItems.entries());
    
    // 清除 UI 选择状态
    items.forEach(([id]) => {
      this.updateItemSelectionUI(id, false);
    });

    // 清空选择
    this.selectedItems.clear();
    this.updateBatchToolbar();
  }

  /**
   * 获取选中项目数量
   * @returns {number} 数量
   */
  getCount() {
    return this.selectedItems.size;
  }

  /**
   * 获取选中项目列表
   * @returns {Array} 项目列表
   */
  getSelectedItems() {
    return Array.from(this.selectedItems.entries());
  }

  /**
   * 是否正在选择
   * @returns {boolean} 是否正在选择
   */
  isSelectingMode() {
    return this.isSelecting;
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.selectedItems.clear();
    this.isSelecting = false;
  }
}

export default BatchOperationsManager;
