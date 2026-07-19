# MSPM0 Toolkit

![:MSPM0 Toolkit](https://count.getloli.com/@railgun19457_mspm0-toolkit?name=mspm0-toolkit&theme=miku&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto)

MSPM0 Toolkit 是一个面向 TI MSPM0 系列 MCU 开发的 VS Code 扩展  
通过调用系统配置的Arm GNU Toolchain、TI MSPM0 SDK等工具链，实现在VS Code中的全流程MSPM0开发

## 功能特性

- 一键初始化工程（`mspm0.project.json` 标准工程约定）
- 支持多种仿真器：J-Link / OpenOCD / TI XDS110 / CMSIS-DAP
- 一键启动构建 / 清理 / 烧录 / SysConfig GUI / 生成配置 / 调试 / 串口

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
5. 点击 **初始化工程**
6. 需要外设时打开 **SysConfig**，必要时点 **生成配置**
7. **构建** → **烧录** → **调试** / **串口**

已有工程时，也可直接使用编辑器右上角 **MSPM0** 下拉菜单操作。

## 界面说明

### 侧边栏

#### 控制台

| 区域     | 作用                                              |
| -------- | ------------------------------------------------- |
| 操作     | 构建、烧录、调试、清理、SysConfig、生成配置、串口 |
| 工程     | 工作区选择、初始化、新建工程、同步配置、健康检查  |
| 目标配置 | 芯片（可输入筛选）、仿真器、接口、速度            |

#### 配置页

| 区域       | 作用                                                    |
| ---------- | ------------------------------------------------------- |
| 工作流     | 构建前自动 SysConfig、烧录/调试前自动构建、启动自动探测 |
| 构建与串口 | 并行任务数、串口波特率、路径写入范围、默认芯片/仿真器   |
| 工具路径   | GCC / SDK / SysConfig / J-Link / OpenOCD / make         |

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
| `openOutputOnError`   | `false`      | 仅在出错时打开输出窗口。（默认为有输出时就打开） |

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


> 工具路径优先来自 VS Code 设置 `mspm0.*`（扩展运行 make 时注入环境变量；`.vscode` 使用 `${config:mspm0.*}`）。`toolpaths.mk` 仅作终端直接 `make` 的本机缓存，换机器后请再点一次 **同步配置**。

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
