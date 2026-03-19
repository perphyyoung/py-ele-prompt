import { isSameId } from '../utils/isSameId.js';

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

    const confirmed = await this.app.showConfirm(
      `确定要删除选中的 ${count} 个项目吗？\n删除后可在回收站恢复。`
    );

    if (!confirmed) return;

    await this.batchDelete();
  }

  /**
   * 批量删除
   */
  async batchDelete() {
    const ids = Array.from(this.selectedItems.keys());
    const successIds = [];
    const failedIds = [];

    try {
      for (const [id, type] of this.selectedItems.entries()) {
        try {
          if (type === 'prompt') {
            await window.electronAPI.deletePrompt(id);
          } else {
            await window.electronAPI.deleteImage(id);
          }
          successIds.push(id);
        } catch (error) {
          console.error(`Failed to delete ${id}:`, error);
          failedIds.push(id);
        }
      }

      // 从本地数据中移除
      this.removeFromLocalData(successIds);

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
      this.app.promptPanelManager?.render();
      this.app.imagePanelManager?.render();
    } catch (error) {
      console.error('Batch delete failed:', error);
      this.app.showToast('批量删除失败', 'error');
    }
  }

  /**
   * 从本地数据移除
   * @param {Array} ids - ID 列表
   */
  removeFromLocalData(ids) {
    // 从 prompts 中移除
    this.app.prompts = this.app.prompts.filter(p => !ids.includes(String(p.id)));
    // 从 images 中移除
    this.app.images = this.app.images.filter(i => !ids.includes(String(i.id)));
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
      console.error('Batch add tag modal not found');
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
    const successCount = { prompt: 0, image: 0 };
    const failedCount = { prompt: 0, image: 0 };

    try {
      for (const [id, type] of this.selectedItems.entries()) {
        try {
          if (type === 'prompt') {
            const prompt = this.app.prompts.find(p => isSameId(p.id, id));
            if (prompt) {
              const tags = prompt.tags ? [...prompt.tags] : [];
              if (!tags.includes(tagName)) {
                tags.push(tagName);
                await window.electronAPI.updatePrompt(id, { tags });
              }
            }
            successCount.prompt++;
          } else {
            const image = this.app.images.find(i => isSameId(i.id, id));
            if (image) {
              const tags = image.tags ? [...image.tags] : [];
              if (!tags.includes(tagName)) {
                tags.push(tagName);
                await window.electronAPI.updateImageTags(id, tags);
              }
            }
            successCount.image++;
          }
        } catch (error) {
          console.error(`Failed to add tag to ${id}:`, error);
          if (type === 'prompt') {
            failedCount.prompt++;
          } else {
            failedCount.image++;
          }
        }
      }

      const totalSuccess = successCount.prompt + successCount.image;
      this.app.showToast(`已为 ${totalSuccess} 个项目添加标签`, 'success');

      // 关闭模态框
      const modal = document.getElementById('batchAddTagModal');
      if (modal) {
        modal.classList.remove('active');
      }

      // 清空选择
      this.selectedItems.clear();
      this.updateBatchToolbar();

      // 重新渲染列表
      this.app.promptPanelManager?.render();
      this.app.imagePanelManager?.render();
    } catch (error) {
      console.error('Batch add tag failed:', error);
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

    const successCount = { prompt: 0, image: 0 };
    const failedCount = { prompt: 0, image: 0 };

    try {
      for (const [id, type] of this.selectedItems.entries()) {
        try {
          if (type === 'prompt') {
            await window.electronAPI.updatePrompt(id, { isSafe: isSafe ? 1 : 0 });
            successCount.prompt++;
          } else {
            await window.electronAPI.updateImage(id, { isSafe: isSafe ? 1 : 0 });
            successCount.image++;
          }
        } catch (error) {
          console.error(`Failed to set safe status for ${id}:`, error);
          if (type === 'prompt') {
            failedCount.prompt++;
          } else {
            failedCount.image++;
          }
        }
      }

      const totalSuccess = successCount.prompt + successCount.image;
      this.app.showToast(`已设置 ${totalSuccess} 个项目为${isSafe ? '安全' : '不安全'}`, 'success');

      // 清空选择
      this.selectedItems.clear();
      this.updateBatchToolbar();

      // 重新渲染列表
      this.app.promptPanelManager?.render();
      this.app.imagePanelManager?.render();

      // 通知事件
      this.eventBus.emit('safeRatingChanged', {
        targetType: 'batch',
        isSafe
      });
    } catch (error) {
      console.error('Batch set safe status failed:', error);
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
