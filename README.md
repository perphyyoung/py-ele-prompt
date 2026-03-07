# Prompt Manager

本地 Prompt 管理工具，基于 Electron 开发。

## 功能

- **Prompt 管理** - 创建、编辑、删除、搜索 Prompt
- **标签系统** - 分离提示词标签和图像标签，支持标签筛选和管理
- **标签多选** - Shift 键多选标签进行组合筛选
- **收藏功能** - Prompt 和图像支持收藏/取消收藏，快速访问
- **排序功能** - 支持按更新时间、创建时间、标题排序
- **搜索功能** - 数据库层面的内容搜索，支持防抖优化
- **图像支持** - 为 Prompt 添加本地图像，支持图像管理和详情查看
- **图像导航** - 图像详情页支持左右切换、键盘导航、全屏查看
- **图像提示词预览** - 鼠标悬停图像卡片显示关联提示词
- **未引用图像** - 识别和管理未被 Prompt 引用的图像
- **回收站** - 删除的 Prompt 和图像可恢复
- **导入导出** - 支持 JSON 格式备份
- **主题切换** - 明亮/暗黑模式（移至设置界面）
- **侧边栏收起** - 可收起侧边栏，扩大内容区域
- **系统托盘** - 最小化到系统托盘
- **页面记忆** - 重启后恢复上次打开的页面

## 启动

### 生产环境启动

使用 `start-hidden.vbs` 启动，不显示命令行窗口：

```bash
start-hidden.vbs
```

### 调试模式启动

使用 `start-debug.bat` 启动，会显示控制台日志：

```bash
start-debug.bat
```

### 开发环境启动（需安装 Node.js）

在项目根目录执行：

```bash
# 安装依赖
cnpm install

# 启动应用
cnpm start
```

## 设置

设置界面采用卡片式布局，包含以下功能：

- **外观** - 切换明亮/暗黑主题
- **数据存储** - 更改数据存储目录
- **数据管理**
  - **导入** - 从 JSON 文件导入所有 Prompt 数据
  - **导出** - 将所有 Prompt 数据导出为 JSON 文件
  - **清理未引用图像** - 删除未被任何 Prompt 引用的图像文件，释放存储空间
- **危险操作**
  - **清空所有数据** - 一键清空所有提示词、图像和标签数据（不可恢复）

## 数据存储

默认存储在应用目录下的 `py-data/` 文件夹中，可在设置中更改：

- **SQLite 数据库**：`{数据目录}/prompt-manager.db`
- **图像文件**：`{数据目录}/images/`
- **缩略图**：`{数据目录}/thumbnails/`

### 数据库结构

使用 SQLite 数据库存储所有数据，主要表结构：

| 表名 | 说明 |
|------|------|
| `prompts` | 提示词数据（标题、内容、创建时间、收藏状态等） |
| `images` | 图像数据（文件名、路径、MD5、尺寸、收藏状态等） |
| `prompt_tags` | 提示词标签 |
| `image_tags` | 图像标签 |
| `prompt_tag_relations` | 提示词与标签的关联关系 |
| `image_tag_relations` | 图像与标签的关联关系 |
| `prompt_images` | 提示词与图像的关联关系 |
| `recycle_bin` | 回收站数据 |

### 图像数据结构

```json
{
  "fileName": "原始文件名.jpg",
  "storedName": "时间戳_随机数.jpg",
  "path": "绝对路径",
  "relativePath": "images/存储名.jpg",
  "thumbnailPath": "thumbnails/thumb_存储名.jpg",
  "md5": "原图像MD5哈希",
  "thumbnailMD5": "缩略图MD5哈希",
  "width": 1920,
  "height": 1080
}
```

**MD5 去重**：上传图像时会计算 MD5，如果已存在相同 MD5 的图像，则复用已有文件，避免重复存储。

## 项目结构

### 必需文件/目录

| 路径 | 说明 |
|------|------|
| `main.js` | Electron 主进程入口 |
| `preload.js` | 预加载脚本，暴露安全 API |
| `database.js` | SQLite 数据库操作模块 |
| `package.json` | 项目配置和依赖 |
| `start-debug.bat` | 调试模式启动脚本 |
| `start-hidden.vbs` | 静默启动脚本（无命令行窗口） |
| `renderer/` | 渲染进程代码（HTML/CSS/JS） |
| `node_modules/` | npm 依赖包（安装后生成） |

### 运行时生成

| 路径 | 说明 |
|------|------|
| `{数据目录}/` | 数据存储目录（默认 `py-data/`，可配置） |
| `{数据目录}/prompt-manager.db` | SQLite 数据库 |
| `{数据目录}/images/` | 图像文件存储 |
| `{数据目录}/thumbnails/` | 缩略图缓存 |
| `config.json` | 应用配置文件 |

## License

MIT
