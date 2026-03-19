/**
 * 文本工具类
 * 提供文本校验和格式化功能
 */

/**
 * 校验结果类型
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 是否有效
 * @property {string} [error] - 错误信息（无效时）
 */

/**
 * 空值校验
 * 检查值是否为空（null、undefined、空字符串、仅空白字符）
 * @param {any} value - 要校验的值
 * @param {string} fieldName - 字段名称（用于错误提示）
 * @returns {ValidationResult} 校验结果
 */
export function validateNotEmpty(value, fieldName = '该字段') {
  if (value === null || value === undefined) {
    return { valid: false, error: `${fieldName}不能为空` };
  }

  const strValue = String(value).trim();
  if (strValue === '') {
    return { valid: false, error: `${fieldName}不能为空` };
  }

  return { valid: true };
}

/**
 * 重复校验
 * 检查值是否在现有列表中已存在
 * @param {any} value - 要校验的值
 * @param {Array} existingList - 现有值列表
 * @param {string} fieldName - 字段名称（用于错误提示）
 * @param {Function} [compareFn] - 自定义比较函数，默认使用严格相等
 * @param {any} [excludeId] - 要排除的ID（用于编辑时排除自身）
 * @param {Function} [getIdFn] - 从列表项中获取ID的函数
 * @returns {ValidationResult} 校验结果
 */
export function validateNotDuplicate(
  value,
  existingList,
  fieldName = '该字段',
  compareFn = (a, b) => a === b,
  excludeId = null,
  getIdFn = null
) {
  if (!Array.isArray(existingList)) {
    return { valid: true };
  }

  const isDuplicate = existingList.some(item => {
    // 如果提供了排除ID和获取ID函数，跳过该项
    if (excludeId !== null && getIdFn !== null) {
      const itemId = getIdFn(item);
      if (String(itemId) === String(excludeId)) {
        return false;
      }
    }

    return compareFn(item, value);
  });

  if (isDuplicate) {
    return { valid: false, error: `${fieldName}已存在` };
  }

  return { valid: true };
}

/**
 * 长度校验
 * 检查字符串长度是否在指定范围内
 * @param {string} value - 要校验的字符串
 * @param {number} [maxLength] - 最大长度
 * @param {number} [minLength] - 最小长度
 * @param {string} fieldName - 字段名称（用于错误提示）
 * @returns {ValidationResult} 校验结果
 */
export function validateLength(value, maxLength = null, minLength = null, fieldName = '该字段') {
  const strValue = String(value);

  if (minLength !== null && strValue.length < minLength) {
    return { valid: false, error: `${fieldName}长度不能少于${minLength}个字符` };
  }

  if (maxLength !== null && strValue.length > maxLength) {
    return { valid: false, error: `${fieldName}长度不能超过${maxLength}个字符` };
  }

  return { valid: true };
}

/**
 * 非法字符校验
 * 检查字符串是否包含非法字符
 * @param {string} value - 要校验的字符串
 * @param {RegExp} [invalidPattern] - 非法字符正则表达式
 * @param {string} fieldName - 字段名称（用于错误提示）
 * @returns {ValidationResult} 校验结果
 */
export function validateNoInvalidChars(
  value,
  invalidPattern = /[\\/:*?"<>|]/,
  fieldName = '该字段'
) {
  const strValue = String(value);

  if (invalidPattern.test(strValue)) {
    return { valid: false, error: `${fieldName}包含非法字符` };
  }

  return { valid: true };
}

/**
 * 组合校验
 * 按顺序执行多个校验，返回第一个错误
 * @param {Array<Function>} validators - 校验函数数组
 * @returns {ValidationResult} 校验结果
 */
export function combineValidators(validators) {
  for (const validator of validators) {
    const result = validator();
    if (!result.valid) {
      return result;
    }
  }
  return { valid: true };
}

/**
 * 文件名专用校验
 * 组合空值校验和非法字符校验
 * @param {string} fileName - 文件名
 * @returns {ValidationResult} 校验结果
 */
export function validateFileName(fileName) {
  // 空值校验
  const emptyResult = validateNotEmpty(fileName, '文件名');
  if (!emptyResult.valid) {
    return emptyResult;
  }

  // 非法字符校验（Windows 文件名非法字符）
  const invalidCharsResult = validateNoInvalidChars(
    fileName,
    /[\\/:*?"<>|]/,
    '文件名'
  );
  if (!invalidCharsResult.valid) {
    return invalidCharsResult;
  }

  return { valid: true };
}

/**
 * 标题专用校验
 * 组合空值校验和长度校验
 * @param {string} title - 标题
 * @param {number} [maxLength] - 最大长度，默认255
 * @returns {ValidationResult} 校验结果
 */
export function validateTitle(title, maxLength = 255) {
  // 空值校验
  const emptyResult = validateNotEmpty(title, '标题');
  if (!emptyResult.valid) {
    return emptyResult;
  }

  // 长度校验
  const lengthResult = validateLength(title, maxLength, null, '标题');
  if (!lengthResult.valid) {
    return lengthResult;
  }

  return { valid: true };
}
