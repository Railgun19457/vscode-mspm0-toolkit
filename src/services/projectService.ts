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
	WorkspaceFolderInfo,
} from '../model/types';
import { pathExists, readJsonFile, writeJsonFile, writeTextFile, ensureDir, copyFileIfMissing } from '../util/fsUtil';
import {
	findContainingWorkspaceFolder,
	isPathInsideRoot,
	normalizeRoot,
	pathKey,
} from '../util/workspacePath';
import { DeviceRegistry } from './deviceRegistry';
import { ConfigGenerator } from './configGenerator';

export const PROJECT_FILE = 'mspm0.project.json';

/** Directories skipped while scanning for nested projects. */
const SCAN_SKIP_DIRS = new Set([
	'.git',
	'.svn',
	'.hg',
	'node_modules',
	'build',
	'dist',
	'out',
	'.vscode',
	'.idea',
	'__pycache__',
	'.cache',
	'Debug',
	'Release',
]);

export class ProjectService {
	/** Active project root (may be a workspace folder or any subfolder under it). */
	private activeRoot?: string;

	constructor(
		private readonly extensionPath: string,
		private readonly devices: DeviceRegistry,
		private readonly configGenerator: ConfigGenerator
	) {}

	/**
	 * List selectable project roots for the sidebar:
	 * - initialized projects (workspace-root and/or nested `mspm0.project.json`)
	 * - the active root when set (even if not yet initialized)
	 * - uninitialized workspace-folder roots only when no initialized project exists
	 *   (placeholder for first init / create), so monorepos with only nested apps
	 *   do not show a permanent "○ workspace root" row.
	 *
	 * Continues scanning under initialized parents so sibling/nested projects
	 * (e.g. apps/a, apps/b under a workspace that itself has a project file) are found.
	 */
	listWorkspaceFolders(): WorkspaceFolderInfo[] {
		const folders = vscode.workspace.workspaceFolders ?? [];
		const byPath = new Map<string, WorkspaceFolderInfo>();
		/** Uninitialized workspace roots kept only as empty-workspace placeholders. */
		const uninitWorkspaceRoots: WorkspaceFolderInfo[] = [];

		const activeAbs = this.activeRoot ? normalizeRoot(this.activeRoot) : undefined;
		const activeKey = activeAbs ? pathKey(activeAbs) : undefined;

		for (const f of folders) {
			const abs = normalizeRoot(f.uri.fsPath);
			const rootKey = pathKey(abs);
			const rootInitialized = this.isInitialized(abs);
			const rootInfo = this.enrichProjectInfo({
				name: f.name,
				path: abs,
				initialized: rootInitialized,
				relativePath: '.',
				isWorkspaceRoot: true,
				workspaceFolder: abs,
			});

			// Always list an initialized workspace-root project.
			// Uninitialized roots are deferred unless they are the active selection
			// or needed as an empty-workspace placeholder (see below).
			if (rootInitialized || (activeKey !== undefined && activeKey === rootKey)) {
				byPath.set(rootKey, rootInfo);
			} else {
				uninitWorkspaceRoots.push(rootInfo);
			}

			for (const proj of this.scanProjectsUnder(abs, f.name)) {
				const key = pathKey(proj.path);
				if (byPath.has(key)) {
					const existing = byPath.get(key)!;
					// Keep workspace-root display name; upgrade initialized flag/meta.
					byPath.set(key, this.enrichProjectInfo({
						...existing,
						initialized: existing.initialized || proj.initialized,
						relativePath: existing.isWorkspaceRoot ? existing.relativePath : proj.relativePath,
						workspaceFolder: existing.workspaceFolder || proj.workspaceFolder,
						// Prefer shorter display name for nested projects when not workspace root
						name: existing.isWorkspaceRoot ? existing.name : proj.name,
						isWorkspaceRoot: existing.isWorkspaceRoot || proj.isWorkspaceRoot,
						path: existing.path,
					}));
				} else {
					byPath.set(key, this.enrichProjectInfo(proj));
				}
			}
		}

		// Ensure the currently selected root appears even if not yet initialized / not scanned.
		if (activeAbs && activeKey && !byPath.has(activeKey) && this.isPathInsideWorkspace(activeAbs) && pathExists(activeAbs)) {
			const ws = this.getContainingWorkspaceFolder(activeAbs);
			const rel = ws
				? path.relative(ws.uri.fsPath, activeAbs).replace(/\\/g, '/') || '.'
				: path.basename(activeAbs);
			const isRoot = !!ws && pathKey(ws.uri.fsPath) === activeKey;
			byPath.set(activeKey, this.enrichProjectInfo({
				name: rel === '.' ? path.basename(activeAbs) : rel,
				path: activeAbs,
				initialized: this.isInitialized(activeAbs),
				relativePath: rel,
				isWorkspaceRoot: isRoot,
				workspaceFolder: ws ? normalizeRoot(ws.uri.fsPath) : undefined,
			}));
		}

		// Empty workspace (no initialized project at all): show uninitialized workspace
		// folder roots so the user has a target for init / create.
		const hasInitialized = Array.from(byPath.values()).some((p) => p.initialized);
		if (!hasInitialized) {
			for (const root of uninitWorkspaceRoots) {
				const key = pathKey(root.path);
				if (!byPath.has(key)) {
					byPath.set(key, root);
				}
			}
		}

		return Array.from(byPath.values()).sort((a, b) => {
			// Initialized projects first, then by relative/display name
			if (a.initialized !== b.initialized) {
				return a.initialized ? -1 : 1;
			}
			return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
		});
	}

