/**
 * 事件总线
 * 用于模块间通信和解耦
 */
class EventBus {
  constructor() {
    this.events = new Map();
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);

    // 返回取消订阅函数
    return () => this.off(event, callback);
  }

  /**
   * 取消订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (!this.events.has(event)) return;
    this.events.get(event).delete(callback);
    
    // 如果没有订阅者，删除事件
    if (this.events.get(event).size === 0) {
      this.events.delete(event);
    }
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {any} data - 事件数据
   */
  emit(event, data) {
    if (!this.events.has(event)) return;
    
    this.events.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`EventBus: Error in event handler for "${event}":`, error);
      }
    });
  }

  /**
   * 清除所有事件
   */
  clear() {
    this.events.clear();
  }

  /**
   * 获取事件订阅者数量
   * @param {string} event - 事件名称
   * @returns {number} 订阅者数量
   */
  listenerCount(event) {
    if (!this.events.has(event)) return 0;
    return this.events.get(event).size;
  }
}

export default EventBus;
