/**
 * 面板管理器导出
 */
export { PanelManagerBase } from './PanelManagerBase.js';
export { PromptPanelManager } from './PromptPanelManager.js';
export { ImagePanelManager } from './ImagePanelManager.js';

// 标签系统重构后的导出（4个文件替代原来的6个）
export { TagService } from './TagService.js';
export { TagRegistry } from './TagRegistry.js';
export { TagGroupAdmin } from './TagGroupAdmin.js';
export { TagUI } from './TagUI.js';

// 保留编辑界面专用标签管理器
export { SimpleTagManager } from './SimpleTagManager.js';

export { TrashManager } from './TrashManager.js';
export { BatchOperationsManager } from './BatchOperationsManager.js';
export { ImageFullscreenManager } from './ImageFullscreenManager.js';
export { DetailViewManager } from './DetailViewManager.js';
export { PromptDetailManager } from './PromptDetailManager.js';
export { ImageDetailManager } from './ImageDetailManager.js';
export { ModalManager } from './ModalManager.js';
export { ToastManager } from './ToastManager.js';
export { NavigationManager } from './NavigationManager.js';
export { SearchSortManager } from './SearchSortManager.js';
export { ToolbarManager } from './ToolbarManager.js';
export { ImportExportManager } from './ImportExportManager.js';
export { SettingsManager } from './SettingsManager.js';
export { ImageSelectorManager } from './ImageSelectorManager.js';
export { NewPromptManager } from './NewPromptManager.js';
export { RecycleBinManager } from './RecycleBinManager.js';
export { ImageUploadManager } from './ImageUploadManager.js';
export { ImageContextMenuManager } from './ImageContextMenuManager.js';

// 导出共享组件
export * from './SharedComponents/index.js';
