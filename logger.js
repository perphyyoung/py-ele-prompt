/**
 * 日志模块
 * 用于记录图像路径相关操作到 sql.log
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(__dirname, 'sql.log');
const DEBUG_LOG_FILE = path.join(__dirname, 'debug.log');

/**
 * 写入日志
 * @param {string} level - 日志级别 (INFO, DEBUG, ERROR)
 * @param {string} component - 组件名
 * @param {string} message - 日志消息
 * @param {Object} data - 附加数据
 */
export function log(level, component, message, data = null) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? '\n  Data: ' + JSON.stringify(data, null, 2) : '';
  const logEntry = `[${timestamp}] [${level}] [${component}] ${message}${dataStr}\n`;
  
  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

/**
 * 记录信息日志
 */
export function logInfo(component, message, data) {
  log('INFO', component, message, data);
}

/**
 * 记录调试日志
 */
export function logDebug(component, message, data) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? '\n  Data: ' + JSON.stringify(data, null, 2) : '';
  const logEntry = `[${timestamp}] [DEBUG] [${component}] ${message}${dataStr}\n`;

  try {
    fs.appendFileSync(DEBUG_LOG_FILE, logEntry);
  } catch (err) {
    console.error('Failed to write debug log:', err);
  }
}

/**
 * 记录错误日志
 */
export function logError(component, message, data) {
  log('ERROR', component, message, data);
}

/**
 * 记录 SQL 查询
 */
export function logSQL(component, sql, params = []) {
  log('SQL', component, `Executing SQL:\n${sql}`, { params });
}

/**
 * 记录图像路径操作
 */
export function logImagePath(component, operation, path, data = {}) {
  log('IMAGE', component, `Image Path Operation: ${operation}`, {
    path,
    ...data
  });
}

export default {
  log,
  logInfo,
  logDebug,
  logError,
  logSQL,
  logImagePath
};
