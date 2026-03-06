/**
 * Prompt Manager - Electron 主进程
 * 负责窗口管理、文件系统操作、IPC 通信
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const sharp = require('sharp');

// 配置文件路径（当前项目目录下）
const CONFIG_FILE = path.join(__dirname, 'config.json');

// 默认数据目录
const DEFAULT_DATA_DIR = path.join(os.homedir(), '.prompt-manager');

let mainWindow;
let currentDataDir = DEFAULT_DATA_DIR;

/**
 * 加载应用配置
 * 从 config.json 读取数据目录设置
 */
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(data);
    if (config.dataDir) {
      currentDataDir = config.dataDir;
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
 * 获取 Prompt 数据文件路径
 * @returns {string} prompts.json 文件路径
 */
function getDataFile() {
  return path.join(currentDataDir, 'prompts.json');
}

/**
 * 获取回收站数据文件路径
 * @returns {string} recycle-bin.json 文件路径
 */
function getRecycleBinFile() {
  return path.join(currentDataDir, 'recycle-bin.json');
}

/**
 * 获取标签数据文件路径
 * @returns {string} tags.json 文件路径
 */
function getTagsFile() {
  return path.join(currentDataDir, 'tags.json');
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
 * @returns {string} 图像目录路径
 */
async function ensureImagesDir() {
  const imagesDir = getImagesDir();
  try {
    await fs.access(imagesDir);
  } catch {
    await fs.mkdir(imagesDir, { recursive: true });
  }
  return imagesDir;
}

/**
 * 确保缩略图目录存在
 * @returns {string} 缩略图目录路径
 */
async function ensureThumbnailsDir() {
  const thumbnailsDir = getThumbnailsDir();
  try {
    await fs.access(thumbnailsDir);
  } catch {
    await fs.mkdir(thumbnailsDir, { recursive: true });
  }
  return thumbnailsDir;
}

/**
 * 生成图像缩略图
 * @param {string} imagePath - 原图像路径
 * @param {string} storedName - 存储的文件名
 * @returns {Object|null} 缩略图信息对象
 */
async function generateThumbnail(imagePath, storedName) {
  try {
    const thumbnailsDir = await ensureThumbnailsDir();
    const ext = path.extname(storedName) || '.png';
    const thumbnailName = `thumb_${path.basename(storedName, ext)}.jpg`;
    const thumbnailPath = path.join(thumbnailsDir, thumbnailName);

    // 检查缩略图是否已存在
    try {
      await fs.access(thumbnailPath);
      return {
        thumbnailName,
        thumbnailPath,
        relativePath: 'thumbnails/' + thumbnailName
      };
    } catch {
      // 缩略图不存在，需要生成
    }

    // 使用 sharp 生成缩略图
    await sharp(imagePath)
      .resize(200, 200, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    return {
      thumbnailName,
      thumbnailPath,
      relativePath: 'thumbnails/' + thumbnailName
    };
  } catch (error) {
    console.error('Failed to generate thumbnail:', error);
    return null;
  }
}

/**
 * 保存图像文件到数据目录
 * @param {string} sourcePath - 源文件路径
 * @param {string} fileName - 原始文件名
 * @returns {Object} 保存后的图像信息
 */
async function saveImageFile(sourcePath, fileName) {
  const imagesDir = await ensureImagesDir();
  const ext = path.extname(fileName) || '.png';
  const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`;
  const targetPath = path.join(imagesDir, uniqueName);

  await fs.copyFile(sourcePath, targetPath);

  // 生成缩略图
  const thumbnailInfo = await generateThumbnail(targetPath, uniqueName);

  return {
    fileName: fileName,
    storedName: uniqueName,
    path: targetPath,
    relativePath: 'images/' + uniqueName,
    thumbnailPath: thumbnailInfo ? thumbnailInfo.relativePath : null
  };
}

/**
 * 删除图像文件
 * @param {string} storedName - 存储的文件名
 */
async function deleteImageFile(storedName) {
  try {
    const imagesDir = getImagesDir();
    const filePath = path.join(imagesDir, storedName);
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Failed to delete image file:', error);
  }
}

/**
 * 清理未使用的图像文件
 * 删除所有未被 Prompt 引用的图像和缩略图
 * @param {Array} prompts - 所有 Prompt 数据
 */
async function cleanupUnusedImages(prompts) {
  try {
    const imagesDir = getImagesDir();
    const usedImages = new Set();

    // 收集所有正在使用的图像文件名
    prompts.forEach(prompt => {
      if (prompt.images && prompt.images.length > 0) {
        prompt.images.forEach(img => {
          if (img.storedName) {
            usedImages.add(img.storedName);
          }
        });
      }
    });

    // 读取图像目录中的所有文件
    const files = await fs.readdir(imagesDir);

    // 删除未使用的图像
    for (const file of files) {
      if (!usedImages.has(file)) {
        await fs.unlink(path.join(imagesDir, file));
        console.log('Deleted unused image:', file);
      }
    }
  } catch (error) {
    console.error('Failed to cleanup images:', error);
  }
}

/**
 * 读取所有 Prompts
 * @returns {Array} Prompt 数据数组
 */
async function getPrompts() {
  try {
    await ensureDataDir();
    const dataFile = getDataFile();
    const data = await fs.readFile(dataFile, 'utf8');
    const prompts = JSON.parse(data);
    return prompts;
  } catch {
    return [];
  }
}

/**
 * 保存所有 Prompts
 * @param {Array} prompts - Prompt 数据数组
 */
async function savePrompts(prompts) {
  await ensureDataDir();
  const dataFile = getDataFile();
  await fs.writeFile(dataFile, JSON.stringify(prompts, null, 2), 'utf8');
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
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 开发工具
  // mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 处理器

// 获取所有 Prompts
ipcMain.handle('get-prompts', async () => {
  return await getPrompts();
});

// 添加 Prompt
ipcMain.handle('add-prompt', async (event, prompt) => {
  const prompts = await getPrompts();
  const newPrompt = {
    id: Date.now().toString(),
    ...prompt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  prompts.push(newPrompt);
  await savePrompts(prompts);
  return newPrompt;
});

// 更新 Prompt
ipcMain.handle('update-prompt', async (event, id, updates) => {
  try {
    const prompts = await getPrompts();
    const index = prompts.findIndex(p => String(p.id) === String(id));
    if (index !== -1) {
      prompts[index] = {
        ...prompts[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await savePrompts(prompts);
      return prompts[index];
    }
    return null;
  } catch (error) {
    console.error('Update prompt error:', error);
    throw error;
  }
});

// 删除 Prompt（移动到回收站）
ipcMain.handle('delete-prompt', async (event, id) => {
  try {
    const prompts = await getPrompts();
    const promptToDelete = prompts.find(p => String(p.id) === String(id));
    
    if (!promptToDelete) {
      throw new Error('Prompt not found');
    }
    
    // 从 prompts 中移除
    const filtered = prompts.filter(p => String(p.id) !== String(id));
    await savePrompts(filtered);
    
    // 添加到回收站
    const recycleBin = await getRecycleBin();
    promptToDelete.deletedAt = Date.now();
    recycleBin.push(promptToDelete);
    await saveRecycleBin(recycleBin);
    
    return true;
  } catch (error) {
    console.error('Delete prompt error:', error);
    throw error;
  }
});

// 获取回收站内容
async function getRecycleBin() {
  try {
    const data = await fs.readFile(getRecycleBinFile(), 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 保存回收站内容
async function saveRecycleBin(items) {
  await fs.writeFile(getRecycleBinFile(), JSON.stringify(items, null, 2), 'utf8');
}

// 获取回收站
ipcMain.handle('get-recycle-bin', async () => {
  try {
    return await getRecycleBin();
  } catch (error) {
    console.error('Get recycle bin error:', error);
    throw error;
  }
});

// 从回收站恢复
ipcMain.handle('restore-from-recycle-bin', async (event, id) => {
  try {
    const recycleBin = await getRecycleBin();
    const itemToRestore = recycleBin.find(p => String(p.id) === String(id));
    
    if (!itemToRestore) {
      throw new Error('Item not found in recycle bin');
    }
    
    // 从回收站移除
    const filtered = recycleBin.filter(p => String(p.id) !== String(id));
    await saveRecycleBin(filtered);
    
    // 恢复删除时间戳
    delete itemToRestore.deletedAt;
    
    // 添加回 prompts
    const prompts = await getPrompts();
    prompts.push(itemToRestore);
    await savePrompts(prompts);
    
    return true;
  } catch (error) {
    console.error('Restore from recycle bin error:', error);
    throw error;
  }
});

// 彻底删除
ipcMain.handle('permanently-delete', async (event, id) => {
  try {
    const recycleBin = await getRecycleBin();
    const filtered = recycleBin.filter(p => String(p.id) !== String(id));
    await saveRecycleBin(filtered);
    return true;
  } catch (error) {
    console.error('Permanently delete error:', error);
    throw error;
  }
});

// 清空回收站
ipcMain.handle('empty-recycle-bin', async () => {
  try {
    await saveRecycleBin([]);
    return true;
  } catch (error) {
    console.error('Empty recycle bin error:', error);
    throw error;
  }
});

// 重启应用
ipcMain.handle('relaunch-app', async () => {
  app.relaunch();
  app.quit();
});

// 获取所有标签
ipcMain.handle('get-tags', async () => {
  try {
    const data = await fs.readFile(getTagsFile(), 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
});

// 保存所有标签
ipcMain.handle('save-tags', async (event, tags) => {
  try {
    await fs.writeFile(getTagsFile(), JSON.stringify(tags, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Save tags error:', error);
    throw error;
  }
});

// 添加标签
ipcMain.handle('add-tag', async (event, tag) => {
  try {
    const tags = await getTags();
    if (!tags.includes(tag)) {
      tags.push(tag);
      await saveTags(tags);
    }
    return tags;
  } catch (error) {
    console.error('Add tag error:', error);
    throw error;
  }
});

// 删除标签
ipcMain.handle('delete-tag', async (event, tag) => {
  try {
    const tags = await getTags();
    const filtered = tags.filter(t => t !== tag);
    await saveTags(filtered);
    return filtered;
  } catch (error) {
    console.error('Delete tag error:', error);
    throw error;
  }
});

// 重命名标签
ipcMain.handle('rename-tag', async (event, oldTag, newTag) => {
  try {
    // 更新标签列表
    const tags = await getTags();
    const index = tags.indexOf(oldTag);
    if (index !== -1) {
      tags[index] = newTag;
      await saveTags(tags);
    }
    
    // 更新所有 prompts 中的标签
    const prompts = await getPrompts();
    prompts.forEach(prompt => {
      if (prompt.tags && prompt.tags.includes(oldTag)) {
        prompt.tags = prompt.tags.map(t => t === oldTag ? newTag : t);
      }
    });
    await savePrompts(prompts);
    
    return tags;
  } catch (error) {
    console.error('Rename tag error:', error);
    throw error;
  }
});

// 辅助函数：获取标签
async function getTags() {
  try {
    const data = await fs.readFile(getTagsFile(), 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// 辅助函数：保存标签
async function saveTags(tags) {
  await fs.writeFile(getTagsFile(), JSON.stringify(tags, null, 2), 'utf8');
}

// 搜索 Prompts
ipcMain.handle('search-prompts', async (event, query) => {
  const prompts = await getPrompts();
  if (!query) return prompts;
  
  const lowerQuery = query.toLowerCase();
  return prompts.filter(p => 
    p.title.toLowerCase().includes(lowerQuery) ||
    p.content.toLowerCase().includes(lowerQuery) ||
    (p.tags && p.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
  );
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
    
    // 合并导入的数据
    const existing = await getPrompts();
    const merged = [...existing];
    
    for (const item of imported) {
      if (!merged.find(p => p.id === item.id)) {
        merged.push({
          ...item,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          importedAt: new Date().toISOString()
        });
      }
    }
    
    await savePrompts(merged);
    return merged;
  }
  return null;
});

// 复制到剪贴板
ipcMain.handle('copy-to-clipboard', async (event, text) => {
  const { clipboard } = require('electron');
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

    // 如果路径改变，迁移数据
    if (newPath !== currentDataDir) {
      try {
        // 读取旧数据
        const oldData = await getPrompts();

        // 更新配置
        currentDataDir = newPath;
        await saveConfig({ dataDir: newPath });

        // 确保新目录存在
        await ensureDataDir();

        // 保存数据到新位置
        await savePrompts(oldData);

        return newPath;
      } catch (error) {
        console.error('Failed to migrate data:', error);
        throw error;
      }
    }
  }

  return null;
});

// 保存图像文件
ipcMain.handle('save-image-file', async (event, sourcePath, fileName) => {
  return await saveImageFile(sourcePath, fileName);
});

// 删除图像文件
ipcMain.handle('delete-image-file', async (event, storedName) => {
  await deleteImageFile(storedName);
  return true;
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

// 清理未引用的图像
ipcMain.handle('cleanup-unused-images', async () => {
  try {
    const prompts = await getPrompts();
    const imagesDir = getImagesDir();
    const thumbnailsDir = getThumbnailsDir();
    const usedImages = new Set();

    // 收集所有正在使用的图像文件名
    prompts.forEach(prompt => {
      if (prompt.images && prompt.images.length > 0) {
        prompt.images.forEach(img => {
          if (img.storedName) {
            usedImages.add(img.storedName);
          }
        });
      }
    });

    // 清理图像目录
    let deletedImages = 0;
    try {
      const imageFiles = await fs.readdir(imagesDir);
      for (const file of imageFiles) {
        if (!usedImages.has(file)) {
          await fs.unlink(path.join(imagesDir, file));
          console.log('Deleted unused image:', file);
          deletedImages++;
        }
      }
    } catch (error) {
      console.error('Failed to cleanup images directory:', error);
    }

    // 清理缩略图目录
    let deletedThumbnails = 0;
    try {
      const thumbnailFiles = await fs.readdir(thumbnailsDir);
      for (const file of thumbnailFiles) {
        // 从缩略图文件名提取原始图像名
        const match = file.match(/^thumb_(.+?)\.jpg$/);
        if (match) {
          const originalName = match[1];
          // 查找是否有对应的图像在使用
          let isUsed = false;
          for (const usedName of usedImages) {
            if (usedName.startsWith(originalName)) {
              isUsed = true;
              break;
            }
          }
          if (!isUsed) {
            await fs.unlink(path.join(thumbnailsDir, file));
            console.log('Deleted unused thumbnail:', file);
            deletedThumbnails++;
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup thumbnails directory:', error);
    }

    return {
      deletedImages,
      deletedThumbnails,
      totalDeleted: deletedImages + deletedThumbnails
    };
  } catch (error) {
    console.error('Failed to cleanup unused images:', error);
    throw error;
  }
});

// 显示确认对话框
ipcMain.handle('show-confirm-dialog', async (event, title, message) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['取消', '确定'],
    defaultId: 1,
    cancelId: 0,
    title: title,
    message: message
  });
  return result.response === 1;
});

app.whenReady().then(async () => {
  await loadConfig();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
