import { cacheManager } from './CacheManager.js';

/**
 * 保存策略接口
 * @interface
 */
export class SaveStrategy {
  /**
   * 执行保存
   * @param {string} itemId - 项目ID
   * @param {string} fieldName - 字段名
   * @param {any} value - 字段值
   * @returns {Promise<Object>} 保存结果
   */
  async save(itemId, fieldName, value) {
    throw new Error('SaveStrategy.save() must be implemented by subclass');
  }

  /**
   * 获取成功提示消息
   * @param {string} fieldName - 字段名
   * @param {any} value - 字段值
   * @returns {string} 提示消息
   */
  getSuccessMessage(fieldName, value) {
    return 'Saved';
  }

  /**
   * 获取字段值
   * @param {HTMLElement} element - 表单元素
   * @returns {any} 字段值
   */
  getFieldValue(element) {
    if (!element) return null;

    const tagName = element.tagName.toLowerCase();
    const type = element.type;

    if (tagName === 'input' && type === 'checkbox') {
      return element.checked;
    } else if (tagName === 'select' && element.multiple) {
      return Array.from(element.selectedOptions).map(opt => opt.value);
    } else {
      return element.value;
    }
  }
}

/**
 * 提示词保存策略
 */
export class PromptSaveStrategy extends SaveStrategy {
  constructor(app) {
    super();
    this.app = app;
  }

  async save(itemId, fieldName, value) {
    const updateData = { [fieldName]: value };
    await window.electronAPI.updatePrompt(itemId, updateData);

    // Update cache
    const cachedPrompt = cacheManager.getCachedPrompt(itemId);
    if (cachedPrompt) {
      cachedPrompt[fieldName] = value;
    }

    return { success: true };
  }

  getSuccessMessage(fieldName, value) {
    const messages = {
      'isSafe': value ? 'Marked as safe' : 'Marked as unsafe',
      'isFavorite': value ? 'Added to favorites' : 'Removed from favorites',
      'title': 'Title saved',
      'content': 'Content saved',
      'contentTranslate': 'Translation saved',
      'note': 'Note saved'
    };
    return messages[fieldName] || 'Saved';
  }
}

/**
 * 图像保存策略
 */
export class ImageSaveStrategy extends SaveStrategy {
  constructor(app) {
    super();
    this.app = app;
  }

  async save(itemId, fieldName, value) {
    const updateData = { [fieldName]: value };

    // Call different APIs based on field type
    if (fieldName === 'tags') {
      await window.electronAPI.updateImageTags(itemId, value);
    } else if (fieldName === 'note') {
      await window.electronAPI.updateImageNote(itemId, value);
    } else if (fieldName === 'fileName') {
      await window.electronAPI.updateImageFileName(itemId, value);
    } else if (fieldName === 'isSafe') {
      const safeValue = value ? 1 : 0;
      await window.electronAPI.updateImageSafeStatus(itemId, safeValue);
    } else if (fieldName === 'isFavorite') {
      await window.electronAPI.updateImageFavStatus(itemId, value);
    } else {
      // Generic update interface
      if (window.electronAPI.updateImage) {
        await window.electronAPI.updateImage(itemId, updateData);
      } else {
        console.warn(`Unknown field: ${fieldName}, no matching API found`);
      }
    }

    // Update cache
    const cachedImage = cacheManager.getCachedImage(itemId);
    if (cachedImage) {
      cachedImage[fieldName] = value;
    }

    // Update currentImage
    if (this.app.currentImage && String(this.app.currentImage.id) === String(itemId)) {
      this.app.currentImage[fieldName] = value;
    }

    return { success: true };
  }

  getSuccessMessage(fieldName, value) {
    const messages = {
      'isSafe': value ? 'Marked as safe' : 'Marked as unsafe',
      'isFavorite': value ? 'Added to favorites' : 'Removed from favorites',
      'fileName': 'File name saved',
      'note': 'Note saved',
      'tags': 'Tags updated'
    };
    return messages[fieldName] || 'Saved';
  }
}
