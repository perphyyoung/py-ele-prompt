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
 * 获取详细的错误堆栈
 * @param {Error} error - 错误对象
 * @param {number} skipFrames - 跳过的帧数
 * @returns {Object} 包含 message 和 stack 的对象
 */
function getDetailedStackTrace(error, skipFrames = 2) {
  // 使用错误对象的堆栈（如果有）
  const stack = error?.stack || new Error().stack;
  if (!stack) return { message: '', stack: '' };

  const lines = stack.split('\n');
  
  // 提取错误消息（第一行）
  const errorMessage = lines[0]?.replace(/^Error:\s*/, '') || '';
  
  // 跳过前 skipFrames 行
  const relevantLines = lines.slice(skipFrames);

  // 格式化堆栈
  const formattedStack = relevantLines
    .filter(line => line.includes('file:///'))
    .slice(0, 10) // 保留前10层
    .map((line, index) => {
      const match = line.match(/at\s+(?:(.+?)\s+\()?file:\/\/.+?\/(.+?):(\d+):(\d+)\)?/);
      if (match) {
        const [, funcName, filePath, lineNum, colNum] = match;
        const shortPath = filePath.replace(/^.*[\\\/]/, '');
        const arrow = index === 0 ? '👉 ' : '   '; // 标记第一行（错误发生位置）
        return `${arrow}at ${funcName || '<anonymous>'} (${shortPath}:${lineNum}:${colNum})`;
      }
      return '   ' + line.trim();
    })
    .join('\n');

  return {
    message: errorMessage,
    stack: formattedStack ? '\n  Stack:\n' + formattedStack : ''
  };
}

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
      name: data.name
      // 不在这里包含 stack，因为 getDetailedStackTrace 会处理
    }, null, 2);
  }

  try {
    return JSON.stringify(data, (key, value) => {
      // 处理 Error 对象属性
      if (value instanceof Error) {
        return {
          message: value.message,
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

/**
 * 写入调试日志
 * @param {string} level - 日志级别 (INFO, DEBUG, ERROR, WARN)
 * @param {string} component - 组件名
 * @param {string} message - 日志消息
 * @param {Object} data - 附加数据
 * @param {string} logFile - 日志文件路径（可选，默认为 debug.log）
 * @param {boolean} includeStack - 是否包含堆栈信息（ERROR 和 WARN 默认包含）
 * @param {Error} error - 错误对象（用于获取详细堆栈）
 */
function log(level, component, message, data = null, logFile = null, includeStack = false, error = null) {
  const timestamp = TimeUtils.localTime();
  const dataStr = data ? '\n  Data: ' + serializeData(data) : '';
  
  // 获取详细堆栈（如果有错误对象或需要堆栈）
  let stackStr = '';
  if (includeStack || error) {
    const detailedStack = getDetailedStackTrace(error);
    stackStr = detailedStack.stack;
  }
  
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
 * @param {string} component - 组件名
 * @param {string} message - 错误消息
 * @param {Error|Object} error - 错误对象或数据
 * @param {string} logFile - 日志文件路径
 */
export function logError(component, message, error, logFile) {
  // 判断 error 是 Error 对象还是普通数据
  const isErrorObject = error instanceof Error;
  
  // 构造数据对象
  const data = isErrorObject ? {
    message: error.message,
    name: error.name
  } : error;

  // 传入错误对象以获取详细堆栈
  log('ERROR', component, message, data, logFile, true, isErrorObject ? error : null);
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
