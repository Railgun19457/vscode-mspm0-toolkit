/**
 * Local smoke test (no VS Code host):
 * copy device template -> write toolpaths/Makefile -> make
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function copyTree(srcRoot, destRoot) {
  if (!exists(srcRoot)) return;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const from = path.join(dir, entry.name);
      const rel = path.relative(srcRoot, from);
      const to = path.join(destRoot, rel);
      if (entry.isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        walk(from);
      } else if (entry.isFile()) {
        const dest = to.endsWith('.tmpl') ? to.slice(0, -5) : to;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (!exists(dest)) fs.copyFileSync(from, dest);
      }
    }
  };
  walk(srcRoot);
}

function writeText(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function detectTools() {
  const candidates = {
    gcc: ['D:/arm-gnu-toolchain', 'C:/arm-gnu-toolchain'],
    sdk: ['D:/TI/mspm0_sdk_2_05_01_00', 'C:/TI/mspm0_sdk_2_05_01_00'],
    sysconfig: ['D:/TI/sysconfig', 'C:/TI/sysconfig'],
    jlink: ['D:/JLink/JLink_V854', 'C:/Program Files/SEGGER/JLink'],
    make: ['D:/mingw64/bin', 'C:/mingw64/bin', 'C:/msys64/usr/bin'],
  };
  const tools = {};
  for (const [k, list] of Object.entries(candidates)) {
    tools[k] = list.find((p) => exists(p)) || '';
  }
  return tools;
}

function main() {
  const tools = detectTools();
  console.log('tools:', tools);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mspm0-smoke-'));
  console.log('project:', tmp);

  for (const d of ['src', 'syscfg', 'linker', 'build', '.vscode']) {
    fs.mkdirSync(path.join(tmp, d), { recursive: true });
  }

  copyTree(path.join(root, 'templates', 'devices', 'mspm0g3507'), tmp);

  writeText(path.join(tmp, 'mspm0.project.json'), JSON.stringify({
    version: 1,
    device: 'MSPM0G3507',
    target: 'app',
    buildDir: 'build',
    syscfgFile: 'syscfg/app.syscfg',
    executable: 'build/app.out',
    probe: 'jlink',
    interface: 'swd',
    speed: 4000,
  }, null, 2) + '\n');

  const fwd = (p) => (p || '').replace(/\\/g, '/');
  writeText(path.join(tmp, 'toolpaths.mk'), [
    `GCC_PATH=${fwd(tools.gcc || 'D:/arm-gnu-toolchain')}`,
    `SDK=${fwd(tools.sdk || 'D:/TI/mspm0_sdk_2_05_01_00')}`,
    `SYSCONFIG_ROOT=${fwd(tools.sysconfig || 'D:/TI/sysconfig')}`,
    `JLINK_ROOT=${fwd(tools.jlink || 'D:/JLink/JLink_V854')}`,
    `MAKE_BIN=${fwd(tools.make || 'D:/mingw64/bin')}`,
    '',
  ].join('\n'));

  writeText(path.join(tmp, 'Makefile'), `# smoke makefile
TARGET   ?= app
BUILD    := build
include toolpaths.mk
CC            := $(GCC_PATH)/bin/arm-none-eabi-gcc
OBJCOPY       := $(GCC_PATH)/bin/arm-none-eabi-objcopy
SIZE          := $(GCC_PATH)/bin/arm-none-eabi-size
CPUFLAGS := -mcpu=cortex-m0plus -march=armv6-m -mthumb -mfloat-abi=soft
CFLAGS   := $(CPUFLAGS) -std=c99 -O2 -g -gstrict-dwarf -Wall \\
            -ffunction-sections -fdata-sections \\
            @linker/device.opt \\
            -I. -Isrc -Isyscfg \\
            -I$(SDK)/source \\
            -I$(SDK)/source/third_party/CMSIS/Core/Include \\
            -I$(GCC_PATH)/arm-none-eabi/include
LDFLAGS  := $(CPUFLAGS) -nostartfiles -static -Wl,--gc-sections \\
            -Wl,-Map,$(BUILD)/$(TARGET).map \\
            -L$(SDK)/source \\
            -Wl,-T,linker/device.lds.genlibs \\
            -Tlinker/device.lds \\
            --specs=nano.specs --specs=nosys.specs \\
            -lgcc -lc -lm
SRCS := src/main.c src/startup_mspm0g350x_gcc.c syscfg/ti_msp_dl_config.c
OBJS := $(patsubst %.c,$(BUILD)/%.o,$(SRCS))
.PHONY: all clean size
all: $(BUILD)/$(TARGET).out $(BUILD)/$(TARGET).hex size
$(BUILD)/$(TARGET).out: $(OBJS) linker/device.lds
\t@$(CC) $(OBJS) $(LDFLAGS) -o $@
$(BUILD)/$(TARGET).hex: $(BUILD)/$(TARGET).out
\t@$(OBJCOPY) -O ihex $< $@
$(BUILD)/%.o: %.c
\t@if not exist $(subst /,\\,$(dir $@)) mkdir $(subst /,\\,$(dir $@))
\t@$(CC) $(CFLAGS) -c $< -o $@
size: $(BUILD)/$(TARGET).out
\t@$(SIZE) $<
clean:
\t@if exist $(BUILD) rmdir /S /Q $(BUILD)
`);

  const required = [
    'src/main.c',
    'src/startup_mspm0g350x_gcc.c',
    'linker/device.lds',
    'linker/device.opt',
    'linker/device.lds.genlibs',
    'syscfg/ti_msp_dl_config.c',
    'syscfg/ti_msp_dl_config.h',
    'syscfg/app.syscfg',
  ];
  for (const rel of required) {
    if (!exists(path.join(tmp, rel))) throw new Error('missing template output: ' + rel);
  }
  console.log('template skeleton: OK');

  if (!tools.gcc || !tools.sdk || !tools.make) {
    console.log('SKIP build: missing gcc/sdk/make');
    console.log('SMOKE_PARTIAL_OK');
    return;
  }

  const makeExe = path.join(tools.make, process.platform === 'win32' ? 'make.exe' : 'make');
  const pathEnv = [tools.make, path.join(tools.gcc, 'bin'), process.env.Path || process.env.PATH || ''].join(';');
  const env = { ...process.env, Path: pathEnv, PATH: pathEnv };
  const res = spawnSync(makeExe, ['-j8'], { cwd: tmp, env, encoding: 'utf8' });
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);
  if (res.status !== 0) {
    console.error('make failed with', res.status, res.error);
    process.exit(res.status || 1);
  }
  if (!exists(path.join(tmp, 'build', 'app.out'))) throw new Error('build/app.out not produced');
  console.log('build: OK');
  console.log('SMOKE_OK', tmp);
}

try { main(); } catch (err) { console.error(err); process.exit(1); }
