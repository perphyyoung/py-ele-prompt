/**
 * 列表渲染器
 * 提供通用的列表渲染方法，支持网格、列表、紧凑三种视图模式
 */
export class ListRenderer {
  /**
   * 渲染网格视图
   * @param {Array} items - 项目数组
   * @param {Function} renderItem - 渲染单个项目的函数 (item, index) => string
   * @param {string} containerId - 容器元素 ID
   */
  static renderGrid(items, renderItem, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = items.map((item, index) => renderItem(item, index)).join('');
  }

  /**
   * 渲染列表视图
   * @param {Array} items - 项目数组
   * @param {Function} renderItem - 渲染单个项目的函数 (item, index) => string
   * @param {string} containerId - 容器元素 ID
   */
  static renderList(items, renderItem, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = items.map((item, index) => renderItem(item, index)).join('');
  }

  /**
   * 渲染紧凑列表视图
   * @param {Array} items - 项目数组
   * @param {Function} renderItem - 渲染单个项目的函数 (item, index) => string
   * @param {string} containerId - 容器元素 ID
   */
  static renderCompactList(items, renderItem, containerId) {
    return ListRenderer.renderList(items, renderItem, containerId);
  }

  /**
   * 更新列表项的选中状态
   * @param {HTMLElement} container - 容器元素
   * @param {Set} selectedIds - 选中的 ID 集合
   */
  static updateSelectionState(container, selectedIds) {
    if (!container) return;

    const items = container.querySelectorAll('[data-id], [data-image-id], [data-prompt-id]');
    items.forEach(item => {
      const id = item.dataset.id || item.dataset.imageId || item.dataset.promptId;
      if (id) {
        const isSelected = selectedIds.has(id);
        item.classList.toggle('is-selected', isSelected);
        
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = isSelected;
        }
      }
    });
  }

  /**
   * 批量更新列表项的某个属性
   * @param {HTMLElement} container - 容器元素
   * @param {string} selector - 选择器
   * @param {string} attribute - 属性名
   * @param {any} value - 属性值
   */
  static updateItemsAttribute(container, selector, attribute, value) {
    if (!container) return;
    
    const items = container.querySelectorAll(selector);
    items.forEach(item => {
      item.setAttribute(attribute, value);
    });
  }

  /**
   * 为列表项绑定点击事件
   * @param {HTMLElement} container - 容器元素
   * @param {string} selector - 选择器
   * @param {Function} handler - 事件处理函数
   */
  static bindItemClickEvents(container, selector, handler) {
    if (!container) return;

    container.querySelectorAll(selector).forEach(item => {
      item.addEventListener('click', handler);
    });
  }

  /**
   * 为列表项绑定悬停事件
   * @param {HTMLElement} container - 容器元素
   * @param {string} selector - 选择器
   * @param {Function} enterHandler - mouseenter 处理函数
   * @param {Function} leaveHandler - mouseleave 处理函数
   */
  static bindItemHoverEvents(container, selector, enterHandler, leaveHandler) {
    if (!container) return;

    container.querySelectorAll(selector).forEach(item => {
      if (enterHandler) {
        item.addEventListener('mouseenter', enterHandler);
      }
      if (leaveHandler) {
        item.addEventListener('mouseleave', leaveHandler);
      }
    });
  }

  /**
   * 异步加载背景图片
   * @param {HTMLElement} container - 容器元素
   * @param {string} selector - 背景元素选择器
   * @param {Function} getPathFn - 获取图片路径的函数
   */
  static async loadBackgroundImages(container, selector, getPathFn) {
    if (!container) return;

    const elements = container.querySelectorAll(selector);
    for (const el of elements) {
      const path = getPathFn(el);
      if (!path) continue;
      
      try {
        const fullPath = await window.electronAPI.getImagePath(path);
        el.style.backgroundImage = `url('file://${fullPath.replace(/\\/g, '/')}')`;
      } catch (error) {
        console.error('Failed to load background image:', error);
      }
    }
  }

  /**
   * 清空列表并显示空状态
   * @param {string} containerId - 容器元素 ID
   * @param {string} emptyStateId - 空状态元素 ID
   * @param {string} message - 空状态消息
   */
  static showEmptyState(containerId, emptyStateId, message = '暂无数据') {
    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);
    
    if (container) container.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'flex';
      const p = emptyState.querySelector('p');
      if (p) p.textContent = message;
    }
  }

  /**
   * 隐藏空状态并显示列表
   * @param {string} containerId - 容器元素 ID
   * @param {string} emptyStateId - 空状态元素 ID
   */
  static hideEmptyState(containerId, emptyStateId) {
    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);
    
    if (container) container.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';
  }
}

export default ListRenderer;