	/**
	 * Find the best matching project root for a file path.
	 * Prefers the deepest *initialized* project that contains the file;
	 * falls back to the deepest listed root only when no initialized match exists.
	 */
	findProjectForFile(filePath: string | undefined): WorkspaceFolderInfo | undefined {
		if (!filePath) {
			return undefined;
		}
		// Reject non-fs paths / URI schemes if a raw URI was passed by mistake
		const trimmed = String(filePath).trim();
		if (!trimmed || /^(untitled|output|git|vscode-|walkThrough):/i.test(trimmed)) {
			return undefined;
		}
		// Strip file:// if present
		let raw = trimmed;
		if (/^file:/i.test(raw)) {
			try {
				raw = vscode.Uri.parse(raw).fsPath;
			} catch {
				return undefined;
			}
		}

		let abs: string;
		try {
			abs = normalizeRoot(raw);
		} catch {
			return undefined;
		}

		const candidates = this.listWorkspaceFolders();
		if (!candidates.length) {
			return undefined;
		}

		const matches = candidates.filter((p) => isPathInsideRoot(abs, p.path));
		if (!matches.length) {
			return undefined;
		}

		const score = (p: WorkspaceFolderInfo): [number, number] => {
			// Higher is better: initialized first, then deeper (longer) path
			return [p.initialized ? 1 : 0, pathKey(p.path).length];
		};

		matches.sort((a, b) => {
			const sa = score(a);
			const sb = score(b);
			if (sa[0] !== sb[0]) {
				return sb[0] - sa[0];
			}
			return sb[1] - sa[1];
		});

		return matches[0];
	}

	/**
	 * Switch active project to the one owning filePath.
	 * Returns the new root when switched, undefined when no change / no match.
	 */
	switchToProjectForFile(filePath: string | undefined): string | undefined {
		const hit = this.findProjectForFile(filePath);
		if (!hit) {
			return undefined;
		}
		const current = this.getWorkspaceRoot();
		if (current && pathKey(current) === pathKey(hit.path)) {
			return undefined;
		}
		// Force active root even if path comparison earlier was stale
		this.activeRoot = normalizeRoot(hit.path);
		return this.activeRoot;
	}

	private enrichProjectInfo(info: WorkspaceFolderInfo): WorkspaceFolderInfo {
		const abs = normalizeRoot(info.path);
		const shortName = path.basename(abs) || info.name;
		let device: string | undefined = info.device;
		if (info.initialized) {
			try {
				const cfg = this.readConfig(abs);
				device = cfg?.device || device;
			} catch {
				// ignore
			}
		}
		// Prefer compact relative path for nested projects in the dropdown.
		const rel = (info.relativePath || '.').replace(/\\/g, '/');
		const display =
			info.isWorkspaceRoot
				? info.name
				: rel && rel !== '.'
					? rel
					: shortName;
		return {
			...info,
			path: abs,
			name: display,
			shortName,
			device,
		};
	}

	/**
	 * Active project root used by build/flash/debug/init.
	 * Accepts workspace folder roots and nested project folders.
	 */
	getWorkspaceRoot(): string | undefined {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (!folders.length) {
			this.activeRoot = undefined;
			return undefined;
		}

		if (this.activeRoot) {
			const abs = normalizeRoot(this.activeRoot);
			if (this.isPathInsideWorkspace(abs)) {
				this.activeRoot = abs;
				return abs;
			}
		}

		// Prefer an already-initialized project (nested or root).
		const projects = this.listWorkspaceFolders();
		const initialized = projects.find((p) => p.initialized);
		if (initialized) {
			this.activeRoot = initialized.path;
			return this.activeRoot;
		}

		this.activeRoot = normalizeRoot(folders[0].uri.fsPath);
		return this.activeRoot;
	}

