/**
 * 安全评级服务
 * 负责处理图像和提示词安全评级的联动更新
 * 使用事件驱动模式，解耦业务逻辑和 UI 更新
 */
class SafeRatingService {
  /**
   * @param {PromptManager} app - 应用主实例
   */
  constructor(app) {
    this.app = app;
    this.listeners = new Map();
  }

  /**
   * 订阅安全评级变更事件
   * @param {Function} callback - 回调函数，接收变更数据
   * @returns {Function} 取消订阅函数
   */
  onRatingChanged(callback) {
    const eventType = 'safeRatingChanged';
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
    
    // 返回取消订阅函数
    return () => this.off(eventType, callback);
  }

  /**
   * 取消订阅
   * @param {string} eventType - 事件类型
   * @param {Function} callback - 回调函数
   */
  off(eventType, callback) {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * 发布安全评级变更事件
   * @param {Object} data - 变更数据
   */
  emitRatingChanged(data) {
    const eventType = 'safeRatingChanged';
    const callbacks = this.listeners.get(eventType) || [];
    callbacks.forEach(cb => {
      try {
        cb(data);
      } catch (error) {
        console.error('SafeRating event listener error:', error);
      }
    });
  }

  /**
   * 更新图像安全评级（联动更新关联提示词）
   * @param {string} imageId - 图像 ID
   * @param {boolean} isSafe - 是否安全
   * @returns {Promise<Object>} 更新结果
   */
  async updateImageRating(imageId, isSafe) {
    if (!imageId) {
      throw new Error('Image ID is required');
    }

    try {
      // 1. 更新图像
      const updatedImage = await window.electronAPI.updateImageSafeStatus(imageId, isSafe);
      
      // 2. 获取关联的提示词
      const image = this.app.findImageById(imageId);
      const relatedPromptIds = image?.promptRefs?.map(ref => ref.promptId) || [];
      
      // 3. 联动更新所有关联提示词
      const updatedPrompts = [];
      for (const promptId of relatedPromptIds) {
        try {
          const updatedPrompt = await window.electronAPI.updatePromptSafeStatus(promptId, isSafe);
          updatedPrompts.push(updatedPrompt);
        } catch (error) {
          console.error(`Failed to update prompt ${promptId} safe status:`, error);
        }
      }
      
      // 4. 发布事件
      this.emitRatingChanged({
        targetType: 'image',
        targetId: imageId,
        isSafe,
        relatedPrompts: updatedPrompts
      });
      
      return { image: updatedImage, prompts: updatedPrompts };
    } catch (error) {
      console.error('Update image rating failed:', error);
      throw error;
    }
  }

  /**
   * 更新提示词安全评级（联动更新关联图像）
   * @param {string} promptId - 提示词 ID
   * @param {boolean} isSafe - 是否安全
   * @returns {Promise<Object>} 更新结果
   */
  async updatePromptRating(promptId, isSafe) {
    if (!promptId) {
      throw new Error('Prompt ID is required');
    }

    try {
      // 1. 更新提示词
      const updatedPrompt = await window.electronAPI.updatePromptSafeStatus(promptId, isSafe);
      
      // 2. 获取关联的图像
      const prompt = this.app.findPromptById(promptId);
      const relatedImageIds = prompt?.images?.map(img => img.id) || [];
      
      // 3. 联动更新所有关联图像
      const updatedImages = [];
      for (const imageId of relatedImageIds) {
        try {
          const updatedImage = await window.electronAPI.updateImageSafeStatus(imageId, isSafe);
          updatedImages.push(updatedImage);
        } catch (error) {
          console.error(`Failed to update image ${imageId} safe status:`, error);
        }
      }
      
      // 4. 发布事件
      this.emitRatingChanged({
        targetType: 'prompt',
        targetId: promptId,
        isSafe,
        relatedImages: updatedImages
      });
      
      return { prompt: updatedPrompt, images: updatedImages };
    } catch (error) {
      console.error('Update prompt rating failed:', error);
      throw error;
    }
  }

  /**
   * 从数据库获取最新数据
   * @param {string} type - 数据类型：'image' | 'prompt'
   * @param {string} id - 数据 ID
   * @returns {Promise<Object|null>} 最新数据
   */
  async refreshData(type, id) {
    try {
      if (type === 'image') {
        return await window.electronAPI.getImageById(id);
      } else if (type === 'prompt') {
        // 获取所有提示词并查找指定的提示词
        const allPrompts = await window.electronAPI.getPrompts();
        return allPrompts.find(p => String(p.id) === String(id)) || null;
      }
      return null;
    } catch (error) {
      console.error('Refresh data failed:', error);
      return null;
    }
  }
}

// 导出类
export default SafeRatingService;
