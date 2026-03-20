/**
 * ID 生成工具
 * 提供统一的 ID 生成方法
 */

/**
 * 生成唯一ID
 * @param {string} prefix - ID前缀 (如 'pmt', 'img')
 * @returns {string} 唯一ID
 */
export function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * 生成提示词ID
 * @returns {string} 提示词ID
 */
export function generatePromptId() {
  return generateId('pmt');
}

/**
 * 生成图像ID
 * @returns {string} 图像ID
 */
export function generateImageId() {
  return generateId('img');
}
