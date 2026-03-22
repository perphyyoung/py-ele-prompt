# 更新日志

## 20260322

### 图像上传功能重构

- 重构图像上传架构，分离 UI 渲染与业务逻辑
- 创建 ImagePreviewManager 专门负责预览渲染
- 简化 ImageUploadService 只保留核心上传功能
- 重构 UploadStrategies 移除 UI 逻辑，提取可复用策略类
- 采用 Safe File Dialogs 替代 `<input type="file">`，优化内存使用
- 实施事件委托优化，减少事件监听器数量

### 上传流程优化

- 重构为延迟保存策略：选择 → 预览 → 确认保存
- 支持多图上传，统一各入口上传逻辑
- 优化进度提示逻辑，小批量（≤3张）不显示进度

### 安全性增强

- 配置 CSP 安全策略，修复内联事件处理器错误
- 添加路径验证，增强安全性
- 修复 Windows 路径验证，支持任意盘符

### Bug 修复

- 修复图像详情界面新增上传后不渲染问题
- 修复上传成功提示信息出现 object 的问题

### 代码清理

- 删除未使用的临时文件相关代码
- 删除命名不清的 deleteImageFile API

## 20260321-2

### 双向禁止二级跳转

- 实现双向禁止二级跳转功能，防止详情界面间循环跳转
- 新增 `isFromDetailJump` 全局标志，追踪是否从详情界面跳转
- 图像详情界面：点击编辑提示词时设置标志，关闭时重置
- 提示词详情界面：点击 view-image 时设置标志，关闭时重置
- 禁用按钮添加 `disabled-secondary` 样式类，显示置灰效果和 hover 提示

### Bug 修复

- 修复 `ImageDetailManager.unlinkFromPrompt` 使用 `p.id` 而非 `p.promptId` 的 bug
- 修复 `addImagePrompts/addPromptImages` 函数 FOREIGN KEY constraint 错误处理

### 代码规范

- 统一 HTML ID 命名规范：`promptDetailXXX` 和 `imageDetailXXX` 格式
- 数据模型文档补充 `promptRefs` 和 `prompt.images` 完整字段说明

### 项目优化

- EventBus 添加 `once()` 一次性订阅方法
- 统一 renderer 层错误处理，使用 `logError` 写入文件
- `savePromptField` 添加操作锁防止重复提交
- 完善缓存同步机制

## 20260321

### 事件驱动架构与缓存优化

- 实现事件驱动架构，图像/提示词面板数据变更时自动双向刷新
- 统一使用 CacheManager 管理所有缓存
- 图像查询优化：getImagesByIds、getImagesCore、getPromptRefsForImages 消除 N+1 问题
- 提示词查询优化：重构 getFavoritePrompts、getDeletedPrompts 使用批量查询
- renderImagePreviews 优化：缓存命中跳过数据库查询，未命中按 ID 批量获取

### 对话框系统重构

- DialogService 改为静态方法，直接调用无需中间层
- DialogConfig 按功能分类重组：删除类、移动/恢复类、清空/重置类、其他
- 单按钮对话框：DATA_RESET 添加 singleButton 属性，确定按钮居中显示
- 对话框消息支持 \n 换行，使用 innerHTML 替代 textContent

### 设置功能优化

- 清空数据改为重命名当前数据目录并创建新的空数据目录
- 统一通过 CacheManager 管理缓存，删除兼容代码

### 其他优化

- 统一新建提示词的 images 参数格式为对象数组
- 修复上传图像创建提示词后图像详情面板不显示提示词信息的问题
- loadData/renderView 方法语义明确化
- 修复回收站 get-prompt-trash 同时获取提示词和图像问题
