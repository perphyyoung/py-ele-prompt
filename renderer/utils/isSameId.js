/**
 * 比较两个 ID 是否相等（统一转换为字符串比较）
 * @param {string|number} id1 - 第一个 ID
 * @param {string|number} id2 - 第二个 ID
 * @returns {boolean} 是否相等
 */
export function isSameId(id1, id2) {
  return String(id1) === String(id2);
}

export default isSameId;