	setWorkspaceRoot(root: string | undefined): void {
		if (!root) {
			this.activeRoot = undefined;
			return;
		}
		const abs = normalizeRoot(root);
		const folders = vscode.workspace.workspaceFolders ?? [];
		// When a workspace is open, only accept paths inside it.
		// With no workspace (unit tests / bare usage), still allow explicit roots.
		if (folders.length && !this.isPathInsideWorkspace(abs)) {
			return;
		}
		if (!pathExists(abs) || !fs.statSync(abs).isDirectory()) {
			return;
		}
		this.activeRoot = abs;
	}

	/** Nearest VS Code workspace folder that contains the given path. */
	getContainingWorkspaceFolder(projectRoot?: string): vscode.WorkspaceFolder | undefined {
		const base = projectRoot ?? this.getWorkspaceRoot();
		if (!base) {
			return undefined;
		}
		return findContainingWorkspaceFolder(base);
	}

	/**
	 * Path of projectRoot relative to its VS Code workspace folder.
	 * Returns '.' when projectRoot is the workspace folder itself.
	 */
	getProjectRelFromWorkspace(projectRoot?: string): string {
		const base = projectRoot ?? this.getWorkspaceRoot();
		if (!base) {
			return '.';
		}
		const ws = this.getContainingWorkspaceFolder(base);
		if (!ws) {
			return '.';
		}
		const rel = path.relative(ws.uri.fsPath, base);
		if (!rel || rel === '') {
			return '.';
		}
		return rel.replace(/\\/g, '/');
	}

	isPathInsideWorkspace(target: string): boolean {
		const folders = vscode.workspace.workspaceFolders ?? [];
		return folders.some((f) => isPathInsideRoot(target, f.uri.fsPath));
	}

