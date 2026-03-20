# 更新日志

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
