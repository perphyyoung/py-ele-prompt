/**
 * 保存管理器
 * 管理表单字段的自动保存，支持防抖、节流和手动保存
 */
export class SaveManager {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   * @param {string} options.context - 保存上下文（如 'promptDetail', 'imageDetail'）
   * @param {Object} options.app - 主应用引用
   * @param {Object} options.tracker - FieldChangeTracker 实例
   */
  constructor(options) {
    this.context = options.context;
    this.app = options.app;
    this.tracker = options.tracker;
    this.fields = new Map();
    this.saveQueue = [];
    this.isSaving = false;
  }

  /**
   * 注册字段
   * @param {string} fieldId - 字段 ID
   * @param {Object} config - 字段配置
   */
  registerField(fieldId, config) {
    const {
      saveMode = 'manual',
      delay = 500,
      elementId,
      statusId,
      validate = null,
      beforeSave = null,
      onChange = null,
      autoResize = false,
      equals = null
    } = config;

    const fieldConfig = {
      fieldId,
      saveMode,
      delay,
      elementId,
      statusId,
      validate,
      beforeSave,
      onChange,
      autoResize,
      equals: equals || ((a, b) => a === b)
    };

    this.fields.set(fieldId, fieldConfig);

    // 初始化追踪器
    const element = document.getElementById(elementId);
    const initialValue = element ? this.getFieldValue(element) : null;
    
    this.tracker.initField(fieldId, initialValue, {
      saveMode,
      delay,
      validate,
      beforeSave,
      equals: fieldConfig.equals
    });

    // 绑定事件
    if (element) {
      this.bindFieldEvents(element, fieldConfig);
    }
  }

