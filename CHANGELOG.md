# Changelog

## 0.6.8

- 支持选择工作区内子文件夹作为工程根
- 支持同一工作区内多个 MSPM0 工程并存与切换
- 嵌套工程生成 `${workspaceFolder}/相对路径` 的 launch/tasks 配置
- 侧边栏新增「选择文件夹」「刷新列表」
- 多工程列表改为可点击卡片（相对路径 + 芯片 + 当前高亮）
- 按当前编辑器文件自动切换活动工程（`mspm0.autoSwitchProject`，默认开启）
- 修复：父目录已是工程时不再停止扫描，可列出全部子工程
- 修复：新建工程默认在所选目录内创建，不再强制再套一层子文件夹
- 修复：子文件夹工程 IntelliSense 找不到 SDK 头文件（写入工作区根 `c_cpp_properties` + 绝对 SDK 路径）
- 修复：侧边栏 webview 脚本因反斜杠转义错误导致无法交互（Tools/Project 停在 `--`）

## 0.6.7

- 修复侧边栏操作提示不会自动消失的问题

## 0.6.6

- 修正 `mspm0.openOutputOnError` 语义：默认有输出就打开；启用后仅出错打开，成功仅状态栏提示

## 0.6.5

- 新增 `mspm0.openOutputOnError` 与状态栏动作反馈（点击打开输出）
- 成功/失败状态栏指示

## 0.6.4

- Portable tool paths: `.vscode` uses `${config:mspm0.*}` instead of hard-coded drive letters
- Extension/tasks inject `GCC_PATH`/`SDK`/… into make environment
- `toolpaths.mk` becomes optional local cache (`-include`), re-sync after moving machines

## 0.6.3

- 工作流默认全部开启：构建前 SysConfig、烧录/调试前构建、启动自动探测

## 0.6.2

- 移除多余的“构建并烧录”菜单与命令

## 0.6.1

- 状态栏仅保留左侧芯片/工程指示
- 编辑器 MSPM0 菜单标题去前缀，文案更简洁

## 0.6.0

- 侧边栏新增配置页（工作流开关 + 工具路径）
- 支持构建前自动 SysConfig、烧录/调试前自动构建
- 关闭烧录前构建时使用 `flash-only`

## 0.5.4

- 编辑器标题栏改为单个 MSPM0 下拉菜单
- 侧边栏标题保留 Build/Flash/Debug 与更多操作

## 0.5.3

- 状态栏/侧边栏/编辑器标题栏操作入口

## 0.5.2

- UI 交互优化
- Serial Monitor 官方 API 接入
- 串口波特率设置

## 0.5.0

- 全系列 MSPM0 芯片目录（39+）
- 多仿真器：J-Link / OpenOCD / XDS110 / CMSIS-DAP
- 设备感知 Makefile、startup、driverlib 与调试配置

## 0.4.0

- 初始化确认、新建工程、强制探测、串口入口

## 0.3.0

- 多根工作区、健康检查、配置合并、单测

## 0.2.0

- 官方模板、状态栏、单测与 smoke

## 0.1.0

- 侧边栏骨架、工具探测、初始化与基础闭环
