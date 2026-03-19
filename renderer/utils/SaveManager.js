/**
 * 保存管理器
 * 管理表单字段的自动保存，支持多种保存策略
 * 集成字段变更追踪功能
 */
import { Constants } from '../constants.js';

export class SaveManager {
  /**
   * @param {Object} options - 配置选项
   * @param {SaveStrategy} options.strategy - 保存策略
   * @param {Function} options.onAfterSave - 保存后回调
   * @param {string} options.itemId - 当前编辑的项目ID
   */
  constructor(options) {
    this.strategy = options.strategy;
    this.onAfterSave = options.onAfterSave;
    this.itemId = options.itemId;

    // 字段配置和状态
    this.fields = new Map();
    // 原始值
    this.originalValues = new Map();
    // 当前值
    this.currentValues = new Map();
    // 防抖定时器
    this.debounceTimers = new Map();
    // 事件监听器
    this.eventListeners = new Map();

    this.isSaving = false;
  }

  /**
   * 注册字段
   * @param {string} fieldId - 字段 ID
   * @param {Object} config - 字段配置
   * @param {string} config.saveMode - 保存模式: 'debounce' | 'immediate' | 'manual'
   * @param {number} config.delay - 防抖/节流延迟
   * @param {string} config.elementId - DOM 元素 ID
   * @param {Function} config.getValue - 获取值的函数（用于非输入元素）
   * @param {Function} config.validate - 验证函数
   * @param {Function} config.beforeSave - 保存前钩子
   * @param {Function} config.onChange - 变更回调
   * @param {boolean} config.autoResize - 是否自动调整高度（textarea）
   * @param {string} config.statusId - 状态显示元素 ID
   */
  registerField(fieldId, config = {}) {
    const {
      saveMode = 'debounce',
      delay = 800,
      elementId,
      getValue,
      validate,
      beforeSave,
      onChange,
      autoResize,
      statusId
    } = config;

    // 获取初始值
    const element = document.getElementById(elementId);
    const initialValue = element ? this.getFieldValue(element, getValue) : null;

    // 存储字段配置
    this.fields.set(fieldId, {
      fieldId,
      saveMode,
      delay,
      elementId,
      getValue,
      validate,
      beforeSave,
      onChange,
      autoResize,
      statusId
    });

    // 初始化值
    this.originalValues.set(fieldId, initialValue);
    this.currentValues.set(fieldId, initialValue);

    // 绑定事件
    if (element) {
      this.bindFieldEvents(element, fieldId, this.fields.get(fieldId));
    }
  }

  /**
   * 绑定字段事件
   * @param {HTMLElement} element - 表单元素
   * @param {string} fieldId - 字段 ID
   * @param {Object} config - 字段配置
   * @private
   */
  bindFieldEvents(element, fieldId, config) {
    const { saveMode, autoResize, onChange, getValue } = config;
    const listeners = [];

    // 自动调整高度
    if (autoResize && element.tagName === 'TEXTAREA') {
      const autoResizeFn = () => {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
      };
      element.addEventListener('input', autoResizeFn);
      listeners.push({ event: 'input', fn: autoResizeFn });
      autoResizeFn();
    }

    // 根据保存模式绑定事件
    switch (saveMode) {
      case 'debounce': {
        const inputFn = () => {
          const newValue = this.getFieldValue(element, getValue);
          this.handleFieldChange(fieldId, newValue);
        };
        const blurFn = () => {
          this.saveField(fieldId, this.getFieldValue(element, getValue));
        };
        element.addEventListener('input', inputFn);
        element.addEventListener('blur', blurFn);
        listeners.push({ event: 'input', fn: inputFn }, { event: 'blur', fn: blurFn });
        break;
      }

      case 'immediate': {
        const changeFn = async () => {
          const newValue = this.getFieldValue(element, getValue);
          this.currentValues.set(fieldId, newValue);
          const result = await this.saveField(fieldId, newValue, this.itemId);
          if (result.success && onChange) {
            onChange(newValue);
          }
        };
        element.addEventListener('change', changeFn);
        listeners.push({ event: 'change', fn: changeFn });
        break;
      }

      case 'manual':
      default:
        // 手动保存模式，只触发 onChange 回调
        if (onChange) {
          const changeFn = () => {
            const newValue = this.getFieldValue(element, getValue);
            onChange(newValue);
          };
          element.addEventListener('change', changeFn);
          listeners.push({ event: 'change', fn: changeFn });
        }
        break;
    }

    // 存储监听器用于清理
    this.eventListeners.set(fieldId, { element, listeners });
  }

  /**
   * 获取字段值
   * @param {HTMLElement} element - 表单元素
   * @param {Function} getValue - 自定义获取值的函数
   * @returns {any} 字段值
   */
  getFieldValue(element, getValue) {
    if (getValue) {
      return getValue(element);
    }
    return this.strategy.getFieldValue(element);
  }

  /**
   * 处理字段变更
   * @param {string} fieldId - 字段 ID
   * @param {any} value - 字段值
   * @private
   */
  handleFieldChange(fieldId, value) {
    const field = this.fields.get(fieldId);
    if (!field) return;

    // 更新当前值
    this.currentValues.set(fieldId, value);

    // 防抖保存
    if (field.saveMode === 'debounce') {
      this.debounceSave(fieldId, value, field.delay);
    }
  }

