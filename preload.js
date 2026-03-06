/**
 * Preload Script - 预加载脚本
 * 在渲染进程中暴露安全的 Electron API
 * 通过 contextBridge 隔离主进程和渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 暴露安全的 API 给渲染进程
 * 所有主进程通信都通过 IPC 通道进行
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ==================== Prompt 管理 ====================
  /** 获取所有 Prompts */
  getPrompts: () => ipcRenderer.invoke('get-prompts'),
  /** 添加新 Prompt @param {Object} prompt - Prompt 数据 */
  addPrompt: (prompt) => ipcRenderer.invoke('add-prompt', prompt),
  /** 更新 Prompt @param {string} id - Prompt ID @param {Object} updates - 更新内容 */
  updatePrompt: (id, updates) => ipcRenderer.invoke('update-prompt', id, updates),
  /** 删除 Prompt @param {string} id - Prompt ID */
  deletePrompt: (id) => ipcRenderer.invoke('delete-prompt', id),
  /** 搜索 Prompts @param {string} query - 搜索关键词 */
  searchPrompts: (query) => ipcRenderer.invoke('search-prompts', query),

  // ==================== 导入导出 ====================
  /** 导出 Prompts @param {Array} prompts - Prompt 数据数组 */
  exportPrompts: (prompts) => ipcRenderer.invoke('export-prompts', prompts),
  /** 导入 Prompts */
  importPrompts: () => ipcRenderer.invoke('import-prompts'),

  // ==================== 剪贴板 ====================
  /** 复制文本到剪贴板 @param {string} text - 要复制的文本 */
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // ==================== 全屏控制 ====================
  /** 设置全屏状态 @param {boolean} flag - 是否全屏 */
  setFullscreen: (flag) => ipcRenderer.invoke('set-fullscreen', flag),

  // ==================== 设置 ====================
  /** 获取当前数据路径 */
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  /** 选择数据路径 */
  selectDataPath: () => ipcRenderer.invoke('select-data-path'),

  // ==================== 图像文件操作 ====================
  /** 保存图像文件 @param {string} sourcePath - 源路径 @param {string} fileName - 文件名 */
  saveImageFile: (sourcePath, fileName) => ipcRenderer.invoke('save-image-file', sourcePath, fileName),
  /** 删除图像文件 @param {string} storedName - 存储的文件名 */
  deleteImageFile: (storedName) => ipcRenderer.invoke('delete-image-file', storedName),
  /** 获取图像完整路径 @param {string} relativePath - 相对路径 */
  getImagePath: (relativePath) => ipcRenderer.invoke('get-image-path', relativePath),
  /** 选择图像文件 */
  selectImageFiles: () => ipcRenderer.invoke('select-image-files'),
  /** 清理未使用的图像 */
  cleanupUnusedImages: () => ipcRenderer.invoke('cleanup-unused-images'),

  // ==================== 对话框 ====================
  /** 显示确认对话框 @param {string} title - 标题 @param {string} message - 消息内容 */
  showConfirmDialog: (title, message) => ipcRenderer.invoke('show-confirm-dialog', title, message),

  // ==================== 回收站 ====================
  /** 获取回收站内容 */
  getRecycleBin: () => ipcRenderer.invoke('get-recycle-bin'),
  /** 从回收站恢复 @param {string} id - Prompt ID */
  restoreFromRecycleBin: (id) => ipcRenderer.invoke('restore-from-recycle-bin', id),
  /** 彻底删除 @param {string} id - Prompt ID */
  permanentlyDelete: (id) => ipcRenderer.invoke('permanently-delete', id),
  /** 清空回收站 */
  emptyRecycleBin: () => ipcRenderer.invoke('empty-recycle-bin'),

  // ==================== 应用控制 ====================
  /** 重启应用 */
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),

  // ==================== 标签管理 ====================
  /** 获取所有标签 */
  getTags: () => ipcRenderer.invoke('get-tags'),
  /** 保存标签列表 @param {Array} tags - 标签数组 */
  saveTags: (tags) => ipcRenderer.invoke('save-tags', tags),
  /** 添加标签 @param {string} tag - 标签名称 */
  addTag: (tag) => ipcRenderer.invoke('add-tag', tag),
  /** 删除标签 @param {string} tag - 标签名称 */
  deleteTag: (tag) => ipcRenderer.invoke('delete-tag', tag),
  /** 重命名标签 @param {string} oldTag - 原标签名 @param {string} newTag - 新标签名 */
  renameTag: (oldTag, newTag) => ipcRenderer.invoke('rename-tag', oldTag, newTag)
});
