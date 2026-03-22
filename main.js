/**
 * Prompt Manager - Electron 主进程
 * 负责窗口管理、文件系统操作、IPC 通信
 */

import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, clipboard, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import os from 'os';
import sharp from 'sharp';
import crypto from 'crypto';
import * as db from './database.js';
import { logInfo, logError, logDebug } from './logger.js';
import { generatePromptId, generateImageId } from './utils/idGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置文件路径（当前项目目录下）
const CONFIG_FILE = path.join(__dirname, 'config.json');

// 默认数据目录（相对于应用目录）
const DEFAULT_DATA_DIR = path.join(__dirname, 'py-data');

// ANSI 颜色代码
const COLORS = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m'
};

/**
 * 带颜色的日志输出
 * @param {string} level - 日志级别 (log, error, warn, info)
 * @param {...any} args - 日志内容
 */
function coloredLog(level, ...args) {
  const timestamp = new Date().toISOString();
  let color = COLORS.RESET;
  let prefix = `[${timestamp}]`;
  
  switch (level) {
    case 'error':
      color = COLORS.RED;
      prefix += ' [ERROR]';
      break;
    case 'warn':
      color = COLORS.YELLOW;
      prefix += ' [WARN]';
      break;
    case 'info':
      color = COLORS.BLUE;
      prefix += ' [INFO]';
      break;
    default:
      prefix += ' [LOG]';
  }
  
  console.log(color + prefix, ...args, COLORS.RESET);
}

// 重写 console 方法
const originalError = console.error;
console.error = function(...args) {
  coloredLog('error', ...args);
};

const originalWarn = console.warn;
console.warn = function(...args) {
  coloredLog('warn', ...args);
};

let mainWindow;
let tray = null;
let currentDataDir = DEFAULT_DATA_DIR;
let pendingOldDataDir = null;

// 检测是否为测试模式
const isTestMode = process.env.PLAYWRIGHT_TEST === 'true' || process.env.NODE_ENV === 'test';

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(1);
  pendingOldDataDir = null;
  for (const arg of args) {
    if (arg.startsWith('--old-data-dir=')) {
      pendingOldDataDir = arg.split('=')[1];
    }
  }
}

parseArgs();

/**
 * 加载应用配置
 * 从 config.json 读取数据目录设置
 */
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(data);
    if (config.dataDir) {
      // 判断是否为绝对路径
      if (path.isAbsolute(config.dataDir)) {
        currentDataDir = config.dataDir;
      } else {
        // 相对路径：相对于应用目录
        currentDataDir = path.resolve(__dirname, config.dataDir);
      }
    }
  } catch {
    // 使用默认配置
  }
}

/**
 * 保存应用配置
 * @param {Object} config - 配置对象
 */
async function saveConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * 确保数据目录存在
 * 如果不存在则创建目录
 */
async function ensureDataDir() {
  try {
    await fs.access(currentDataDir);
  } catch {
    await fs.mkdir(currentDataDir, { recursive: true });
  }
}

/**
 * 获取图像存储目录路径
 * @returns {string} images 目录路径
 */
function getImagesDir() {
  return path.join(currentDataDir, 'images');
}

/**
 * 获取缩略图存储目录路径
 * @returns {string} thumbnails 目录路径
 */
function getThumbnailsDir() {
  return path.join(currentDataDir, 'thumbnails');
}

/**
 * 确保图像目录存在
 * @param {string} subDir - 子目录（如年月：202603）
 * @returns {string} 图像目录路径
 */
async function ensureImagesDir(subDir = '') {
  const imagesDir = subDir ? path.join(getImagesDir(), subDir) : getImagesDir();
  try {
    await fs.access(imagesDir);
  } catch {
    await fs.mkdir(imagesDir, { recursive: true });
  }
  return imagesDir;
}

/**
 * 确保缩略图目录存在
 * @param {string} subDir - 子目录（如年月：202603）
 * @returns {string} 缩略图目录路径
 */
async function ensureThumbnailsDir(subDir = '') {
  const thumbnailsDir = subDir ? path.join(getThumbnailsDir(), subDir) : getThumbnailsDir();
  try {
    await fs.access(thumbnailsDir);
  } catch {
    await fs.mkdir(thumbnailsDir, { recursive: true });
  }
  return thumbnailsDir;
}

