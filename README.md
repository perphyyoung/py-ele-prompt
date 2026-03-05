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
- 标签数据：`{数据目录}/tags.json`
- 回收站：`{数据目录}/recycle-bin.json`
- 图像文件：`{数据目录}/images/`
