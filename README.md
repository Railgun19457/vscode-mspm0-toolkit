# MSPM0 Toolkit

![:MSPM0 Toolkit](https://count.getloli.com/@railgun19457_mspm0-toolkit?name=mspm0-toolkit&theme=miku&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto)

MSPM0 Toolkit 是一个面向 TI MSPM0 系列 MCU 开发的 VS Code 扩展  
通过调用系统配置的Arm GNU Toolchain、TI MSPM0 SDK等工具链，实现在VS Code中的全流程MSPM0开发

## 功能特性

- 一键初始化工程（`mspm0.project.json` 标准工程约定）
- 支持多种仿真器：J-Link / OpenOCD / TI XDS110 / CMSIS-DAP
- 一键启动构建 / 清理 / 烧录 / SysConfig GUI / 生成配置 / 调试 / 串口
- **多工程工作区**：同一工作区内可有多个 MSPM0 工程根（含子文件夹）

## 运行环境

| 项目         | 要求                                     |
| ------------ | ---------------------------------------- |
| 编辑器       | VS Code `^1.85.0`                        |
| 编译工具     | Arm GNU Toolchain（`arm-none-eabi-gcc`） |
| 构建         | `make`（如 MinGW / MSYS2）               |
| SDK          | TI MSPM0 SDK                             |
| 配置工具     | TI SysConfig                             |
| 调试/烧录    | J-Link / OpenOCD                         |


| 推荐扩展 | 扩展 ID | 作用 |
| --- | --- | --- |
| C/C++ Extension Pack | ms-vscode.cpptools-extension-pack | C/C++ 常用扩展合集 |
| Cortex-Debug | marus25.cortex-debug | GDB + J-Link/OpenOCD 调试（本扩展调试入口依赖） |
| MSPM0 Device Pack | ti-development-tools.cortex-debug-dp-mspm0 | MSPM0 外设寄存器 SVD 视图 |
| Serial Monitor | ms-vscode.vscode-serial-monitor | 串口监视（侧边栏串口入口） |
| Hex Editor | ms-vscode.hexeditor | 查看/编辑 hex、bin 等产物 |
| ARM | dan-c-underwood.arm | ARM 汇编语法支持 |

初始化工程时会写入 .vscode/extensions.json 推荐上述扩展。


## 快速开始

1. 打开空文件夹或现有工程工作区
2. 打开活动栏 **MSPM0** 侧边栏
3. 切到 **配置** 页，按需要配置所需工具路径
4. 在 **控制台** 页选择芯片与仿真器类型
5. 点击 **初始化工程**（或 **新建工程** 到所选目录）
6. 需要外设时打开 **SysConfig**，必要时点 **生成配置**
7. **构建** → **烧录** → **调试** / **串口**

已有工程时，也可直接使用编辑器右上角 **MSPM0** 下拉菜单操作。

### 多工程工作区

同一 VS Code 工作区内可以同时存在多个 MSPM0 工程（工作区根目录，或任意子文件夹中的 `mspm0.project.json`）。

典型 monorepo 布局：

```text
repo/                          ← VS Code 工作区根
├── apps/
│   ├── blink/                 ← 工程 A（含 mspm0.project.json）
│   └── uart/                  ← 工程 B
└── boards/
    └── demo/                  ← 工程 C
```

| 操作 | 说明 |
| ---- | ---- |
| 工程列表 | 侧边栏以卡片列出已发现工程（相对路径 + 芯片 + 当前高亮） |
| **选择文件夹** | 在工作区内指定任意子文件夹作为活动工程根（可先选再初始化） |
| **刷新列表** | 重新扫描工作区内的 `mspm0.project.json` |
| 点击卡片 | 切换活动工程；构建 / 烧录 / 调试均针对当前工程 |
| 自动切换 | 打开/切换源文件时，匹配包含该文件的最近工程根（可关，见配置项） |


嵌套工程同步配置时：

- `launch.json` / `tasks.json` 等使用 `${workspaceFolder}/相对路径`，调试与任务 cwd 指向子工程
- 工作区根会合并写入 `c_cpp_properties` / 相关设置，便于 C/C++ 扩展加载 IntelliSense

## 界面说明

### 侧边栏

#### 控制台

| 区域     | 作用                                                                 |
| -------- | -------------------------------------------------------------------- |
| 操作     | 构建、烧录、调试、清理、SysConfig、生成配置、串口                    |
| 工程     | 工程列表（多工程切换）、选择文件夹、刷新列表、初始化、新建、同步、健康检查 |
| 目标配置 | 芯片（可输入筛选）、仿真器、接口、速度                               |

#### 配置页

| 区域       | 作用                                                                 |
| ---------- | -------------------------------------------------------------------- |
| 工作流     | 构建前 SysConfig、烧录/调试前构建、启动自动探测、仅出错打开输出、按编辑器自动切换工程 |
| 构建与串口 | 并行任务数、串口波特率、路径写入范围、默认芯片/仿真器                |
| 工具路径   | GCC / SDK / SysConfig / J-Link / OpenOCD / make                      |

### 其他入口

| 入口                    | 作用                                       |
| ----------------------- | ------------------------------------------ |
| 状态栏（左下角）        | 显示当前芯片型号，点击打开侧边栏           |
| 状态栏提示（左下角）    | 显示构建/烧录等结果，点击打开输出日志      |
| 编辑器右上角 MSPM0 按钮 | 构建、烧录、调试、清理、串口、SysConfig 等 |
| 命令面板 `MSPM0`        | 全部命令                                   |

## 命令

| 命令                          | 说明                             |
| ----------------------------- | -------------------------------- |
| `MSPM0: 打开侧边栏`           | 打开 MSPM0 控制台                |
| `MSPM0: 环境检测`             | 校验工具路径与关键扩展           |
| `MSPM0: 自动探测工具路径`     | 扫描本机常见安装位置             |
| `MSPM0: 强制覆盖探测工具路径` | 探测并覆盖已有路径               |
| `MSPM0: 初始化工程`           | 在当前工作区生成标准工程         |
| `MSPM0: 新建工程到指定目录`   | 创建新工程到所选目录             |
| `MSPM0: 同步配置`             | 按当前目标/工具路径刷新生成配置  |
| `MSPM0: 构建`                 | `make -jN` 编译                  |
| `MSPM0: 清理`                 | `make clean`                     |
| `MSPM0: 烧录`                 | 按仿真器烧录；可按设置先自动构建 |
| `MSPM0: 调试`                 | 启动 Cortex-Debug                |
| `MSPM0: 打开 SysConfig GUI`   | 启动 SysConfig 图形界面          |
| `MSPM0: SysConfig 生成代码`   | CLI 生成 `ti_msp_dl_config.*`    |
| `MSPM0: 工程健康检查`         | 检查关键工程文件是否齐全         |
| `MSPM0: 打开串口监视器`       | 打开 Serial Monitor              |

## 配置项

均以 `mspm0.` 为前缀，可在 VS Code 设置或侧边栏 **配置** 页修改。

| 配置项                | 默认值       | 说明                                             |
| --------------------- | ------------ | ------------------------------------------------ |
| `gccPath`             | `""`         | Arm GNU Toolchain 根目录                         |
| `sdkPath`             | `""`         | MSPM0 SDK 根目录                                 |
| `sysconfigPath`       | `""`         | SysConfig 安装目录                               |
| `jlinkPath`           | `""`         | J-Link 安装目录                                  |
| `openocdPath`         | `""`         | OpenOCD `bin` 目录                               |
| `makePath`            | `""`         | make 所在目录                                    |
| `defaultDevice`       | `MSPM0G3507` | 默认芯片                                         |
| `defaultProbe`        | `jlink`      | 默认仿真器                                       |
| `buildJobs`           | `8`          | 并行编译任务数                                   |
| `autoDetectOnStartup` | `true`       | 启动时若路径为空则自动探测                       |
| `toolPathScope`       | `user`       | 路径写入用户设置或工作区设置                     |
| `serialBaudRate`      | `115200`     | 串口默认波特率                                   |
| `autoSyscfgOnBuild`   | `true`       | 构建前自动执行 SysConfig 生成                    |
| `buildBeforeFlash`    | `true`       | 烧录前自动构建                                   |
| `buildBeforeDebug`    | `true`       | 调试前自动构建                                   |
| `openOutputOnError`   | `false`      | 仅出错时自动打开输出窗口（默认：有输出就打开）   |
| `autoSwitchProject`   | `true`       | 按当前编辑器打开的文件自动切换活动 MSPM0 工程    |

## 工程结构

初始化后的标准工程（可位于工作区根，或任意子文件夹）：

```text
MyProject/                 
├── mspm0.project.json
├── Makefile              # 插件生成：递归编译 src/**/*.c
├── toolpaths.mk
├── app.mk                # 可选，用户维护：EXTRA_SRCS / EXTRA_INCLUDES
├── src/
│   ├── main.c
│   ├── startup_*.c
│   ├── Hardware/         # 支持任意嵌套
│   │   ├── Inc/*.h
│   │   └── Src/*.c
│   └── Function/
│       ├── Inc/*.h
│       └── Src/*.c
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

多工程时，每个含 `mspm0.project.json` 的目录各自拥有上述结构；活动工程由侧边栏列表或自动切换决定。

**复杂源码树**：插件生成的 Makefile 会：

1. 用 `rwildcard` 递归收集 `src/**/*.c`（含 `startup_*.c`）
2. 自动把 `src` 下含 `.h` 的目录加入编译 include 路径
3. `-include app.mk`，便于追加 SDK 外第三方源或额外 `-I`（该文件不会被「同步配置」覆盖）

`app.mk` 示例：

```make
# 追加仓库外/第三方源（路径相对工程根）
EXTRA_SRCS += third_party/foo/bar.c
EXTRA_INCLUDES += -Ithird_party/foo
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

> 工具路径优先来自 VS Code 设置 `mspm0.*`（扩展运行 make 时注入环境变量；`.vscode` 使用 `${config:mspm0.*}`）。`toolpaths.mk` 仅作终端直接 `make` 的本机缓存，换机器后请再点一次 **同步配置**。  
> 嵌套工程的调试/任务路径相对于 **VS Code 工作区根**（`${workspaceFolder}/apps/blink/...`），而不是子工程自身。

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