	/**
	 * BFS scan for mspm0.project.json under a workspace folder.
	 * Depth-limited to avoid expensive walks on huge trees.
	 * Continues into subfolders even when the current dir is a project, so
	 * monorepos with multiple projects under an initialized parent are listed.
	 */
	private scanProjectsUnder(workspaceRoot: string, workspaceName: string, maxDepth = 8): WorkspaceFolderInfo[] {
		const results: WorkspaceFolderInfo[] = [];
		const rootAbs = normalizeRoot(workspaceRoot);
		const visited = new Set<string>();
		const queue: Array<{ dir: string; depth: number }> = [{ dir: rootAbs, depth: 0 }];

		while (queue.length) {
			const { dir, depth } = queue.shift()!;
			const dirAbs = normalizeRoot(dir);
			const dirKey = pathKey(dirAbs);
			if (visited.has(dirKey)) {
				continue;
			}
			visited.add(dirKey);

			const projectFile = path.join(dirAbs, PROJECT_FILE);
			if (pathExists(projectFile)) {
				const rel = path.relative(rootAbs, dirAbs).replace(/\\/g, '/') || '.';
				const display =
					rel === '.'
						? workspaceName
						: rel.includes('/')
							? `${workspaceName}/${rel}`
							: rel;
				results.push({
					name: display,
					path: dirAbs,
					initialized: true,
					relativePath: rel,
					isWorkspaceRoot: rel === '.',
					workspaceFolder: rootAbs,
				});
				// Keep scanning children: sibling-level projects may sit under a
				// parent that also has mspm0.project.json (common monorepo mistake).
			}

			if (depth >= maxDepth) {
				continue;
			}

			let entries: fs.Dirent[];
			try {
				entries = fs.readdirSync(dirAbs, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const entry of entries) {
				// Some Node versions report symlinked dirs as isSymbolicLink only.
				const isDir = entry.isDirectory() || entry.isSymbolicLink();
				if (!isDir) {
					continue;
				}
				if (SCAN_SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
					continue;
				}
				const child = path.join(dirAbs, entry.name);
				// Skip non-directories after following (e.g. symlink to file).
				try {
					if (!fs.statSync(child).isDirectory()) {
						continue;
					}
				} catch {
					continue;
				}
				queue.push({ dir: child, depth: depth + 1 });
			}
		}

		return results;
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
		const displayName = this.displayNameForRoot(base);
		const file = path.join(base, PROJECT_FILE);
		if (!pathExists(file)) {
			return {
				initialized: false,
				root: base,
				name: displayName,
			};
		}
		try {
			const config = readJsonFile<Mspm0ProjectFile>(file);
			return {
				initialized: true,
				root: base,
				name: displayName,
				config,
			};
		} catch {
			return {
				initialized: false,
				root: base,
				name: displayName,
			};
		}
	}

	/** Compact label: relative path under workspace when nested, else folder name. */
	private displayNameForRoot(root: string): string {
		const rel = this.getProjectRelFromWorkspace(root);
		if (rel && rel !== '.') {
			return rel.replace(/\\/g, '/');
		}
		return path.basename(root);
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
		// Prefer selecting the new project as active when it sits inside the workspace.
		// Outside-workspace creates (e.g. "新建工程" then open elsewhere) simply skip.
		const abs = normalizeRoot(base);
		if (this.isPathInsideWorkspace(abs)) {
			this.activeRoot = abs;
		} else if (!(vscode.workspace.workspaceFolders?.length)) {
			// No VS Code workspace yet (unit tests / bare folder) — still remember the root.
			this.activeRoot = abs;
		}

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

		const rel = this.getProjectRelFromWorkspace(base);
		await this.configGenerator.generate(base, project, tools, device, this.extensionPath, rel);
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
		const rel = this.getProjectRelFromWorkspace(base);
		await this.configGenerator.generate(base, project, tools, device, this.extensionPath, rel);
	}

	private applyDeviceFiles(base: string, device: DeviceInfo, sdkPath: string): void {
		ensureDir(path.join(base, 'linker'));
		ensureDir(path.join(base, 'src'));

		// device.opt: part define used by CFLAGS via @linker/device.opt
		writeTextFile(path.join(base, 'linker', 'device.opt'), `-D${device.deviceDefine}\n`);

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
# Tool paths: prefer environment (extension/tasks), fallback to optional toolpaths.mk
# Nested sources: all src/**/*.c are auto-discovered; optional app.mk can append more.
TARGET   ?= ${project.target}
BUILD    := ${project.buildDir}
PROBE    := ${probe}

-include toolpaths.mk

# Optional project overlay (not overwritten by the extension):
#   EXTRA_SRCS / EXTRA_INCLUDES / CFLAGS / LDFLAGS overrides, etc.
EXTRA_SRCS :=
EXTRA_INCLUDES :=
-include app.mk

# Allow empty defaults so env/toolpaths.mk can fill them
GCC_PATH      ?=
SDK           ?=
SYSCONFIG_ROOT?=
JLINK_ROOT    ?=
OPENOCD_BIN   ?=
MAKE_BIN      ?=

ifeq ($(strip $(GCC_PATH)),)
$(error GCC_PATH is empty. Set mspm0.gccPath in VS Code (extension injects it) or create toolpaths.mk via 同步配置)
endif
ifeq ($(strip $(SDK)),)
$(error SDK is empty. Set mspm0.sdkPath or create toolpaths.mk via 同步配置)
endif

SYSCONFIG_CLI := $(SYSCONFIG_ROOT)/sysconfig_cli.bat
SYSCONFIG_GUI := $(SYSCONFIG_ROOT)/sysconfig_gui.bat
CC            := $(GCC_PATH)/bin/arm-none-eabi-gcc
OBJCOPY       := $(GCC_PATH)/bin/arm-none-eabi-objcopy
SIZE          := $(GCC_PATH)/bin/arm-none-eabi-size
JLINK_EXE     := $(JLINK_ROOT)/JLink.exe
OPENOCD       := $(OPENOCD_BIN)/openocd

# Recursive file discovery (works with GNU Make / mingw32-make, no shell find needed)
# Usage: $(call rwildcard,src/,*.c)
rwildcard = $(wildcard $1$2) $(foreach d,$(wildcard $1*),$(call rwildcard,$d/,$2))

# All application C sources under src/ (nested folders included)
APP_SRCS := $(call rwildcard,src/,*.c)
# Header directories under src/ (e.g. src/Hardware/Inc, or next to .c files)
SRC_HDRS := $(call rwildcard,src/,*.h)
SRC_INCDIRS := $(sort $(dir $(SRC_HDRS)))

CPUFLAGS := -mcpu=cortex-m0plus -march=armv6-m -mthumb -mfloat-abi=soft
CFLAGS   := $(CPUFLAGS) -std=c99 -O2 -g -gstrict-dwarf -Wall \\
            -ffunction-sections -fdata-sections \\
            @linker/device.opt \\
            -D${device.familyDefine} \\
            -I. -Isrc -Isyscfg \\
            $(addprefix -I,$(SRC_INCDIRS)) \\
            $(EXTRA_INCLUDES) \\
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

# syscfg is generated outside src/; EXTRA_SRCS comes from optional app.mk
SRCS := $(sort $(APP_SRCS) syscfg/ti_msp_dl_config.c $(EXTRA_SRCS))
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
