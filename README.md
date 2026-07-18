# MSPM0 Toolkit

语言 / Language: 简体中文

![:MSPM0 Toolkit](https://count.getloli.com/@railgun19457_mspm0-toolkit?name=mspm0-toolkit&theme=rule34&padding=6&offset=0&align=top&scale=1&pixelated=1&darkmode=auto)

MSPM0 Toolkit 是一个面向 TI MSPM0 系列 MCU 的 VS Code 扩展，在侧边栏中完成工具路径管理、工程初始化、构建、烧录、SysConfig、调试和串口入口，把零散工具链编排成一条可日常使用的开发流程。

## 功能特性

- 活动栏 **MSPM0** 侧边栏控制台（控制台页 + 配置页）
- 工具路径配置、自动探测、Doctor 检测
- 全系列芯片选择（MSPM0L / G / C / H / S，39+ 型号，支持输入筛选）
- 多种仿真器：J-Link / OpenOCD / TI XDS110 / CMSIS-DAP
- 一键初始化工程（`mspm0.project.json` 标准工程约定）
- 构建 / 清理 / 烧录 / SysConfig GUI / 生成配置 / 调试
- 工作流开关：构建前自动生成 SysConfig、烧录/调试前自动构建
- 多根工作区文件夹选择
- 工程健康检查、配置合并
- 串口监视器入口（Microsoft Serial Monitor）
- 编辑器右上角 MSPM0 下拉操作菜单
- 状态栏显示当前芯片型号

## 运行环境

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows（V1 主支持） |
| 编辑器 | VS Code `^1.85.0` |
| 编译工具 | Arm GNU Toolchain（`arm-none-eabi-gcc`） |
| 构建 | `make`（如 MinGW / MSYS2） |
| SDK | TI MSPM0 SDK |
| 配置工具 | TI SysConfig |
| 调试/烧录 | J-Link 和/或 OpenOCD（按仿真器选择） |
| 推荐扩展 | Cortex-Debug、C/C++、MSPM0 SVD Pack、Serial Monitor |

## 安装

### 方式一：安装 VSIX

1. 构建或从 Release 获取 `mspm0-toolkit-*.vsix`
2. 在 VS Code 中执行 `Extensions: Install from VSIX...`
3. 重新加载窗口

### 方式二：本地开发运行

```bash
npm install
npm run compile
```

按 `F5` 启动 Extension Development Host，打开活动栏 **MSPM0**。

## 快速开始

1. 打开空文件夹或现有工程工作区
2. 打开活动栏 **MSPM0** 侧边栏
3. 切到 **配置** 页，自动探测或手动填写工具路径
4. 在 **控制台** 页选择芯片与仿真器
5. 点击 **初始化工程**
6. 需要外设时打开 **SysConfig**，必要时点 **生成配置**
7. **构建** → **烧录** → **调试** / **串口**

已有工程时，也可直接使用编辑器右上角 **MSPM0** 下拉菜单操作。

## 界面说明

### 控制台页

| 区域 | 作用 |
| --- | --- |
| 操作 | 构建、烧录、调试、清理、SysConfig、生成配置、串口 |
| 工程 | 工作区选择、初始化、新建工程、同步配置、健康检查 |
| 目标配置 | 芯片（可输入筛选）、仿真器、接口、速度 |

### 配置页

| 区域 | 作用 |
| --- | --- |
| 工作流 | 构建前自动 SysConfig、烧录/调试前自动构建、启动自动探测 |
| 构建与串口 | 并行任务数、串口波特率、路径写入范围、默认芯片/仿真器 |
| 工具路径 | GCC / SDK / SysConfig / J-Link / OpenOCD / make |

### 其他入口

| 入口 | 作用 |
| --- | --- |
| 状态栏左侧芯片名 | 显示当前芯片，点击打开侧边栏 |
| 编辑器右上角 MSPM0 菜单 | 构建、烧录、调试、清理、串口、SysConfig 等 |
| 侧边栏标题栏按钮 | Build / Flash / Debug + 更多操作 |
| 命令面板 `MSPM0` | 全部命令 |

## 命令

| 命令 | 说明 |
| --- | --- |
| `MSPM0: 打开侧边栏` | 打开 MSPM0 控制台 |
| `MSPM0: 环境检测` | 校验工具路径与关键扩展 |
| `MSPM0: 自动探测工具路径` | 扫描本机常见安装位置 |
| `MSPM0: 强制覆盖探测工具路径` | 探测并覆盖已有路径 |
| `MSPM0: 初始化工程` | 在当前工作区生成标准工程 |
| `MSPM0: 新建工程到指定目录` | 创建新工程到所选目录 |
| `MSPM0: 同步配置` | 按当前目标/工具路径刷新生成配置 |
| `MSPM0: 构建` | `make -jN` 编译 |
| `MSPM0: 清理` | `make clean` |
| `MSPM0: 烧录` | 按仿真器烧录；可按设置先自动构建 |
| `MSPM0: 调试` | 启动 Cortex-Debug |
| `MSPM0: 打开 SysConfig GUI` | 启动 SysConfig 图形界面 |
| `MSPM0: SysConfig 生成代码` | CLI 生成 `ti_msp_dl_config.*` |
| `MSPM0: 工程健康检查` | 检查关键工程文件是否齐全 |
| `MSPM0: 打开串口监视器` | 打开 Serial Monitor |

## 配置项

均以 `mspm0.` 为前缀，可在 VS Code 设置或侧边栏 **配置** 页修改。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `gccPath` | `""` | Arm GNU Toolchain 根目录 |
| `sdkPath` | `""` | MSPM0 SDK 根目录 |
| `sysconfigPath` | `""` | SysConfig 安装目录 |
| `jlinkPath` | `""` | J-Link 安装目录 |
| `openocdPath` | `""` | OpenOCD `bin` 目录 |
| `makePath` | `""` | make 所在目录 |
| `defaultDevice` | `MSPM0G3507` | 默认芯片 |
| `defaultProbe` | `jlink` | 默认仿真器 |
| `buildJobs` | `8` | 并行编译任务数 |
| `autoDetectOnStartup` | `true` | 启动时若路径为空则自动探测 |
| `toolPathScope` | `user` | 路径写入用户设置或工作区设置 |
| `serialBaudRate` | `115200` | 串口默认波特率 |
| `autoSyscfgOnBuild` | `true` | 构建前自动执行 SysConfig 生成 |
| `buildBeforeFlash` | `true` | 烧录前自动构建 |
| `buildBeforeDebug` | `true` | 调试前自动构建 |

## 工程结构

初始化后的标准工程：

```text
MyProject/
├── mspm0.project.json
├── Makefile
├── toolpaths.mk
├── src/
│   ├── main.c
│   └── startup_*.c
├── syscfg/
│   ├── app.syscfg
│   ├── ti_msp_dl_config.c
│   └── ti_msp_dl_config.h
├── linker/
│   ├── device.lds
│   ├── device.opt
│   └── device.lds.genlibs
├── build/
└── .vscode/
    ├── tasks.json
    ├── launch.json
    ├── c_cpp_properties.json
    ├── settings.json
    ├── extensions.json
    ├── flash.jlink
    └── openocd.cfg
```

`mspm0.project.json` 示例：

```json
{
  "version": 1,
  "device": "MSPM0G3507",
  "probe": "jlink",
  "interface": "swd",
  "speed": 4000,
  "target": "app",
  "buildDir": "build",
  "syscfgFile": "syscfg/app.syscfg",
  "executable": "build/app.out"
}
```

## 芯片与仿真器

- 设备目录：`devices/devices.json`
- 初始化会按芯片写入 `linker/device.opt`、`linker/device.lds.genlibs`，并优先从 SDK 复制官方 startup
- **J-Link**：`JLink.exe` + `.vscode/flash.jlink`，调试 `servertype: jlink`
- **OpenOCD / XDS110 / CMSIS-DAP**：`.vscode/openocd.cfg`，调试 `servertype: openocd`

## 开发

```bash
npm install
npm run compile
npm run verify
```

`npm run verify` 包含：

- `npm run compile`
- `npm run test:unit`
- `npm run smoke`

打包：

```bash
npx @vscode/vsce package --no-dependencies --allow-missing-repository
```

## 常见问题

### 工具路径显示异常 / Tools Check

1. 打开 **配置** 页点击 **自动探测** 或 **强制覆盖探测**
2. 手动浏览填写缺失路径
3. 点击 **重新检测** 查看具体错误

### 烧录失败

1. 确认仿真器选择与实际硬件一致
2. J-Link 检查 `jlinkPath` 与连接；OpenOCD 系检查 `openocdPath`
3. 若关闭了“烧录前自动构建”，确认 `build/*.out` 已存在

### SysConfig 相关

- **SysConfig**：打开 GUI 编辑外设/引脚
- **生成配置**：根据 `app.syscfg` 重新生成 `ti_msp_dl_config.c/h`
- 开启“构建前自动生成 SysConfig”后，构建流程会先执行生成

### 串口打不开

1. 安装 `ms-vscode.vscode-serial-monitor`
2. 确认设备已枚举出 COM 口
3. 在配置页调整 `serialBaudRate`

## 许可证

[MIT](LICENSE)

## 致谢

- Texas Instruments MSPM0 SDK / SysConfig
- Cortex-Debug
- Microsoft Serial Monitor
