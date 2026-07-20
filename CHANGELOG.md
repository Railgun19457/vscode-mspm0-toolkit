# Changelog

## 0.7.4

- 工程列表：工作区根仅在「根已初始化 / 当前选中 / 工作区尚无任何工程」时显示
- monorepo 仅有子工程时不再长期显示未初始化的工作区根行

## 0.7.3

- 清理：移除未使用的 `generate(..., workspaceFolderRoot)` 参数与工作区根写入相关残留
- 清理：删除未使用的 `buildConfigurationForRoot`、`DeviceRegistry.defaultId/seriesList`
- 清理：类型去掉未使用的 `DeviceInfo.family` / `openocdTarget` 字段
- 清理：`check-sidebar` 纳入 `verify`；去掉重复的 `test:unit-compile`

## 0.7.2

- 嵌套工程 init/sync **不再**向工作区根写入 `.vscode/c_cpp_properties.json` 与 `.vscode/settings.json`
- IntelliSense 以 Custom Configuration Provider 为准；工程本地 `.vscode/c_cpp_properties.json` 仍生成（单开该文件夹时有用）

## 0.7.1

- 修复 Custom Configuration Provider：`includePath` 不再依赖 `/**`（对 Provider 不可靠）
- 按 Makefile 同样方式枚举 `src` 下含 `.h` 的子目录，支持 `#include "board.h"` 等嵌套头文件
- Provider 使用平台限定 `intelliSenseMode`（如 `windows-gcc-arm`），减少配置被整体判定失败

## 0.7.0

- IntelliSense：注册 C/C++ **Custom Configuration Provider**（`vscode-cpptools`），按源文件所属工程返回 include/defines
- 多工程 monorepo 下同名 `ti_msp_dl_config.h` 不再互相抢路径；可同时打开多个子工程文件且各自解析正确
- 嵌套工程同步时，工作区根不再 union `C_Cpp.default.includePath`（避免 ind 错 syscfg）；仍写入命名 `c_cpp_properties` 作为未装/未激活 Provider 时的兜底
- 依赖：`vscode-cpptools` API；`extensionDependencies` 声明 `ms-vscode.cpptools`

## 0.6.10

- 构建：Makefile 递归发现 `src/**/*.c`，支持嵌套业务目录（如 `src/Hardware/Src`）
- 构建：自动将 `src` 下含头文件的子目录加入 `-I`（如 `src/Hardware/Inc`）
- 构建：支持可选 `app.mk` 扩展 `EXTRA_SRCS` / `EXTRA_INCLUDES`（同步配置不会覆盖）

## 0.6.9

- 重构：构建 / 烧录 / 调试 / SysConfig 流水线统一到 `WorkflowService`（命令面板与侧边栏共用）
- 重构：插件设置读取收敛为 `readPluginSettings()`（`settingsService`）
- 重构：工作区路径工具抽出为 `workspacePath`（`ProjectService` / `DebugService` 共用）
- 重构：侧边栏 CSS/JS 拆分到 `media/sidebar/`，`sidebarHtml` 仅保留 HTML 壳与 CSP
- 简化：工具链检测共用目录校验与版本读取逻辑
- 简化：侧边栏前端设置与按钮改为表驱动，减少重复绑定代码
- 清理：移除无用别名、重复 `pathBasename` / 串口服务重复实例化等冗余

## 0.6.8

- 支持选择工作区内子文件夹作为工程根
- 支持同一工作区内多个 MSPM0 工程并存与切换
- 嵌套工程生成 `${workspaceFolder}/相对路径` 的 launch/tasks 配置
- 侧边栏新增「选择文件夹」「刷新列表」
- 多工程列表改为可点击卡片（相对路径 + 芯片 + 当前高亮）
- 按当前编辑器文件自动切换活动工程（`mspm0.autoSwitchProject`，默认开启）

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
