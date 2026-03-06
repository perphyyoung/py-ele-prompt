# Prompt Manager

本地 Prompt 管理工具，基于 Electron 开发。

## 功能

- **Prompt 管理** - 创建、编辑、删除、搜索 Prompt
- **标签系统** - 为 Prompt 添加标签，支持标签筛选和管理
- **图像支持** - 为 Prompt 添加本地图像
- **回收站** - 删除的 Prompt 可恢复
- **导入导出** - 支持 JSON 格式备份
- **主题切换** - 明亮/暗黑模式

## 启动

```bash
start.bat
```

## 设置

- **数据目录** - 更改数据存储位置
- **图像清理** - 删除未引用的图像文件
- **重启** - 重启应用

## 数据存储

默认存储在应用目录下的 `py-data/` 文件夹中，可在设置中更改：

- Prompt 数据：`{数据目录}/prompts.json`
- 提示词标签数据：`{数据目录}/prompt-tags.json`
- 回收站：`{数据目录}/recycle-bin.json`
- 图像文件：`{数据目录}/images/`

### 图像数据结构

每个图像在 prompts.json 中存储以下信息：

```json
{
  "fileName": "原始文件名.jpg",
  "storedName": "时间戳_随机数.jpg",
  "path": "绝对路径",
  "relativePath": "images/存储名.jpg",
  "thumbnailPath": "thumbnails/thumb_存储名.jpg",
  "md5": "原图像MD5哈希",
  "thumbnailMD5": "缩略图MD5哈希"
}
```

**MD5 去重**：上传图像时会计算 MD5，如果已存在相同 MD5 的图像，则复用已有文件，避免重复存储。

## 项目结构

### 必需文件/目录

| 路径 | 说明 |
|------|------|
| `main.js` | Electron 主进程入口 |
| `preload.js` | 预加载脚本，暴露安全 API |
| `package.json` | 项目配置和依赖 |
| `start.bat` | 应用启动脚本 |
| `renderer/` | 渲染进程代码（HTML/CSS/JS） |
| `node_modules/` | npm 依赖包（安装后生成） |

### 运行时生成

| 路径 | 说明 |
|------|------|
| `{数据目录}/` | 数据存储目录（默认 `py-data/`，可配置） |
| `{数据目录}/prompts.json` | Prompt 数据 |
| `{数据目录}/prompt-tags.json` | 提示词标签数据 |
| `{数据目录}/recycle-bin.json` | 回收站数据 |
| `{数据目录}/images/` | 图像文件存储 |
| `{数据目录}/thumbnails/` | 缩略图缓存 |
| `config.json` | 应用配置文件 |

## License

MIT
