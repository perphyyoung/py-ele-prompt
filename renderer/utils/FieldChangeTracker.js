/**
 * 字段变化追踪器
 * 用于追踪表单字段的变化，支持防抖和节流保存
 */
export class FieldChangeTracker {
  constructor() {
    // 字段原始值
    this.originalValues = new Map();
    // 当前值
    this.currentValues = new Map();
    // 防抖定时器
    this.debounceTimers = new Map();
    // 字段配置
    this.fieldConfigs = new Map();
  }

  /**
   * 初始化字段
   * @param {string} fieldId - 字段 ID
   * @param {any} initialValue - 初始值
   * @param {Object} config - 配置选项
   */
  initField(fieldId, initialValue, config = {}) {
    this.originalValues.set(fieldId, initialValue);
    this.currentValues.set(fieldId, initialValue);
    this.fieldConfigs.set(fieldId, {
      saveMode: config.saveMode || 'manual', // manual, debounce, throttle
      delay: config.delay || 500,
      validate: config.validate || null,
      beforeSave: config.beforeSave || null,
      equals: config.equals || ((a, b) => a === b)
    });
  }

  /**
   * 更新字段值
   * @param {string} fieldId - 字段 ID
   * @param {any} newValue - 新值
   * @param {Function} saveFn - 保存函数
   */
  updateField(fieldId, newValue, saveFn) {
    const config = this.fieldConfigs.get(fieldId);
    if (!config) {
      console.warn(`Field ${fieldId} not initialized`);
      return;
    }

    const currentValue = this.currentValues.get(fieldId);
    
    // 检查值是否真的变化
    if (config.equals(currentValue, newValue)) {
      return;
    }

    // 更新当前值
    this.currentValues.set(fieldId, newValue);

    // 根据保存模式处理
    switch (config.saveMode) {
      case 'debounce':
        this.handleDebounceSave(fieldId, newValue, saveFn, config);
        break;
      case 'throttle':
        this.handleThrottleSave(fieldId, newValue, saveFn, config);
        break;
      default:
        // manual 模式，手动调用 save
        break;
    }
  }

  /**
   * 防抖保存
   */
  handleDebounceSave(fieldId, newValue, saveFn, config) {
    // 清除之前的定时器
    if (this.debounceTimers.has(fieldId)) {
      clearTimeout(this.debounceTimers.get(fieldId));
    }

    // 设置新定时器
    const timer = setTimeout(async () => {
      await this.saveField(fieldId, saveFn, config);
    }, config.delay);

    this.debounceTimers.set(fieldId, timer);
  }

  /**
   * 节流保存
   */
  handleThrottleSave(fieldId, newValue, saveFn, config) {
    // 如果正在保存中，跳过
    if (this.debounceTimers.has(fieldId)) {
      return;
    }

    // 立即保存
    this.saveField(fieldId, saveFn, config);

    // 设置冷却时间
    const timer = setTimeout(() => {
      this.debounceTimers.delete(fieldId);
    }, config.delay);

    this.debounceTimers.set(fieldId, timer);
  }

  /**
   * 保存字段
   */
  async saveField(fieldId, saveFn, config) {
    const value = this.currentValues.get(fieldId);

    try {
      // 执行 beforeSave 钩子
      let finalValue = value;
      if (config.beforeSave) {
        finalValue = await config.beforeSave(value);
      }

      // 执行验证
      if (config.validate) {
        const validationResult = await config.validate(finalValue, this.originalValues.get(fieldId));
        if (!validationResult.valid) {
          throw new Error(validationResult.error || 'Validation failed');
        }
      }

      // 执行保存
      await saveFn(finalValue);

      // 更新原始值
      this.originalValues.set(fieldId, finalValue);

      return { success: true, value: finalValue };
    } catch (error) {
      console.error(`Failed to save field ${fieldId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 手动保存字段
   * @param {string} fieldId - 字段 ID
   * @param {Function} saveFn - 保存函数
   */
  async save(fieldId, saveFn) {
    const config = this.fieldConfigs.get(fieldId);
    if (!config) {
      throw new Error(`Field ${fieldId} not initialized`);
    }

    // 清除防抖定时器
    if (this.debounceTimers.has(fieldId)) {
      clearTimeout(this.debounceTimers.get(fieldId));
      this.debounceTimers.delete(fieldId);
    }

    return await this.saveField(fieldId, saveFn, config);
  }

  /**
   * 保存所有字段
   * @param {Function} saveFn - 保存函数
   */
  async saveAll(saveFn) {
    const results = [];
    
    for (const fieldId of this.fieldConfigs.keys()) {
      const result = await this.save(fieldId, saveFn);
      results.push({ fieldId, ...result });
    }

    return results;
  }

  /**
   * 检查字段是否有变化
   * @param {string} fieldId - 字段 ID
   * @returns {boolean} 是否有变化
   */
  hasChanged(fieldId) {
    const config = this.fieldConfigs.get(fieldId);
    if (!config) return false;

    const original = this.originalValues.get(fieldId);
    const current = this.currentValues.get(fieldId);

    return !config.equals(original, current);
  }

  /**
   * 获取所有变化的字段
   * @returns {Array} 变化的字段列表
   */
  getChangedFields() {
    const changed = [];
    
    for (const fieldId of this.fieldConfigs.keys()) {
      if (this.hasChanged(fieldId)) {
        changed.push(fieldId);
      }
    }

    return changed;
  }

  /**
   * 重置字段为原始值
   * @param {string} fieldId - 字段 ID
   */
  reset(fieldId) {
    const original = this.originalValues.get(fieldId);
    if (original !== undefined) {
      this.currentValues.set(fieldId, original);
    }
  }

  /**
   * 重置所有字段
   */
  resetAll() {
    for (const fieldId of this.fieldConfigs.keys()) {
      this.reset(fieldId);
    }
  }

  /**
   * 清除所有定时器
   */
  clearTimers() {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * 销毁追踪器
   */
  destroy() {
    this.clearTimers();
    this.originalValues.clear();
    this.currentValues.clear();
    this.fieldConfigs.clear();
  }
}

export default FieldChangeTracker;