  /**
   * 防抖保存
   * @param {string} fieldId - 字段 ID
   * @param {any} value - 字段值
   * @param {number} delay - 延迟时间
   * @private
   */
  debounceSave(fieldId, value, delay) {
    // 清除之前的定时器
    if (this.debounceTimers.has(fieldId)) {
      clearTimeout(this.debounceTimers.get(fieldId));
    }

    // 设置新定时器
    const timer = setTimeout(() => {
      this.saveField(fieldId, value);
      this.debounceTimers.delete(fieldId);
    }, delay);

    this.debounceTimers.set(fieldId, timer);
  }

  /**
   * 检查字段是否有变化
   * @param {string} fieldId - 字段 ID
   * @returns {boolean} 是否有变化
   */
  hasChanged(fieldId) {
    const original = this.originalValues.get(fieldId);
    const current = this.currentValues.get(fieldId);
    return original !== current;
  }

  /**
   * 获取所有变更的字段
   * @returns {Object} 变更的字段和值
   */
  getChanges() {
    const changes = {};
    for (const [fieldId, currentValue] of this.currentValues.entries()) {
      const originalValue = this.originalValues.get(fieldId);
      if (currentValue !== originalValue) {
        changes[fieldId] = currentValue;
      }
    }
    return changes;
  }

  /**
   * 更新原始值（保存成功后调用）
   * @param {string} fieldId - 字段 ID
   * @param {any} value - 新原始值
   */
  setOriginal(fieldId, value) {
    this.originalValues.set(fieldId, value);
    this.currentValues.set(fieldId, value);
  }

  /**
   * 保存单个字段
   * @param {string} fieldId - 字段 ID
   * @param {any} value - 字段值
   * @param {string} itemId - 项目 ID（可选）
   * @returns {Promise<Object>} 保存结果
   */
  async saveField(fieldId, value, itemId) {
    if (this.isSaving) return { success: false, reason: 'saving_in_progress' };

    const field = this.fields.get(fieldId);
    if (!field) {
      console.warn(`Field ${fieldId} not registered, skipping save`);
      return { success: false, fieldId, error: 'Field not registered' };
    }

    const statusEl = document.getElementById(field.statusId);

    // 检查字段是否有变化，没有变化则不保存
    if (!this.hasChanged(fieldId)) {
      return { success: true, fieldId, value, unchanged: true };
    }

    this.isSaving = true;
    try {
      // 执行 beforeSave 钩子
      let finalValue = value;
      if (field.beforeSave) {
        finalValue = await field.beforeSave(value);
      }

      // 执行验证
      if (field.validate) {
        const validationResult = await field.validate(finalValue, fieldId);
        if (!validationResult.valid) {
          throw new Error(validationResult.error || 'Validation failed');
        }
      }

      // 执行保存
      const result = await this.strategy.save(itemId || this.itemId, fieldId, finalValue);

      if (result.success) {
        // 更新原始值
        this.setOriginal(fieldId, finalValue);

        // 显示成功状态
        this.setStatus(statusEl, 'success');

        // 执行 onChange 回调
        if (field.onChange) {
          await field.onChange(finalValue);
        }

        // 执行保存后回调
        if (this.onAfterSave) {
          await this.onAfterSave(fieldId, finalValue);
        }
      }

      return { success: true, fieldId, value: finalValue };
    } catch (error) {
      console.error(`[SaveManager] Failed to save ${fieldId}:`, error);
      this.setStatus(statusEl, 'error', error.message);
      return { success: false, fieldId, error: error.message };
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * 手动触发字段保存（用于按钮等需要立即保存的场景）
   * @param {string} fieldId - 字段 ID
   * @param {any} value - 字段值
   * @param {string} itemId - 项目 ID
   * @returns {Promise<Object>} 保存结果
   */
  async triggerSave(fieldId, value, itemId) {
    // 更新当前值
    this.currentValues.set(fieldId, value);
    return await this.saveField(fieldId, value, itemId);
  }

  /**
   * 保存所有变更的字段
   * @param {string} itemId - 项目 ID
   * @returns {Promise<Object>} 保存结果
   */
  async saveAll(itemId) {
    const changes = this.getChanges();
    const changedFieldIds = Object.keys(changes);

    if (changedFieldIds.length === 0) {
      return { success: true, message: 'No changes to save' };
    }

    const results = [];

    for (const fieldId of changedFieldIds) {
      // 跳过未在 SaveManager 中注册的字段
      if (!this.fields.has(fieldId)) {
        continue;
      }
      const value = changes[fieldId];
      const result = await this.saveField(fieldId, value, itemId);
      results.push(result);
    }

    return { success: true, results };
  }

  /**
   * 设置状态显示
   * @param {HTMLElement} element - 状态元素
   * @param {string} status - 状态: 'success' | 'error'
   * @param {string} message - 消息
   * @private
   */
  setStatus(element, status, message = '') {
    if (!element) return;

    element.className = `save-status save-status-${status}`;

    switch (status) {
      case 'success':
        element.textContent = Constants.STATUS_SAVED;
        setTimeout(() => {
          element.className = 'save-status';
          element.textContent = '';
        }, 2000);
        break;
      case 'error':
        element.textContent = message || Constants.STATUS_SAVE_FAILED;
        break;
    }
  }

  /**
   * 清理资源
   */
  destroy() {
    // 清除所有定时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // 移除所有事件监听器
    for (const { element, listeners } of this.eventListeners.values()) {
      for (const { event, fn } of listeners) {
        element.removeEventListener(event, fn);
      }
    }
    this.eventListeners.clear();

    this.fields.clear();
    this.originalValues.clear();
    this.currentValues.clear();
  }
}

export default SaveManager;
