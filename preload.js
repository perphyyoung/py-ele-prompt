const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // Prompt 管理
  getPrompts: () => ipcRenderer.invoke('get-prompts'),
  addPrompt: (prompt) => ipcRenderer.invoke('add-prompt', prompt),
  updatePrompt: (id, updates) => ipcRenderer.invoke('update-prompt', id, updates),
  deletePrompt: (id) => ipcRenderer.invoke('delete-prompt', id),
  searchPrompts: (query) => ipcRenderer.invoke('search-prompts', query),

  // 导入导出
  exportPrompts: (prompts) => ipcRenderer.invoke('export-prompts', prompts),
  importPrompts: () => ipcRenderer.invoke('import-prompts'),

  // 剪贴板
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // 全屏控制
  setFullscreen: (flag) => ipcRenderer.invoke('set-fullscreen', flag),

  // 设置
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  selectDataPath: () => ipcRenderer.invoke('select-data-path'),

  // 图像文件操作
  saveImageFile: (sourcePath, fileName) => ipcRenderer.invoke('save-image-file', sourcePath, fileName),
  deleteImageFile: (storedName) => ipcRenderer.invoke('delete-image-file', storedName),
  getImagePath: (relativePath) => ipcRenderer.invoke('get-image-path', relativePath),
  selectImageFiles: () => ipcRenderer.invoke('select-image-files'),
  cleanupUnusedImages: () => ipcRenderer.invoke('cleanup-unused-images'),

  // 对话框
  showConfirmDialog: (title, message) => ipcRenderer.invoke('show-confirm-dialog', title, message),

  // 回收站
  getRecycleBin: () => ipcRenderer.invoke('get-recycle-bin'),
  restoreFromRecycleBin: (id) => ipcRenderer.invoke('restore-from-recycle-bin', id),
  permanentlyDelete: (id) => ipcRenderer.invoke('permanently-delete', id),
  emptyRecycleBin: () => ipcRenderer.invoke('empty-recycle-bin'),

  // 应用控制
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),

  // 标签管理
  getTags: () => ipcRenderer.invoke('get-tags'),
  saveTags: (tags) => ipcRenderer.invoke('save-tags', tags),
  addTag: (tag) => ipcRenderer.invoke('add-tag', tag),
  deleteTag: (tag) => ipcRenderer.invoke('delete-tag', tag),
  renameTag: (oldTag, newTag) => ipcRenderer.invoke('rename-tag', oldTag, newTag)
});
