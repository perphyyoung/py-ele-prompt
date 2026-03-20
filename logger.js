/**
 * 日志模块
 * 用于记录调试日志到 debug.log
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import TimeUtils from './utils/TimeUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEBUG_LOG_FILE = path.join(__dirname, 'debug.log');

/**
 * 写入调试日志
 * @param {string} level - 日志级别 (INFO, DEBUG, ERROR, WARN)
 * @param {string} component - 组件名
 * @param {string} message - 日志消息
 * @param {Object} data - 附加数据
 * @param {string} logFile - 日志文件路径（可选，默认为 debug.log）
 */
function log(level, component, message, data = null, logFile = null) {
  const timestamp = TimeUtils.localTime();
  const dataStr = data ? '\n  Data: ' + JSON.stringify(data, null, 2) : '';
  const logEntry = `[${timestamp}] [${level}] [${component}] ${message}${dataStr}\n`;

  const targetLogFile = logFile || DEBUG_LOG_FILE;

  try {
    fs.appendFileSync(targetLogFile, logEntry);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

/**
 * 记录信息日志
 */
export function logInfo(component, message, data, logFile) {
  log('INFO', component, message, data, logFile);
}

/**
 * 记录调试日志
 */
export function logDebug(component, message, data, logFile) {
  log('DEBUG', component, message, data, logFile);
}

/**
 * 记录错误日志
 */
export function logError(component, message, data, logFile) {
  log('ERROR', component, message, data, logFile);
}

/**
 * 记录警告日志
 */
export function logWarn(component, message, data, logFile) {
  log('WARN', component, message, data, logFile);
}

export default {
  logInfo,
  logDebug,
  logError,
  logWarn
};
