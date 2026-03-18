/**
 * LRU (Least Recently Used) 缓存实现
 * 限制缓存大小，自动淘汰最久未使用的数据
 */
export class LRUCache {
  /**
   * @param {number} maxSize - 最大缓存条目数
   */
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * 获取缓存值
   * @param {string} key - 缓存键
   * @returns {any|undefined} - 缓存值或 undefined
   */
  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移动到最新（先删除再添加）
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  /**
   * 设置缓存值
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   */
  set(key, value) {
    if (this.cache.has(key)) {
      // 已存在则删除旧值
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 超出容量，删除最旧的（Map 的第一个键）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  /**
   * 检查键是否存在
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 删除指定键
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取当前缓存大小
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }

  /**
   * 获取所有键
   * @returns {Iterator<string>}
   */
  keys() {
    return this.cache.keys();
  }

  /**
   * 获取所有值
   * @returns {Iterator<any>}
   */
  values() {
    return this.cache.values();
  }

  /**
   * 遍历缓存
   * @param {Function} callback - 回调函数 (value, key) => void
   */
  forEach(callback) {
    this.cache.forEach(callback);
  }
}

export default LRUCache;
