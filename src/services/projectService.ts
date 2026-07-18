import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
	DEFAULT_TARGET,
	DeviceInfo,
	Mspm0ProjectFile,
	ProjectState,
	TargetConfig,
	ToolPaths,
} from '../model/types';
import { pathExists, readJsonFile, writeJsonFile, writeTextFile, ensureDir, copyFileIfMissing } from '../util/fsUtil';
import { DeviceRegistry } from './deviceRegistry';
import { ConfigGenerator } from './configGenerator';

export const PROJECT_FILE = 'mspm0.project.json';

export class ProjectService {
	private activeRoot?: string;

	constructor(
		private readonly extensionPath: string,
		private readonly devices: DeviceRegistry,
		private readonly configGenerator: ConfigGenerator
	) {}

	listWorkspaceFolders(): Array<{ name: string; path: string; initialized: boolean }> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		return folders.map((f) => ({
			name: f.name,
			path: f.uri.fsPath,
			initialized: this.isInitialized(f.uri.fsPath),
		}));
	}

	getWorkspaceRoot(): string | undefined {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (!folders.length) {
			this.activeRoot = undefined;
			return undefined;
		}
		if (this.activeRoot && folders.some((f) => f.uri.fsPath === this.activeRoot)) {
			return this.activeRoot;
		}
		const initialized = folders.find((f) => this.isInitialized(f.uri.fsPath));
		this.activeRoot = (initialized ?? folders[0]).uri.fsPath;
		return this.activeRoot;
	}

	setWorkspaceRoot(root: string | undefined): void {
		if (!root) {
			this.activeRoot = undefined;
			return;
		}
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (folders.some((f) => f.uri.fsPath === root)) {
			this.activeRoot = root;
		}
	}

	getProjectFilePath(root?: string): string | undefined {
		const base = root ?? this.getWorkspaceRoot();
		return base ? path.join(base, PROJECT_FILE) : undefined;
	}

	isInitialized(root?: string): boolean {
		const file = this.getProjectFilePath(root);
		return !!file && pathExists(file);
	}

	getState(root?: string): ProjectState {
		const base = root ?? this.getWorkspaceRoot();
		if (!base) {
			return { initialized: false };
		}
		const file = path.join(base, PROJECT_FILE);
		if (!pathExists(file)) {
			return {
				initialized: false,
				root: base,
				name: path.basename(base),
			};
		}
		try {
			const config = readJsonFile<Mspm0ProjectFile>(file);
			return {
				initialized: true,
				root: base,
				name: path.basename(base),
				config,
			};
		} catch {
			return {
				initialized: false,
				root: base,
				name: path.basename(base),
			};
		}
	}

	readConfig(root?: string): Mspm0ProjectFile | undefined {
		const file = this.getProjectFilePath(root);
		if (!file || !pathExists(file)) {
			return undefined;
		}
		return readJsonFile<Mspm0ProjectFile>(file);
	}

	async writeConfig(config: Mspm0ProjectFile, root?: string): Promise<void> {
		const base = root ?? this.getWorkspaceRoot();
		if (!base) {
			throw new Error('没有打开的工作区文件夹');
		}
		writeJsonFile(path.join(base, PROJECT_FILE), config);
	}

	async updateTargetConfig(partial: Partial<TargetConfig>, root?: string): Promise<Mspm0ProjectFile> {
		const current = this.readConfig(root);
		const merged: Mspm0ProjectFile = {
			version: 1,
			...DEFAULT_TARGET,
			...(current ?? {}),
			...partial,
		};
		if (this.isInitialized(root)) {
			await this.writeConfig(merged, root);
		}
		return merged;
	}

	checkHealth(root?: string, device?: { id: string; linker: string; startup: string }): import('../model/types').ProjectHealth {
		const base = root ?? this.getWorkspaceRoot();
		const issues: import('../model/types').ProjectHealth['issues'] = [];
		if (!base) {
			return { ok: false, issues: [{ level: 'error', code: 'no-workspace', message: '未打开工作区文件夹' }] };
		}
		const project = this.readConfig(base);
		if (!project) {
			issues.push({ level: 'warn', code: 'not-initialized', message: '工程未初始化（缺少 mspm0.project.json）' });
			return { ok: false, issues };
		}
		const requiredFiles = [
			'Makefile',
			'toolpaths.mk',
			'src/main.c',
			project.syscfgFile,
			'syscfg/ti_msp_dl_config.c',
			'syscfg/ti_msp_dl_config.h',
			path.join('linker', device?.linker ?? 'device.lds'),
			path.join('src', device?.startup ?? 'startup_mspm0g350x_gcc.c'),
			'.vscode/tasks.json',
			'.vscode/launch.json',
		];
		for (const rel of requiredFiles) {
			if (!pathExists(path.join(base, rel))) {
				issues.push({ level: 'error', code: 'missing-file', message: `缺少文件: ${rel}` });
			}
		}
		if (!issues.length) {
			issues.push({ level: 'ok', code: 'healthy', message: '工程文件齐全' });
		}
		return { ok: !issues.some((i) => i.level === 'error'), issues };
	}

	async initProject(target: TargetConfig, tools: ToolPaths, root?: string): Promise<void> {
		const base = root ?? this.getWorkspaceRoot();
		if (!base) {
			throw new Error('请先打开一个工作区文件夹');
		}
		this.setWorkspaceRoot(base);

		const device = this.devices.get(target.device);
		if (!device) {
			throw new Error(`未知芯片: ${target.device}`);
		}

		const project: Mspm0ProjectFile = {
			version: 1,
			...target,
			executable: `${target.buildDir}/${target.target}.out`,
		};

		await this.writeConfig(project, base);

		for (const d of ['src', 'syscfg', 'linker', 'build', '.vscode']) {
			ensureDir(path.join(base, d));
		}

		const templateRoot = path.join(this.extensionPath, 'templates', 'devices', device.template);
		const commonRoot = path.join(this.extensionPath, 'templates', 'common');

		this.copyTemplateTree(templateRoot, base);
		this.copyTemplateTree(commonRoot, base);

		// Device-specific define / driverlib / startup
		this.applyDeviceFiles(base, device, tools.sdk);

		const mainC = path.join(base, 'src', 'main.c');
		if (!pathExists(mainC)) {
			writeTextFile(mainC, this.defaultMainC(device.deviceDefine));
		}

		// Always refresh Makefile so probe/device flash rules stay correct
		writeTextFile(path.join(base, 'Makefile'), this.defaultMakefile(project, device));

		await this.configGenerator.generate(base, project, tools, device, this.extensionPath);
	}

	async syncConfig(tools: ToolPaths, root?: string): Promise<void> {
		const base = root ?? this.getWorkspaceRoot();
		if (!base) {
			throw new Error('请先打开一个工作区文件夹');
		}
		const project = this.readConfig(base);
		if (!project) {
			throw new Error('工程尚未初始化');
		}
		const device = this.devices.get(project.device);
		if (!device) {
			throw new Error(`未知芯片: ${project.device}`);
		}

		// Keep device files aligned when switching chips
		this.applyDeviceFiles(base, device, tools.sdk);
		writeTextFile(path.join(base, 'Makefile'), this.defaultMakefile(project, device));
		await this.configGenerator.generate(base, project, tools, device, this.extensionPath);
	}

	private applyDeviceFiles(base: string, device: DeviceInfo, sdkPath: string): void {
		ensureDir(path.join(base, 'linker'));
		ensureDir(path.join(base, 'src'));

		// device.opt: part define used by CFLAGS via @linker/device.opt
		writeTextFile(path.join(base, 'linker', 'device.opt'), `${device.deviceDefine.replace(/^/, '-D')}\n`);

		// driverlib genlibs
		const lib = device.driverlibLib || 'mspm0g1x0x_g3x0x';
		writeTextFile(
			path.join(base, 'linker', 'device.lds.genlibs'),
			[
				'/* Generated by MSPM0 Toolkit */',
				`INPUT("ti/driverlib/lib/gcc/m0p/${lib}/driverlib.a")`,
				'',
			].join('\n')
		);

		// startup: prefer SDK official file; fallback to template copy already present
		const startupName = device.startup;
		const destStartup = path.join(base, 'src', startupName);
		const sdkStartup = sdkPath
			? path.join(sdkPath, 'source', 'ti', 'devices', 'msp', 'm0p', 'startup_system_files', 'gcc', startupName)
			: '';
		if (sdkStartup && fs.existsSync(sdkStartup)) {
			fs.copyFileSync(sdkStartup, destStartup);
		} else if (!pathExists(destStartup)) {
			// try any startup from template folder already copied
			const srcDir = path.join(base, 'src');
			const existing = fs.existsSync(srcDir)
				? fs.readdirSync(srcDir).find((f) => f.startsWith('startup_') && f.endsWith('.c'))
				: undefined;
			if (existing && existing !== startupName) {
				fs.copyFileSync(path.join(srcDir, existing), destStartup);
			}
		}
	}

	private copyTemplateTree(srcRoot: string, destRoot: string): void {
		if (!fs.existsSync(srcRoot)) {
			return;
		}
		const walk = (dir: string) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const from = path.join(dir, entry.name);
				const rel = path.relative(srcRoot, from);
				const to = path.join(destRoot, rel);
				if (entry.isDirectory()) {
					ensureDir(to);
					walk(from);
				} else if (entry.isFile()) {
					const dest = to.endsWith('.tmpl') ? to.slice(0, -5) : to;
					copyFileIfMissing(from, dest);
				}
			}
		};
		walk(srcRoot);
	}

	private defaultMainC(_deviceDefine: string): string {
		return `/* Auto-generated by MSPM0 Toolkit */
#include "ti_msp_dl_config.h"

int main(void)
{
    SYSCFG_DL_init();

    while (1) {
        /* application loop */
    }
}
`;
	}

	private defaultMakefile(project: Mspm0ProjectFile, device: DeviceInfo): string {
		const lib = device.driverlibLib || 'mspm0g1x0x_g3x0x';
		const iface = (project.interface || 'swd').toUpperCase();
		const speed = project.speed || 4000;
		const probe = project.probe || 'jlink';
		const jlinkDevice = device.jlinkDevice || project.device;

		const flashCmd =
			probe === 'jlink'
				? `@"$(JLINK_EXE)" -device ${jlinkDevice} -if ${iface} -speed ${speed} -autoconnect 1 -CommanderScript .vscode/flash.jlink`
				: `@"$(OPENOCD)" -f .vscode/openocd.cfg -c "program $(BUILD)/$(TARGET).out verify reset exit"`;
		const flashRule = `flash: all
	${flashCmd}

flash-only:
	${flashCmd}
`;

		return `# Generated by MSPM0 Toolkit - edit with care
TARGET   ?= ${project.target}
BUILD    := ${project.buildDir}
PROBE    := ${probe}

include toolpaths.mk

SYSCONFIG_CLI := $(SYSCONFIG_ROOT)/sysconfig_cli.bat
SYSCONFIG_GUI := $(SYSCONFIG_ROOT)/sysconfig_gui.bat
CC            := $(GCC_PATH)/bin/arm-none-eabi-gcc
OBJCOPY       := $(GCC_PATH)/bin/arm-none-eabi-objcopy
SIZE          := $(GCC_PATH)/bin/arm-none-eabi-size
JLINK_EXE     := $(JLINK_ROOT)/JLink.exe
OPENOCD       := $(OPENOCD_BIN)/openocd

CPUFLAGS := -mcpu=cortex-m0plus -march=armv6-m -mthumb -mfloat-abi=soft
CFLAGS   := $(CPUFLAGS) -std=c99 -O2 -g -gstrict-dwarf -Wall \\
            -ffunction-sections -fdata-sections \\
            @linker/device.opt \\
            -D${device.familyDefine} \\
            -I. -Isrc -Isyscfg \\
            -I$(SDK)/source \\
            -I$(SDK)/source/third_party/CMSIS/Core/Include \\
            -I$(GCC_PATH)/arm-none-eabi/include

LDFLAGS  := $(CPUFLAGS) -nostartfiles -static -Wl,--gc-sections \\
            -Wl,-Map,$(BUILD)/$(TARGET).map \\
            -L$(SDK)/source \\
            -Wl,-T,linker/device.lds.genlibs \\
            -Tlinker/${device.linker} \\
            --specs=nano.specs --specs=nosys.specs \\
            -lgcc -lc -lm

SRCS := src/main.c \\
        src/${device.startup} \\
        syscfg/ti_msp_dl_config.c

OBJS := $(patsubst %.c,$(BUILD)/%.o,$(SRCS))

.PHONY: all clean size syscfg syscfg-gui flash flash-only

all: $(BUILD)/$(TARGET).out $(BUILD)/$(TARGET).hex size

$(BUILD)/$(TARGET).out: $(OBJS) linker/${device.linker}
	@echo Linking $@
	@$(CC) $(OBJS) $(LDFLAGS) -o $@

$(BUILD)/$(TARGET).hex: $(BUILD)/$(TARGET).out
	@$(OBJCOPY) -O ihex $< $@

$(BUILD)/%.o: %.c
	@if not exist $(subst /,\\\\,$(dir $@)) mkdir $(subst /,\\\\,$(dir $@))
	@echo CC $<
	@$(CC) $(CFLAGS) -c $< -o $@

size: $(BUILD)/$(TARGET).out
	@$(SIZE) $<

syscfg:
	@echo Generating SysConfig files...
	@$(SYSCONFIG_CLI) --compiler gcc --product $(SDK)/.metadata/product.json --output syscfg ${project.syscfgFile}

syscfg-gui:
	@echo Opening SysConfig GUI...
	@start "" "$(SYSCONFIG_GUI)" --product $(SDK)/.metadata/product.json --compiler gcc --output syscfg ${project.syscfgFile}

clean:
	@if exist $(BUILD) rmdir /S /Q $(BUILD)
	@echo Clean done.

${flashRule}`;
	}
}
