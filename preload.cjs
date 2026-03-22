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
  /** 获取所有 Prompts @param {string} sortBy - 排序字段 @param {string} sortOrder - 排序顺序 */
  getPrompts: (sortBy, sortOrder) => ipcRenderer.invoke('get-prompts', sortBy, sortOrder),
  /** 添加新 Prompt @param {Object} prompt - Prompt 数据 */
  addPrompt: (prompt) => ipcRenderer.invoke('add-prompt', prompt),
  /** 更新 Prompt @param {string} id - Prompt ID @param {Object} updates - 更新内容 */
  updatePrompt: (id, updates) => ipcRenderer.invoke('update-prompt', id, updates),
  /** 软删除提示词（移动到回收站） @param {string} id - Prompt ID */
  softDeletePrompt: (id) => ipcRenderer.invoke('soft-delete-prompt', id),
  /** 检查标题是否已存在 @param {string} title - 标题 @param {string} excludeId - 排除的ID */
  isTitleExists: (title, excludeId) => ipcRenderer.invoke('is-title-exists', title, excludeId),
  /** 搜索 Prompts @param {string} query - 搜索关键词 */
  searchPrompts: (query) => ipcRenderer.invoke('search-prompts', query),
  /** 保存所有 Prompts @param {Array} prompts - Prompt 数据数组 */
  savePrompts: (prompts) => ipcRenderer.invoke('save-prompts', prompts),
  /** 获取收藏的 Prompts */
  getFavoritePrompts: () => ipcRenderer.invoke('get-favorite-prompts'),
  /** 获取收藏的图像 */
  getFavoriteImages: () => ipcRenderer.invoke('get-favorite-images'),

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
  /** 选择目录（通用） */
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // ==================== 图像文件操作 ====================
  /** 保存图像文件 @param {string} sourcePath - 源路径 @param {string} fileName - 文件名 */
  saveImageFile: (sourcePath, fileName) => ipcRenderer.invoke('save-image-file', sourcePath, fileName),
  /** 获取图像完整路径 @param {string} relativePath - 相对路径 */
  getImagePath: (relativePath) => ipcRenderer.invoke('get-image-path', relativePath),
  /** 选择图像文件 */
  selectImageFiles: () => ipcRenderer.invoke('select-image-files'),
  /** 打开图像文件对话框（支持多选）@returns {Promise<string[]>} 选择的文件路径数组 */
  openImageFiles: () => ipcRenderer.invoke('dialog:open-image-files'),
  /** 清空所有数据 */
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  /** 获取所有图像信息 @param {string} sortBy - 排序字段 @param {string} sortOrder - 排序顺序 */
  getImages: (sortBy, sortOrder) => ipcRenderer.invoke('get-images', sortBy, sortOrder),
  /** 根据 ID 批量获取图像信息 @param {Array<string>} ids - 图像 ID 数组 */
  getImagesByIds: (ids) => ipcRenderer.invoke('get-images-by-ids', ids),
  /** 获取所有图像（用于统计） */
  getAllImagesForStats: () => ipcRenderer.invoke('get-all-images-for-stats'),
  /** 根据 ID 获取图像信息 @param {string} imageId - 图像 ID */
  getImageById: (imageId) => ipcRenderer.invoke('get-image-by-id', imageId),
  /** 获取提示词关联的图像 @param {string} promptId - 提示词 ID */
  getPromptImages: (promptId) => ipcRenderer.invoke('get-prompt-images', promptId),

  // ==================== 提示词回收站 ====================
  /** 获取提示词回收站内容 */
  getPromptTrash: () => ipcRenderer.invoke('get-prompt-trash'),
  /** 从提示词回收站恢复 @param {string} id - Prompt ID */
  restorePromptFromTrash: (id) => ipcRenderer.invoke('restore-prompt-from-trash', id),
  /** 永久删除提示词 @param {string} id - Prompt ID */
  permanentDeletePrompt: (id) => ipcRenderer.invoke('permanent-delete-prompt', id),
  /** 清空提示词回收站 */
  emptyPromptTrash: () => ipcRenderer.invoke('empty-prompt-trash'),

  // ==================== 应用控制 ====================
  /** 重启应用 @param {string} oldDataDir - 旧的数据库目录路径（可选） */
  relaunchApp: (oldDataDir) => ipcRenderer.invoke('relaunch-app', oldDataDir),

  // ==================== 提示词标签组管理 ====================
  /** 获取所有提示词标签组 */
  getPromptTagGroups: () => ipcRenderer.invoke('get-prompt-tag-groups'),
  /** 获取标签组（兼容旧 API） */
  getTagGroups: () => ipcRenderer.invoke('get-prompt-tag-groups'),
  /** 创建提示词标签组 @param {string} name - 组名称 @param {string} type - 类型 (single/multi) @param {number} sortOrder - 排序 */
  createPromptTagGroup: (name, type, sortOrder) => ipcRenderer.invoke('create-prompt-tag-group', name, type, sortOrder),
  /** 更新提示词标签组属性 @param {number} id - 组ID @param {object} updates - 更新内容 */
  updatePromptTagGroupAttrs: (id, updates) => ipcRenderer.invoke('update-prompt-tag-group-attrs', id, updates),
  /** 删除提示词标签组 @param {number} id - 组ID */
  deletePromptTagGroup: (id) => ipcRenderer.invoke('delete-prompt-tag-group', id),
  /** 获取带组信息的提示词标签 */
  getPromptTagsWithGroup: () => ipcRenderer.invoke('get-prompt-tags-with-group'),
  /** 分配提示词标签到所属组 @param {string} tagName - 标签名称 @param {number|null} groupId - 组ID */
  assignPromptTagToBelongGroup: (tagName, groupId) => ipcRenderer.invoke('assign-prompt-tag-to-belong-group', tagName, groupId),

  // ==================== 提示词标签管理 ====================
  /** 获取所有提示词标签 */
  getPromptTags: () => ipcRenderer.invoke('get-prompt-tags'),
  /** 添加提示词标签 @param {string} tag - 标签名称 */
  addPromptTag: (tag) => ipcRenderer.invoke('add-prompt-tag', tag),
  /** 删除提示词标签 @param {string} tag - 标签名称 */
  deletePromptTag: (tag) => ipcRenderer.invoke('delete-prompt-tag', tag),
  /** 重命名提示词标签 @param {string} oldTag - 原标签名 @param {string} newTag - 新标签名 */
  renamePromptTag: (oldTag, newTag) => ipcRenderer.invoke('rename-prompt-tag', oldTag, newTag),

  // ==================== 图像标签组管理 ====================
  /** 获取所有图像标签组 */
  getImageTagGroups: () => ipcRenderer.invoke('get-image-tag-groups'),
  /** 创建图像标签组 @param {string} name - 组名称 @param {string} type - 类型(single/multi) @param {number} sortOrder - 排序 */
  createImageTagGroup: (name, type, sortOrder) => ipcRenderer.invoke('create-image-tag-group', name, type, sortOrder),
  /** 更新图像标签组 @param {number} id - 组ID @param {object} updates - 更新内容 */
  updateImageTagGroupAttrs: (id, updates) => ipcRenderer.invoke('update-image-tag-group-attrs', id, updates),
  /** 删除图像标签组 @param {number} id - 组ID */
  deleteImageTagGroup: (id) => ipcRenderer.invoke('delete-image-tag-group', id),
  /** 获取带组信息的图像标签 */
  getImageTagsWithGroup: () => ipcRenderer.invoke('get-image-tags-with-group'),
  /** 分配图像标签到所属组 @param {string} tagName - 标签名称 @param {number|null} groupId - 组ID */
  assignImageTagToBelongGroup: (tagName, groupId) => ipcRenderer.invoke('assign-image-tag-to-belong-group', tagName, groupId),

  // ==================== 图像标签管理 ====================
  /** 获取所有图像标签 */
  getImageTags: () => ipcRenderer.invoke('get-image-tags'),
  /** 添加图像标签 @param {string} tag - 标签名称 */
  addImageTag: (tag) => ipcRenderer.invoke('add-image-tag', tag),
  /** 为图像添加多个标签 @param {string} imageId - 图像 ID @param {Array} tagNames - 标签名称数组 */
  addImageTags: (imageId, tagNames) => ipcRenderer.invoke('add-image-tags', imageId, tagNames),
  /** 更新图像 @param {string} id - 图像 ID @param {Object} updates - 更新内容 */
  updateImage: (id, updates) => ipcRenderer.invoke('update-image', id, updates),
  /** 重命名图像标签 @param {string} oldTag - 原标签名称 @param {string} newTag - 新标签名称 */
  renameImageTag: (oldTag, newTag) => ipcRenderer.invoke('rename-image-tag', oldTag, newTag),
  /** 删除图像标签 @param {string} tag - 标签名称 */
  deleteImageTag: (tag) => ipcRenderer.invoke('delete-image-tag', tag),

  // ==================== 图像回收站 ====================
  /** 获取图像回收站列表 */
  getImageTrash: () => ipcRenderer.invoke('get-image-trash'),
  /** 软删除图像（移动到回收站） @param {string} id - 图像 ID */
  softDeleteImage: (id) => ipcRenderer.invoke('soft-delete-image', id),
  /** 从回收站恢复图像 @param {string} id - 图像 ID */
  restoreImageFromTrash: (id) => ipcRenderer.invoke('restore-image-from-trash', id),
  /** 永久删除图像 @param {string} id - 图像 ID */
  permanentDeleteImage: (id) => ipcRenderer.invoke('permanent-delete-image', id),
  /** 清空图像回收站 */
  emptyImageTrash: () => ipcRenderer.invoke('empty-image-trash'),

  // ==================== 导出孤儿文件 ====================
  /** 扫描孤儿文件 */
  scanOrphanFiles: () => ipcRenderer.invoke('scan-orphan-files'),
  /** 导出并删除孤儿文件 @param {Array} orphanFiles - 孤儿文件列表 @param {string} exportDir - 导出目录 */
  exportAndDeleteOrphanFiles: (orphanFiles, exportDir) => ipcRenderer.invoke('export-and-delete-orphan-files', orphanFiles, exportDir),

  // ==================== 统计 ====================
  /** 获取数据库统计信息 */
  getStatistics: () => ipcRenderer.invoke('get-statistics'),

  // ==================== 数据库维护 ====================
  /** 优化数据库（执行 VACUUM 和 ANALYZE） */
  optimizeDatabase: () => ipcRenderer.invoke('optimize-database'),

  // ==================== 调试日志 ====================
  /** 记录调试日志 @param {string} component - 组件名 @param {string} message - 消息 @param {Object} data - 数据 */
  logDebug: (component, message, data) => ipcRenderer.invoke('log-debug', component, message, data),
  /** 记录错误日志 @param {string} component - 组件名 @param {string} message - 消息 @param {Object} data - 数据 */
  logError: (component, message, data) => ipcRenderer.invoke('log-error', component, message, data),
  /** 记录警告日志 @param {string} component - 组件名 @param {string} message - 消息 @param {Object} data - 数据 @param {string} logFile - 日志文件路径 */
  logWarn: (component, message, data, logFile) => ipcRenderer.invoke('log-warn', component, message, data, logFile),

  // ==================== 其他 ====================
  /** 获取旧数据目录路径（清空数据后） */
  getOldDataDir: () => ipcRenderer.invoke('get-old-data-dir')
});
