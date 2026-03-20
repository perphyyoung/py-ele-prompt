/**
 * 时间工具类
 * 提供时间格式化和转换功能
 */

/**
 * 获取当前本地时间字符串
 * @returns {string} 本地时间字符串
 * @example
 * localTime()
 * // 返回: "2026/3/20 20:34:56"
 */
export function localTime() {
  return new Date().toLocaleString('zh-CN');
}

export default {
  localTime
};