/**
 * 计算文件的 MD5 哈希值
 * @param {string} filePath - 文件路径
 * @returns {string} MD5 哈希值
 */
async function calculateFileMD5(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('md5').update(fileBuffer).digest('hex');
  } catch (error) {
    console.error('Failed to calculate MD5:', error);
    return null;
  }
}

/**
 * 查找已存在的图像（通过 MD5）
 * @param {string} md5 - 图像 MD5 值
 * @param {Array} images - 所有图像数据
 * @returns {Object|null} 已存在的图像信息
 */

/**
 * 生成图像缩略图
 * @param {string} imagePath - 原图像路径
 * @param {string} storedName - 存储的文件名
 * @param {string} subDir - 子目录（如年月：202603）
 * @returns {Object|null} 缩略图信息对象
 */
async function generateThumbnail(imagePath, storedName, subDir = '') {
  try {
    const thumbnailsDir = await ensureThumbnailsDir(subDir);
    const ext = path.extname(storedName) || '.png';
    const thumbnailName = `thumb_${path.basename(storedName, ext)}.jpg`;
    const thumbnailPath = path.join(thumbnailsDir, thumbnailName);

    // 检查缩略图是否已存在
    try {
      await fs.access(thumbnailPath);
      // 计算现有缩略图的 MD5
      const thumbnailMD5 = await calculateFileMD5(thumbnailPath);
      return {
        thumbnailName,
        thumbnailPath,
        relativePath: subDir ? 'thumbnails/' + subDir + '/' + thumbnailName : 'thumbnails/' + thumbnailName,
        thumbnailMD5
      };
    } catch {
      // 缩略图不存在，需要生成
    }

    // 使用 sharp 生成缩略图
    await sharp(imagePath)
      .resize(200, 200, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    // 计算缩略图 MD5
    const thumbnailMD5 = await calculateFileMD5(thumbnailPath);

    return {
      thumbnailName,
      thumbnailPath,
      relativePath: subDir ? 'thumbnails/' + subDir + '/' + thumbnailName : 'thumbnails/' + thumbnailName,
      thumbnailMD5
    };
  } catch (error) {
    console.error('Failed to generate thumbnail:', error);
    return null;
  }
}

/**
 * 保存图像文件到数据目录
 * 通过 MD5 检测避免重复存储相同图像
 * 图像信息单独存储到 images.json
 * @param {string} sourcePath - 源文件路径
 * @param {string} fileName - 原始文件名
 * @returns {Object} 保存后的图像信息
 */
async function saveImageFile(sourcePath, fileName) {
  // 计算源文件 MD5
  const sourceMD5 = await calculateFileMD5(sourcePath);

    // 检查是否已存在相同 MD5 的图像
    const existingImage = await db.getImageByMD5(sourceMD5);
    if (existingImage) {
      console.debug('Found duplicate image by MD5, reusing:', fileName);
      return {
        id: existingImage.id,
        fileName: fileName,
        isDuplicate: true,
        duplicateMessage: `图像 "${fileName}" 已存在，直接使用已保存的版本`
      };
    }

    // 生成年月子目录（格式：202603）
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const imagesDir = await ensureImagesDir(yearMonth);

    const ext = path.extname(fileName) || '.png';
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`;
    const targetPath = path.join(imagesDir, uniqueName);

    await fs.copyFile(sourcePath, targetPath);

    // 获取图像尺寸和文件大小
    let width = null;
    let height = null;
    let fileSize = 0;
    try {
      const metadata = await sharp(targetPath).metadata();
      width = metadata.width;
      height = metadata.height;
      const stats = await fs.stat(targetPath);
      fileSize = stats.size;
    } catch (error) {
      console.error('Failed to get image info:', error);
    }

    // 生成缩略图（传入年月子目录）
    const thumbnailInfo = await generateThumbnail(targetPath, uniqueName, yearMonth);

    // 生成图像 ID
    const imageId = generateImageId();

    // 构建图像信息对象
    const imageInfo = {
      id: imageId,
      fileName: fileName,
      storedName: uniqueName,
      relativePath: 'images/' + yearMonth + '/' + uniqueName,
      thumbnailPath: thumbnailInfo ? thumbnailInfo.relativePath : null,
      md5: sourceMD5,
      thumbnailMD5: thumbnailInfo ? thumbnailInfo.thumbnailMD5 : null,
      width: width,
      height: height,
      fileSize: fileSize,
      createdAt: new Date().toISOString()
    };

    // 保存到数据库
    await db.addImage(imageInfo);

    // 返回简化版信息（只包含 ID 和文件名）
    return {
      id: imageId,
      fileName: fileName,
      isDuplicate: false
    };
}

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    frame: true,
    show: false,
    fullscreenable: true,
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 隐藏菜单栏
    mainWindow.setMenuBarVisibility(false);
    Menu.setApplicationMenu(null);
    // 最大化窗口（保留标题栏和关闭按钮）
    mainWindow.maximize();
  });

  // 注册 F12 快捷键打开/关闭开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && !input.alt && !input.control && !input.meta && !input.shift) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
      event.preventDefault();
    }
  });

  // 拦截关闭事件，最小化到托盘
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 创建系统托盘（测试模式下不创建）
  if (!isTestMode) {
    createTray();
  }
}

/**
 * 重启应用
 * 统一的重启逻辑，供托盘菜单和IPC调用
 * @param {string} oldDataDir - 旧的数据库目录路径（可选）
 */
function relaunchApp(oldDataDir) {
  app.isQuiting = true;
  const args = process.argv.slice(1)
    .filter(arg => !arg.startsWith('--relaunch') && !arg.startsWith('--old-data-dir'))
    .concat(['--relaunch']);
  if (oldDataDir) {
    args.push(`--old-data-dir=${oldDataDir}`);
  }
  app.relaunch({ args });
  app.quit();
}

/**
 * 创建系统托盘图标和菜单
 */
function createTray() {
  // 从文件加载图标
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '重启',
      click: () => {
        relaunchApp();
      }
    },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Prompt Manager');
  tray.setContextMenu(contextMenu);

  // 点击托盘图标显示窗口
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// IPC 处理器

// 获取所有 Prompts
ipcMain.handle('get-prompts', async (event, sortBy, sortOrder) => {
  return await db.getPrompts(sortBy, sortOrder);
});

// 添加 Prompt
ipcMain.handle('add-prompt', async (event, prompt) => {
  const newPrompt = {
    id: generatePromptId(),
    ...prompt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  // 如果没有提供标题，使用 ID 作为标题
  if (!newPrompt.title) {
    newPrompt.title = newPrompt.id;
  }
  return await db.addPrompt(newPrompt);
});

// 更新 Prompt
ipcMain.handle('update-prompt', async (event, id, updates) => {
  return await db.updatePrompt(id, updates);
});

// 软删除提示词（移动到回收站）
ipcMain.handle('soft-delete-prompt', async (event, id) => {
  return await db.deletePrompt(id);
});

// 检查标题是否已存在
ipcMain.handle('is-title-exists', async (event, title, excludeId) => {
  return await db.isTitleExists(title, excludeId);
});

// 保存所有 Prompts（用于直接替换）
ipcMain.handle('save-prompts', async (event, prompts) => {
  // 此功能已弃用，使用数据库操作替代
  throw new Error('save-prompts is deprecated, use database operations instead');
});

// 获取提示词回收站
ipcMain.handle('get-prompt-trash', async () => {
  try {
    const deletedPrompts = await db.getDeletedPrompts();
    
    // 为提示词添加 type 字段
    return deletedPrompts.map(prompt => ({
      ...prompt,
      type: 'prompt'
    }));
  } catch (error) {
    console.error('Get prompt trash error:', error);
    throw error;
  }
});

// 从提示词回收站恢复
ipcMain.handle('restore-prompt-from-trash', async (event, id) => {
  try {
    await db.restorePrompt(id);
    return true;
  } catch (error) {
    console.error('Restore from trash error:', error);
    throw error;
  }
});

// 永久删除提示词
ipcMain.handle('permanent-delete-prompt', async (event, id) => {
  try {
    await db.permanentDeletePrompt(id);
    return true;
  } catch (error) {
    console.error('Permanent delete prompt error:', error);
    throw error;
  }
});

// 清空提示词回收站
ipcMain.handle('empty-prompt-trash', async () => {
  try {
    const deletedPrompts = await db.getDeletedPrompts();
    for (const prompt of deletedPrompts) {
      await db.permanentDeletePrompt(prompt.id);
    }
    return true;
  } catch (error) {
    console.error('Empty recycle bin error:', error);
    throw error;
  }
});

// ==================== 图像回收站 ====================

// 获取图像回收站列表
ipcMain.handle('get-image-trash', async () => {
  try {
    return await db.getDeletedImages();
  } catch (error) {
    console.error('Get image trash error:', error);
    throw error;
  }
});

// 从回收站恢复图像
ipcMain.handle('restore-image-from-trash', async (event, id) => {
  try {
    await db.restoreImage(id);
    return true;
  } catch (error) {
    console.error('Restore image from trash error:', error);
    throw error;
  }
});

// 永久删除图像
ipcMain.handle('permanent-delete-image', async (event, id) => {
  try {
    await db.permanentDeleteImage(id, currentDataDir);
    return true;
  } catch (error) {
    console.error('Permanently delete image error:', error);
    throw error;
  }
});

// 清空图像回收站
ipcMain.handle('empty-image-trash', async () => {
  try {
    await db.emptyImageTrash(currentDataDir);
    return true;
  } catch (error) {
    console.error('Empty image trash error:', error);
    throw error;
  }
});

// 软删除图像（移动到回收站）
ipcMain.handle('soft-delete-image', async (event, id) => {
  try {
    await db.softDeleteImage(id);
    return true;
  } catch (error) {
    console.error('Soft delete image error:', error);
    throw error;
  }
});

// 重启应用
ipcMain.handle('relaunch-app', async (event, oldDataDir) => {
  relaunchApp(oldDataDir);
});

// ==================== 收藏功能 ====================

// 获取收藏的提示词
ipcMain.handle('get-favorite-prompts', async () => {
  return await db.getFavoritePrompts();
});

// 获取收藏的图像
ipcMain.handle('get-favorite-images', async () => {
  return await db.getFavoriteImages();
});

// 获取所有提示词标签
ipcMain.handle('get-prompt-tags', async () => {
  try {
    return await db.getPromptTags();
  } catch (error) {
    console.error('Get prompt tags error:', error);
    throw error;
  }
});

// 添加提示词标签
ipcMain.handle('add-prompt-tag', async (event, tag) => {
  try {
    await db.addPromptTag(tag);
    return await db.getPromptTags();
  } catch (error) {
    console.error('Add prompt tag error:', error);
    throw error;
  }
});

// 删除提示词标签
ipcMain.handle('delete-prompt-tag', async (event, tag) => {
  try {
    // 从数据库删除标签（会级联删除关联关系）
    await db.run('DELETE FROM prompt_tags WHERE name = ?', [tag]);
    return await db.getPromptTags();
  } catch (error) {
    console.error('Delete prompt tag error:', error);
    throw error;
  }
});

// ==================== 提示词标签组 IPC ====================

// 获取所有提示词标签组（仅组定义）
ipcMain.handle('get-prompt-tag-groups', async () => {
  try {
    return await db.getPromptTagGroupsOnly();
  } catch (error) {
    console.error('Get prompt tag groups error:', error);
    throw error;
  }
});

// 创建提示词标签组
ipcMain.handle('create-prompt-tag-group', async (event, name, type, sortOrder) => {
  try {
    return await db.createPromptTagGroup(name, type, sortOrder);
  } catch (error) {
    console.error('Create prompt tag group error:', error);
    throw error;
  }
});

// 更新提示词标签组属性
ipcMain.handle('update-prompt-tag-group-attrs', async (event, id, updates) => {
  try {
    return await db.updatePromptTagGroup(id, updates);
  } catch (error) {
    console.error('Update prompt tag group attrs error:', error);
    throw error;
  }
});

// 删除提示词标签组
ipcMain.handle('delete-prompt-tag-group', async (event, id) => {
  try {
    return await db.deletePromptTagGroup(id);
  } catch (error) {
    console.error('Delete prompt tag group error:', error);
    throw error;
  }
});

// 获取带组信息的提示词标签
ipcMain.handle('get-prompt-tags-with-group', async () => {
  try {
    return await db.getPromptTagsWithGroupInfo();
  } catch (error) {
    console.error('Get prompt tags with group error:', error);
    throw error;
  }
});

// 分配提示词标签到所属组
ipcMain.handle('assign-prompt-tag-to-belong-group', async (event, tagName, groupId) => {
  try {
    return await db.updatePromptTagGroupByTagName(tagName, groupId);
  } catch (error) {
    console.error('Assign prompt tag to belong group error:', error);
    throw error;
  }
});

// 重命名提示词标签
ipcMain.handle('rename-prompt-tag', async (event, oldTag, newTag) => {
  try {
    // 获取旧标签的 ID
    const oldTagRow = await db.get('SELECT id FROM prompt_tags WHERE name = ?', [oldTag]);
    if (!oldTagRow) {
      return await db.getPromptTags();
    }

    // 检查新标签是否已存在
    const newTagRow = await db.get('SELECT id FROM prompt_tags WHERE name = ?', [newTag]);

    if (newTagRow) {
      // 新标签已存在，将所有旧标签的关联迁移到新标签
      const relations = await db.all(
        'SELECT prompt_id FROM prompt_tag_relations WHERE tag_id = ?',
        [oldTagRow.id]
      );
      for (const rel of relations) {
        try {
          await db.run(
            'INSERT INTO prompt_tag_relations (prompt_id, tag_id) VALUES (?, ?)',
            [rel.prompt_id, newTagRow.id]
          );
        } catch (err) {
          // 关联已存在，忽略
        }
      }
      // 删除旧标签
      await db.run('DELETE FROM prompt_tags WHERE id = ?', [oldTagRow.id]);
    } else {
      // 新标签不存在，直接重命名
      await db.run('UPDATE prompt_tags SET name = ? WHERE id = ?', [newTag, oldTagRow.id]);
    }
    
    return await db.getPromptTags();
  } catch (error) {
    console.error('Rename prompt tag error:', error);
    throw error;
  }
});

// 搜索 Prompts
ipcMain.handle('search-prompts', async (event, query) => {
  if (!query) return await db.getPrompts();
  return await db.searchPrompts(query);
});

// 导出 Prompts
ipcMain.handle('export-prompts', async (event, prompts) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出 Prompts',
    defaultPath: 'prompts-backup.json',
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ]
  });
  
  if (filePath) {
    await fs.writeFile(filePath, JSON.stringify(prompts, null, 2), 'utf8');
    return true;
  }
  return false;
});

// 导入 Prompts
ipcMain.handle('import-prompts', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '导入 Prompts',
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ],
    properties: ['openFile']
  });
  
  if (filePaths && filePaths.length > 0) {
    const data = await fs.readFile(filePaths[0], 'utf8');
    const imported = JSON.parse(data);
    
    // 导入数据到数据库
    const importedPrompts = [];
    for (const item of imported) {
      const newPrompt = {
        ...item,
        id: generatePromptId(),
        importedAt: new Date().toISOString()
      };
      await db.addPrompt(newPrompt);
      importedPrompts.push(newPrompt);
    }
    
    return importedPrompts;
  }
  return null;
});

// 复制到剪贴板
ipcMain.handle('copy-to-clipboard', async (event, text) => {
  clipboard.writeText(text);
  return true;
});

// 设置全屏模式
ipcMain.handle('set-fullscreen', async (event, flag) => {
  if (mainWindow) {
    mainWindow.setFullScreen(flag);
    // 全屏时隐藏菜单栏，退出全屏时恢复
    if (flag) {
      mainWindow.setMenuBarVisibility(false);
    } else {
      mainWindow.setMenuBarVisibility(true);
    }
    return true;
  }
  return false;
});



// 获取当前数据路径
ipcMain.handle('get-data-path', async () => {
  return currentDataDir;
});

// 选择新的数据路径
ipcMain.handle('select-data-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择数据目录',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: currentDataDir
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const newPath = result.filePaths[0];

    // 如果路径改变，更新配置
    if (newPath !== currentDataDir) {
      currentDataDir = newPath;
      await saveConfig({ dataDir: newPath });
      return newPath;
    }
  }

  return null;
});

// 选择目录（通用）
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择导出目录',
    properties: ['openDirectory'],
    defaultPath: currentDataDir
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }

  return null;
});

// 保存图像文件
ipcMain.handle('save-image-file', async (event, sourcePath, fileName) => {
  return await saveImageFile(sourcePath, fileName);
});

// 打开图像文件对话框（支持多选）
ipcMain.handle('dialog:open-image-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择图像',
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });

  if (result.canceled) {
    return [];
  }

  // 路径安全验证：只允许本地文件路径（以盘符开头）
  const validatedPaths = (result.filePaths || []).filter(filePath => {
    // Windows: 检查是否为本地盘符路径（如 D:\, C:\）
    const isLocalPath = /^[a-zA-Z]:[\\/]/.test(filePath);
    if (!isLocalPath) {
      console.warn('Path validation failed (not a local path):', filePath);
    }
    return isLocalPath;
  });

  return validatedPaths;
});

// 获取所有图像信息
ipcMain.handle('get-images', async (event, sortBy, sortOrder) => {
  try {
    return await db.getImages(sortBy, sortOrder);
  } catch (error) {
    console.error('Get images error:', error);
    throw error;
  }
});

// 根据 ID 批量获取图像信息
ipcMain.handle('get-images-by-ids', async (event, ids) => {
  try {
    return await db.getImagesByIds(ids);
  } catch (error) {
    console.error('Get images by ids error:', error);
    throw error;
  }
});

// 获取所有图像（用于统计）
ipcMain.handle('get-all-images-for-stats', async () => {
  try {
    return await db.getAllImages();
  } catch (error) {
    console.error('Get all images for stats error:', error);
    throw error;
  }
});

// 根据 ID 获取图像信息
ipcMain.handle('get-image-by-id', async (event, imageId) => {
  try {
    return await db.getImageById(imageId);
  } catch (error) {
    console.error('Get image by id error:', error);
    throw error;
  }
});

// 获取提示词关联的图像
ipcMain.handle('get-prompt-images', async (event, promptId) => {
  try {
    return await db.getPromptImages(promptId);
  } catch (error) {
    console.error('Get prompt images error:', error);
    throw error;
  }
});

// 获取所有图像标签
ipcMain.handle('get-image-tags', async () => {
  try {
    return await db.getImageTags();
  } catch (error) {
    console.error('Get image tags error:', error);
    throw error;
  }
});

// 添加图像标签
ipcMain.handle('add-image-tag', async (event, tag) => {
  try {
    await db.addImageTag(tag);
    return await db.getImageTags();
  } catch (error) {
    console.error('Add image tag error:', error);
    throw error;
  }
});

// 为图像添加多个标签
ipcMain.handle('add-image-tags', async (event, imageId, tagNames) => {
  try {
    await db.addImageTags(imageId, tagNames);
    return true;
  } catch (error) {
    console.error('Add image tags error:', error);
    throw error;
  }
});

// 更新图像
ipcMain.handle('update-image', async (event, id, updates) => {
  try {
    return await db.updateImage(id, updates);
  } catch (error) {
    console.error('Update image error:', error);
    throw error;
  }
});

// 重命名图像标签
ipcMain.handle('rename-image-tag', async (event, oldTag, newTag) => {
  try {
    // 获取所有图像
    const images = await db.getImages();
    
    // 更新每个包含该标签的图像
    for (const image of images) {
      if (image.tags && image.tags.includes(oldTag)) {
        const newTags = image.tags.map(tag => tag === oldTag ? newTag : tag);
        await db.updateImage(image.id, { tags: newTags });
      }
    }
    
    return true;
  } catch (error) {
    console.error('Rename image tag error:', error);
    throw error;
  }
});

// 删除图像标签
ipcMain.handle('delete-image-tag', async (event, tag) => {
  try {
    // 获取所有图像
    const images = await db.getImages();

    // 从每个包含该标签的图像中移除
    for (const image of images) {
      if (image.tags && image.tags.includes(tag)) {
        const newTags = image.tags.filter(t => t !== tag);
        await db.updateImage(image.id, { tags: newTags });
      }
    }

    // 从全局标签列表中删除
    await db.deleteImageTag(tag);

    return true;
  } catch (error) {
    console.error('Delete image tag error:', error);
    throw error;
  }
});

// ==================== 图像标签组 IPC ====================

// 获取所有图像标签组（仅组定义）
ipcMain.handle('get-image-tag-groups', async () => {
  try {
    return await db.getImageTagGroupsOnly();
  } catch (error) {
    console.error('Get image tag groups error:', error);
    throw error;
  }
});

// 创建图像标签组
ipcMain.handle('create-image-tag-group', async (event, name, type, sortOrder) => {
  try {
    return await db.createImageTagGroup(name, type, sortOrder);
  } catch (error) {
    console.error('Create image tag group error:', error);
    throw error;
  }
});

// 更新图像标签组
ipcMain.handle('update-image-tag-group-attrs', async (event, id, updates) => {
  try {
    return await db.updateImageTagGroup(id, updates);
  } catch (error) {
    console.error('Update image tag group error:', error);
    throw error;
  }
});

// 删除图像标签组
ipcMain.handle('delete-image-tag-group', async (event, id) => {
  try {
    return await db.deleteImageTagGroup(id);
  } catch (error) {
    console.error('Delete image tag group error:', error);
    throw error;
  }
});

// 获取带组信息的图像标签
ipcMain.handle('get-image-tags-with-group', async () => {
  try {
    return await db.getImageTagsWithGroupInfo();
  } catch (error) {
    console.error('Get image tags with group error:', error);
    throw error;
  }
});

// 分配图像标签到所属组
ipcMain.handle('assign-image-tag-to-belong-group', async (event, tagName, groupId) => {
  try {
    return await db.assignImageTagToBelongGroup(tagName, groupId);
  } catch (error) {
    console.error('Assign image tag to belong group error:', error);
    throw error;
  }
});

// 获取图像完整路径
ipcMain.handle('get-image-path', async (event, relativePath) => {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Invalid relativePath: ' + relativePath);
  }
  return path.join(currentDataDir, relativePath);
});

// 选择图像文件
ipcMain.handle('select-image-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择图像',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '图像文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return null;
});

// 显示确认对话框

// 清空所有数据
ipcMain.handle('clear-all-data', async () => {
  try {
    const oldDataDir = currentDataDir;
    const pad = n => n.toString().padStart(2, '0');
    const now = new Date();
    const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const newDataDir = path.join(path.dirname(oldDataDir), `${path.basename(oldDataDir)}_${timestamp}`);
    db.closeDatabase();
    await new Promise(resolve => setTimeout(resolve, 500));
    await fs.rename(oldDataDir, newDataDir);
    await fs.mkdir(oldDataDir, { recursive: true });
    await db.initDatabase(oldDataDir);
    return newDataDir;
  } catch (error) {
    console.error('Clear all data error:', error);
    throw error;
  }
});

// 获取统计数据
ipcMain.handle('get-statistics', async () => {
  try {
    return await db.getStatistics();
  } catch (error) {
    console.error('Get statistics error:', error);
    throw error;
  }
});

// 优化数据库
ipcMain.handle('optimize-database', async () => {
  try {
    return await db.optimizeDatabase();
  } catch (error) {
    console.error('Optimize database error:', error);
    throw error;
  }
});

// 获取旧数据目录路径（清空数据后）
ipcMain.handle('get-old-data-dir', async () => {
  const oldDir = pendingOldDataDir;
  pendingOldDataDir = null;
  return oldDir;
});

// 记录调试日志
ipcMain.handle('log-debug', async (event, component, message, data) => {
  try {
    const { logDebug } = await import('./logger.js');
    logDebug(component, message, data);
    return true;
  } catch (error) {
    console.error('Log debug error:', error);
    return false;
  }
});

// 记录错误日志
ipcMain.handle('log-error', async (event, component, message, data) => {
  try {
    const { logError } = await import('./logger.js');
    logError(component, message, data);
    return true;
  } catch (error) {
    console.error('Log error error:', error);
    return false;
  }
});

// 记录警告日志
ipcMain.handle('log-warn', async (event, component, message, data, logFile) => {
  try {
    const { logWarn } = await import('./logger.js');
    logWarn(component, message, data, logFile);
    return true;
  } catch (error) {
    console.error('Log warn error:', error);
    return false;
  }
});

/**
 * 递归获取目录下所有文件
 * @param {string} dir - 目录路径
 * @param {string} baseDir - 基础目录（用于计算相对路径）
 * @returns {Array} 文件列表（包含相对路径和绝对路径）
 */
async function getAllFiles(dir, baseDir) {
  const files = [];
  const items = await fs.readdir(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (item.isDirectory()) {
      const subFiles = await getAllFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else {
      const stats = await fs.stat(fullPath);
      files.push({
        relativePath: relativePath.replace(/\\/g, '/'),
        fullPath,
        size: stats.size
      });
    }
  }
  
  return files;
}

// 扫描孤儿文件
ipcMain.handle('scan-orphan-files', async () => {
  try {
    const imagesDir = getImagesDir();
    const thumbnailsDir = getThumbnailsDir();
    
    // 获取数据库中所有图像的路径
    const allImages = await db.getAllImages({ forCleanup: true });
    const dbImagePaths = new Set(allImages.map(img => img.relative_path).filter(Boolean));
    const dbThumbnailPaths = new Set(allImages.map(img => img.thumbnail_path).filter(Boolean));
    
    // 扫描实际文件
    let actualImageFiles = [];
    let actualThumbnailFiles = [];
    
    try {
      actualImageFiles = await getAllFiles(imagesDir, currentDataDir);
    } catch (error) {
      // 目录可能不存在
    }
    
    try {
      actualThumbnailFiles = await getAllFiles(thumbnailsDir, currentDataDir);
    } catch (error) {
      // 目录可能不存在
    }
    
    // 找出孤儿文件
    const orphanImages = actualImageFiles.filter(file => !dbImagePaths.has(file.relativePath));
    const orphanThumbnails = actualThumbnailFiles.filter(file => !dbThumbnailPaths.has(file.relativePath));
    
    // 计算总大小
    const orphanImageSize = orphanImages.reduce((sum, f) => sum + f.size, 0);
    const orphanThumbnailSize = orphanThumbnails.reduce((sum, f) => sum + f.size, 0);
    
    return {
      orphanImages,
      orphanThumbnails,
      orphanImageCount: orphanImages.length,
      orphanThumbnailCount: orphanThumbnails.length,
      orphanImageSize: (orphanImageSize / 1024 / 1024).toFixed(2),
      orphanThumbnailSize: (orphanThumbnailSize / 1024 / 1024).toFixed(2),
      totalCount: orphanImages.length + orphanThumbnails.length,
      totalSize: ((orphanImageSize + orphanThumbnailSize) / 1024 / 1024).toFixed(2)
    };
  } catch (error) {
    console.error('Scan orphan files error:', error);
    throw error;
  }
});

// 导出并删除孤儿文件
ipcMain.handle('export-and-delete-orphan-files', async (event, orphanFiles, exportDir) => {
  try {
    let exportedCount = 0;
    let deletedCount = 0;
    let failedCount = 0;
    
    // 创建导出目录
    const orphanExportDir = path.join(exportDir, `orphan_files_${Date.now()}`);
    await fs.mkdir(orphanExportDir, { recursive: true });
    
    // 创建子目录
    const imagesExportDir = path.join(orphanExportDir, 'images');
    const thumbnailsExportDir = path.join(orphanExportDir, 'thumbnails');
    await fs.mkdir(imagesExportDir, { recursive: true });
    await fs.mkdir(thumbnailsExportDir, { recursive: true });
    
    for (const file of orphanFiles) {
      try {
        // 确定导出子目录
        const isThumbnail = file.relativePath.includes('thumbnails/');
        const targetDir = isThumbnail ? thumbnailsExportDir : imagesExportDir;
        
        // 复制文件
        const fileName = path.basename(file.fullPath);
        const targetPath = path.join(targetDir, fileName);
        await fs.copyFile(file.fullPath, targetPath);
        exportedCount++;
        
        // 删除原文件
        await fs.unlink(file.fullPath);
        deletedCount++;
      } catch (error) {
        console.error('Failed to export/delete file:', file.fullPath, error);
        failedCount++;
      }
    }
    
    return { 
      exportedCount, 
      deletedCount, 
      failedCount, 
      exportPath: orphanExportDir 
    };
  } catch (error) {
    console.error('Export and delete orphan files error:', error);
    throw error;
  }
});

app.whenReady().then(async () => {
  await loadConfig();
  // 初始化数据库
  try {
    await db.initDatabase(currentDataDir);
    // Database initialized
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }

  // 配置 CSP（Content Security Policy）
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' file: data:",
          "connect-src 'self'",
          "font-src 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'"
        ].join('; ')
      }
    });
  });

  // 设置应用图标（Windows 任务栏）
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  try {
    await fs.access(iconPath);
    app.setAppUserModelId('com.promptmanager.app');
    // 设置应用图标
    const nativeIcon = nativeImage.createFromPath(iconPath);
    if (!nativeIcon.isEmpty()) {
      app.dock?.setIcon?.(nativeIcon);
    }
  } catch {
    // 图标不存在，忽略
  }

  createWindow();
});

app.on('window-all-closed', () => {
  // 测试模式下直接退出，不保留托盘
  if (isTestMode || process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
