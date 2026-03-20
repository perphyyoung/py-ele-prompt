# JS 文件树

## 主进程

``` bash
main.js                          # 应用主进程入口，管理窗口生命周期和 IPC 通信
database.js                      # 数据库操作层，封装 SQLite 数据存取
logger.js                        # 日志服务，记录应用运行日志
```

## 渲染进程

``` bash
renderer/
├── app.js                       # 应用主类，协调各管理器，处理全局状态和事件
├── app copy.js                  # 重构前代码备份
├── app.refactored.js            # 重构中间版本
├── constants.js                 # 应用常量定义，包括枚举和配置项
│
├── managers/                    # 管理器层 - 业务逻辑核心
│   ├── index.js                 # 管理器统一导出
│   │
│   ├── PanelManagerBase.js      # 面板管理器基类，提供列表/网格视图通用功能
│   ├── PromptPanelManager.js    # 提示词面板管理器，管理提示词列表展示
│   ├── ImagePanelManager.js     # 图像面板管理器，管理图像列表展示
│   │
│   ├── PromptDetailManager.js   # 提示词详情管理器，管理提示词编辑模态框
│   ├── ImageDetailManager.js    # 图像详情管理器，管理图像详情模态框
│   ├── DetailViewManager.js     # 详情视图管理器基类
│   │
│   ├── ImageFullscreenManager.js # 图像全屏查看管理器
│   ├── ImageSelectorManager.js  # 图像选择器管理器，提示词关联图像选择
│   ├── ImageUploadManager.js    # 图像上传管理器，处理图像上传流程
│   ├── ImageContextMenuManager.js # 图像右键菜单管理器
│   │
  │   ├── NewPromptManager.js      # 新建提示词管理器，管理新建提示词页面
  │   ├── TrashManager.js          # 回收站管理器，统一管理提示词和图像回收站
  │   │
  │   ├── SimpleTagManager.js      # 简单标签管理器，基础标签功能
  │   ├── TagRegistry.js           # 标签注册表，管理标签数据和业务逻辑
  │   ├── TagService.js            # 标签服务，封装标签相关 API 调用
  │   ├── TagUI.js                 # 标签 UI 组件，生成标签 HTML 和渲染
  │   │
│   ├── BatchOperationsManager.js # 批量操作管理器，处理批量删除等操作
│   ├── SearchSortManager.js     # 搜索排序管理器，处理搜索和排序逻辑
│   │
│   ├── NavigationManager.js     # 导航管理器，处理面板切换导航
│   ├── ToolbarManager.js        # 工具栏管理器，管理顶部工具栏
│   ├── ModalManager.js          # 模态框管理器，通用模态框控制
│   ├── ToastManager.js          # 提示管理器，显示操作提示
│   ├── SettingsManager.js       # 设置管理器，管理应用设置
│   ├── ImportExportManager.js   # 导入导出管理器，处理数据导入导出
│   │
│   ├── SharedComponents/        # 共享组件
│   │   ├── index.js             # 共享组件统一导出
│   │   ├── PanelRenderer.js     # 面板渲染器，渲染列表/网格视图容器
│   │   ├── PanelItemRenderer.js # 面板项渲染器，渲染单个提示词/图像项
│   │   ├── TagFilterHeader.js   # 标签筛选头部组件，渲染标签筛选栏
│   │   └── TagHtmlGenerator.js  # 标签 HTML 生成器，生成标签 HTML 字符串
│   │
│   └── bak/                     # 备份目录（重构前的旧代码）
│       ├── ImageTagManager.js
│       ├── PromptTagManager.js
│       ├── TagRegistryBase.js
│       ├── TagGroupTypeManager.js
│       └── TagGroupListManager.js
│
├── utils/                       # 工具类层
│   ├── index.js                 # 工具类统一导出
│   ├── HtmlUtils.js             # HTML 工具类，提供 escapeHtml、formatFileSize 等方法
│   ├── TextUtils.js             # 文本工具类
│   ├── isSameId.js              # ID 比较工具，统一处理 ID 类型比较
│   ├── EventBus.js              # 事件总线，提供发布订阅模式
│   ├── ShortcutManager.js       # 快捷键管理器，处理键盘快捷键绑定
│   ├── HoverTooltipManager.js   # 悬停提示管理器，处理鼠标悬停提示
│   ├── SaveManager.js           # 保存管理器，自动保存表单变更
│   ├── SaveStrategy.js          # 保存策略
│   ├── ListNavigator.js         # 列表导航器，处理列表项键盘导航
│   ├── CacheManager.js          # 缓存管理器，管理数据缓存
│   └── LRUCache.js              # LRU 缓存实现，有限容量缓存
│
├── components/                  # 组件层
│   ├── index.js                 # 组件统一导出
│   └── EditableTagList.js       # 可编辑标签列表组件，支持增删改标签
│
└── services/                    # 服务层
    └── SafeRatingService.js     # 安全评级服务，处理内容安全过滤
```

## 文件统计

| 目录 | 文件数 | 说明 |
| ------ | ------ | ------ |
| 主进程 | 3 | main.js, database.js, logger.js |
| managers | 28 | 业务管理器 |
| managers/SharedComponents | 4 | 共享组件 |
| utils | 10 | 工具类 |
| components | 1 | UI 组件 |
| services | 1 | 服务类 |
| **总计** | **52** | - |

## 架构分层

``` bash
┌─────────────────────────────────────┐
│  components/  UI 组件层              │
├─────────────────────────────────────┤
│  managers/    业务逻辑层             │
├─────────────────────────────────────┤
│  utils/       工具类层               │
├─────────────────────────────────────┤
│  services/    服务层                 │
├─────────────────────────────────────┤
│  main.js      主进程                 │
│  database.js  数据层                 │
└─────────────────────────────────────┘
```
