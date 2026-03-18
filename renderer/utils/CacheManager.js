import { LRUCache } from './LRUCache.js';

/**
 * 全局缓存管理器
 * 集中管理应用中的所有缓存，提供统一的缓存接口
 */
export class CacheManager {
  constructor() {
    this.caches = new Map();
    this.defaultMaxSize = 100;
  }

  /**
   * 创建或获取命名缓存
   * @param {string} name - 缓存名称
   * @param {number} maxSize - 最大缓存条目数
   * @returns {LRUCache} - LRU 缓存实例
   */
  createCache(name, maxSize = this.defaultMaxSize) {
    if (!this.caches.has(name)) {
      const cache = new LRUCache(maxSize);
      this.caches.set(name, cache);
    }
    return this.caches.get(name);
  }

  /**
   * 获取已存在的缓存
   * @param {string} name - 缓存名称
   * @returns {LRUCache|undefined} - 缓存实例或 undefined
   */
  getCache(name) {
    return this.caches.get(name);
  }

  /**
   * 删除指定缓存
   * @param {string} name - 缓存名称
   * @returns {boolean}
   */
  deleteCache(name) {
    const cache = this.caches.get(name);
    if (cache) {
      cache.clear();
      return this.caches.delete(name);
    }
    return false;
  }

  /**
   * 清空所有缓存
   */
  clearAll() {
    this.caches.forEach(cache => cache.clear());
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} - 各缓存的大小统计
   */
  getStats() {
    const stats = {};
    this.caches.forEach((cache, name) => {
      stats[name] = cache.size;
    });
    return stats;
  }

  // ==================== 图像路径缓存快捷方法 ====================

  /**
   * 获取图像路径缓存
   * @returns {LRUCache}
   */
  getImagePathCache() {
    return this.createCache('imagePaths', 200);
  }

  /**
   * 获取图像完整路径
   * @param {string} imageId - 图像 ID
   * @param {string} type - 路径类型: 'original' | 'thumbnail'
   * @returns {string|undefined}
   */
  getImagePath(imageId, type = 'original') {
    const cache = this.getImagePathCache();
    return cache.get(`${type}_${imageId}`);
  }

  /**
   * 设置图像完整路径
   * @param {string} imageId - 图像 ID
   * @param {string} type - 路径类型: 'original' | 'thumbnail'
   * @param {string} path - 完整路径
   */
  setImagePath(imageId, type, path) {
    const cache = this.getImagePathCache();
    cache.set(`${type}_${imageId}`, path);
  }

  /**
   * 清除图像路径缓存
   * @param {string} imageId - 图像 ID（可选，不提供则清除所有）
   */
  clearImagePathCache(imageId) {
    const cache = this.getImagePathCache();
    if (imageId) {
      cache.delete(`original_${imageId}`);
      cache.delete(`thumbnail_${imageId}`);
    } else {
      cache.clear();
    }
  }

  // ==================== 数据对象缓存快捷方法 ====================

  /**
   * 获取提示词缓存
   * @returns {LRUCache}
   */
  getPromptCache() {
    return this.createCache('prompts', 500);
  }

  /**
   * 获取图像缓存
   * @returns {LRUCache}
   */
  getImageCache() {
    return this.createCache('images', 500);
  }

  /**
   * 缓存单个提示词
   * @param {Object} prompt - 提示词对象
   */
  cachePrompt(prompt) {
    if (prompt && prompt.id) {
      this.getPromptCache().set(String(prompt.id), prompt);
    }
  }

  /**
   * 缓存单个图像
   * @param {Object} image - 图像对象
   */
  cacheImage(image) {
    if (image && image.id) {
      this.getImageCache().set(String(image.id), image);
    }
  }

  /**
   * 批量缓存提示词
   * @param {Array} prompts - 提示词数组
   */
  cachePrompts(prompts) {
    const cache = this.getPromptCache();
    prompts.forEach(prompt => {
      if (prompt && prompt.id) {
        cache.set(String(prompt.id), prompt);
      }
    });
  }

  /**
   * 批量缓存图像
   * @param {Array} images - 图像数组
   */
  cacheImages(images) {
    const cache = this.getImageCache();
    images.forEach(image => {
      if (image && image.id) {
        cache.set(String(image.id), image);
      }
    });
  }

  /**
   * 从缓存获取提示词
   * @param {string} id - 提示词 ID
   * @returns {Object|undefined}
   */
  getCachedPrompt(id) {
    return this.getPromptCache().get(String(id));
  }

  /**
   * 从缓存获取图像
   * @param {string} id - 图像 ID
   * @returns {Object|undefined}
   */
  getCachedImage(id) {
    return this.getImageCache().get(String(id));
  }
}

// 导出单例实例
export const cacheManager = new CacheManager();

export default CacheManager;
