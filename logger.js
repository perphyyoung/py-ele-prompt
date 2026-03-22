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
 * 获取调用堆栈信息
 * @param {number} skipFrames - 跳过的帧数
 * @returns {string} 格式化的堆栈信息
 */
function getStackTrace(skipFrames = 3) {
  const stack = new Error().stack;
  if (!stack) return '';

  const lines = stack.split('\n');
  // 跳过前 skipFrames 行（Error 本身 + log 函数 + logError/logWarn）
  const relevantLines = lines.slice(skipFrames);

  // 格式化堆栈信息，只保留文件名和行号
  const formattedStack = relevantLines
    .filter(line => line.includes('file:///'))
    .slice(0, 5) // 只保留前5层
    .map(line => {
      const match = line.match(/at\s+(?:(.+?)\s+\()?file:\/\/\/.+?\/(.+?):(\d+):(\d+)\)?/);
      if (match) {
        const [, funcName, filePath, lineNum] = match;
        const shortPath = filePath.replace(/^.*[\\\/]/, '');
        return funcName ? `  at ${funcName} (${shortPath}:${lineNum})` : `  at ${shortPath}:${lineNum}`;
      }
      return '  ' + line.trim();
    })
    .join('\n');

  return formattedStack ? '\n  Stack:\n' + formattedStack : '';
}

/**
 * 写入调试日志
 * @param {string} level - 日志级别 (INFO, DEBUG, ERROR, WARN)
 * @param {string} component - 组件名
 * @param {string} message - 日志消息
 * @param {Object} data - 附加数据
 * @param {string} logFile - 日志文件路径（可选，默认为 debug.log）
 * @param {boolean} includeStack - 是否包含堆栈信息（ERROR 和 WARN 默认包含）
 */
/**
 * 序列化数据，处理 Error 对象和循环引用
 * @param {*} data - 要序列化的数据
 * @returns {string} 序列化后的字符串
 */
function serializeData(data) {
  if (data === null || data === undefined) return '';

  // 处理 Error 对象
  if (data instanceof Error) {
    return JSON.stringify({
      message: data.message,
      stack: data.stack,
      name: data.name
    }, null, 2);
  }

  try {
    return JSON.stringify(data, (key, value) => {
      // 处理 Error 对象属性
      if (value instanceof Error) {
        return {
          message: value.message,
          stack: value.stack,
          name: value.name
        };
      }
      return value;
    }, 2);
  } catch (err) {
    // 处理循环引用或其他序列化错误
    return `[Unable to serialize: ${err.message}]`;
  }
}

function log(level, component, message, data = null, logFile = null, includeStack = false) {
  const timestamp = TimeUtils.localTime();
  const dataStr = data ? '\n  Data: ' + serializeData(data) : '';
  const stackStr = includeStack ? getStackTrace() : '';
  const logEntry = `[${timestamp}] [${level}] [${component}] ${message}${dataStr}${stackStr}\n`;

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
  log('ERROR', component, message, data, logFile, true);
}

/**
 * 记录警告日志
 */
export function logWarn(component, message, data, logFile) {
  log('WARN', component, message, data, logFile, true);
}

export default {
  logInfo,
  logDebug,
  logError,
  logWarn
};