  /**
   * 绑定字段事件
   * @param {HTMLElement} element - 表单元素
   * @param {Object} config - 字段配置
   */
  bindFieldEvents(element, config) {
    const { fieldId, saveMode, autoResize, onChange } = config;

    // 自动调整高度
    if (autoResize && element.tagName === 'TEXTAREA') {
      const autoResizeFn = () => {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
      };
      element.addEventListener('input', autoResizeFn);
      // 初始调整
      autoResizeFn();
    }

    // 根据保存模式绑定事件
    switch (saveMode) {
      case 'debounce':
      case 'throttle':
        element.addEventListener('input', (e) => {
          const newValue = this.getFieldValue(element);
          this.tracker.updateField(fieldId, newValue, (value) => this.save(fieldId, value));
        });
        break;
      
      case 'manual':
      default:
        // 手动保存模式，只触发 onChange 回调
        if (onChange) {
          element.addEventListener('change', (e) => {
            const newValue = this.getFieldValue(element);
            onChange(newValue);
          });
        }
        break;
    }

    // 失去焦点时保存（适用于 debounce/throttle 模式）
    if (saveMode !== 'manual') {
      element.addEventListener('blur', async () => {
        await this.saveCurrentField(fieldId);
      });
    }
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

  /**
   * 保存字段
   * @param {string} fieldId - 字段 ID
   * @param {any} value - 值
   * @returns {Promise<Object>} 保存结果
   */
  async save(fieldId, value) {
    const config = this.fields.get(fieldId);
    if (!config) {
      throw new Error(`Field ${fieldId} not registered`);
    }

    const statusEl = document.getElementById(config.statusId);

    // 检查字段是否有变化，没有变化则不保存
    if (!this.tracker.hasChanged(fieldId)) {
      return { success: true, fieldId, value, unchanged: true };
    }

    try {
      // 显示保存中状态
      this.setStatus(statusEl, 'saving');

      // 执行 beforeSave 钩子
      let finalValue = value;
      if (config.beforeSave) {
        finalValue = await config.beforeSave(value);
      }

      // 执行验证
      if (config.validate) {
        const validationResult = await config.validate(finalValue, fieldId);
        if (!validationResult.valid) {
          throw new Error(validationResult.error || 'Validation failed');
        }
      }

      // 根据上下文执行保存
      let saveResult;
      switch (this.context) {
        case 'promptDetail':
          saveResult = await this.savePromptField(fieldId, finalValue);
          break;
        case 'imageDetail':
          saveResult = await this.saveImageField(fieldId, finalValue);
          break;
        default:
          throw new Error(`Unknown context: ${this.context}`);
      }

      // 显示成功状态
      this.setStatus(statusEl, 'success');

      // 执行 onChange 回调
      if (config.onChange) {
        await config.onChange(finalValue);
      }

      return { success: true, fieldId, value: finalValue };
    } catch (error) {
      console.error(`[SaveManager] Failed to save ${fieldId}:`, error);
      this.setStatus(statusEl, 'error', error.message);
      return { success: false, fieldId, error: error.message };
    }
  }

  /**
   * 保存提示词字段
   */
  async savePromptField(fieldId, value) {
    const promptIdEl = document.getElementById('promptId');
    const promptId = promptIdEl ? promptIdEl.value : null;

    if (!promptId) {
      throw new Error('Prompt ID not found');
    }

    const updateData = {};
    updateData[fieldId] = value;

    await window.electronAPI.updatePrompt(promptId, updateData);
    
    // 更新本地数据
    if (this.app && this.app.prompts) {
      const prompt = this.app.prompts.find(p => String(p.id) === String(promptId));
      if (prompt) {
        Object.assign(prompt, updateData);
      }
    }

    return { fieldId, value };
  }

  /**
   * 保存图像字段
   */
  async saveImageField(fieldId, value) {
    // 从 app.currentImage 获取当前编辑的图像
    const image = this.app?.currentImage;
    const imageId = image?.id;

    if (!imageId) {
      throw new Error('Image ID not found');
    }

    const updateData = {};
    updateData[fieldId] = value;

    // 根据字段类型调用不同的 API
    if (fieldId === 'tags') {
      await window.electronAPI.updateImageTags(imageId, value);
    } else if (fieldId === 'note') {
      await window.electronAPI.updateImageNote(imageId, value);
    } else if (fieldId === 'fileName') {
      await window.electronAPI.updateImageFileName(imageId, value);
    } else if (fieldId === 'isSafe') {
      // 将布尔值转换为整数 (0/1)
      const safeValue = value ? 1 : 0;
      await window.electronAPI.updateImageSafeStatus(imageId, safeValue);
    } else {
      // 通用更新接口（如果存在）
      if (window.electronAPI.updateImage) {
        await window.electronAPI.updateImage(imageId, updateData);
      } else {
        console.warn(`Unknown field: ${fieldId}, no matching API found`);
      }
    }
    
    // 更新本地数据
    if (this.app && this.app.images) {
      const img = this.app.images.find(i => String(i.id) === String(imageId));
      if (img) {
        Object.assign(img, updateData);
      }
    }

    // 更新 currentImage
    if (image) {
      Object.assign(image, updateData);
    }

    return { fieldId, value };
  }

  /**
   * 保存当前字段
   */
  async saveCurrentField(fieldId) {
    const config = this.fields.get(fieldId);
    if (!config) return;

    const element = document.getElementById(config.elementId);
    if (!element) return;

    const value = this.getFieldValue(element);
    await this.save(fieldId, value);
  }

  /**
   * 保存所有变更的字段
   */
  async saveAll() {
    const changes = this.tracker.getChanges();
    const changedFieldIds = Object.keys(changes);

    if (changedFieldIds.length === 0) {
      return { success: true, message: 'No changes to save' };
    }

    const results = [];

    for (const fieldId of changedFieldIds) {
      const value = changes[fieldId];
      const result = await this.save(fieldId, value);
      results.push(result);
    }

    return { success: true, results };
  }

  /**
   * 设置状态显示
   */
  setStatus(element, status, message = '') {
    if (!element) return;

    element.className = `save-status save-status-${status}`;

    switch (status) {
      case 'success':
        element.textContent = '已保存';
        // 成功状态 2 秒后消失
        setTimeout(() => {
          element.className = 'save-status';
          element.textContent = '';
        }, 2000);
        break;
      case 'error':
        element.textContent = message || '保存失败';
        break;
    }
  }

  /**
   * 验证字段
   */
  async validate(fieldId, value) {
    const config = this.fields.get(fieldId);
    if (!config || !config.validate) {
      return { valid: true };
    }

    return await config.validate(value, fieldId);
  }

  /**
   * 验证所有字段
   */
  async validateAll() {
    const results = [];
    
    for (const [fieldId, config] of this.fields.entries()) {
      if (config.validate) {
        const element = document.getElementById(config.elementId);
        const value = element ? this.getFieldValue(element) : null;
        const result = await this.validate(fieldId, value);
        results.push({ fieldId, ...result });
      }
    }

    return results;
  }

  /**
   * 清理资源
   */
  destroy() {
    this.tracker.clearTimers();
    this.fields.clear();
  }
}

export default SaveManager;
