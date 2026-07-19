import * as fs from 'fs';
import * as path from 'path';
import { DeviceInfo, Mspm0ProjectFile, ProbeType, ToolPaths } from '../model/types';
import { ensureDir, writeJsonFile, writeTextFile } from '../util/fsUtil';
import { toForward } from '../util/pathUtil';

/**
 * Generate portable VS Code configs.
 * Machine paths come from ${config:mspm0.*} / env, not hard-coded drive letters.
 * toolpaths.mk is an optional local cache for plain terminal `make`.
 *
 * projectRelFromWorkspace: path of the project root relative to the VS Code workspace
 * folder ('.' when they are the same). Nested projects use e.g. 'apps/blink' so that
 * ${workspaceFolder}/apps/blink/... resolves correctly for debug/tasks.
 *
 * workspaceFolderRoot: absolute path of the containing VS Code workspace folder.
 * When the project is nested, IntelliSense configs are also written there because
 * ms-vscode.cpptools only loads `.vscode/c_cpp_properties.json` from the workspace root.
 */
export class ConfigGenerator {
	async generate(
		projectRoot: string,
		project: Mspm0ProjectFile,
		tools: ToolPaths,
		device: DeviceInfo,
		extensionPath?: string,
		projectRelFromWorkspace: string = '.',
		workspaceFolderRoot?: string
	): Promise<void> {
		const vscodeDir = path.join(projectRoot, '.vscode');
		ensureDir(vscodeDir);

		const projectUri = this.workspaceProjectUri(projectRelFromWorkspace);
		const isNested = !!projectRelFromWorkspace && projectRelFromWorkspace !== '.';
		const wsRoot = workspaceFolderRoot
			? path.normalize(path.resolve(workspaceFolderRoot))
			: isNested
				? this.inferWorkspaceRoot(projectRoot, projectRelFromWorkspace)
				: path.normalize(path.resolve(projectRoot));

		// Optional local cache for terminal make outside the extension.
		// Prefer env vars injected by the extension / tasks.
		const gcc = toForward(tools.gcc);
		const sdk = toForward(tools.sdk);
		const sys = toForward(tools.sysconfig);
		const jl = toForward(tools.jlink);
		const make = toForward(tools.make);
		const ocd = toForward(tools.openocd || '');

		writeTextFile(
			path.join(projectRoot, 'toolpaths.mk'),
			[
				'# Optional local path cache for terminal make.',
				'# The extension injects the same variables at runtime from mspm0.* settings.',
				'# Safe to gitignore; re-run "同步配置" after changing tool paths.',
				`GCC_PATH ?= ${gcc}`,
				`SDK ?= ${sdk}`,
				`SYSCONFIG_ROOT ?= ${sys}`,
				`JLINK_ROOT ?= ${jl}`,
				`MAKE_BIN ?= ${make}`,
				`OPENOCD_BIN ?= ${ocd}`,
				'',
			].join('\n')
		);

		const pathEnv =
			'${config:mspm0.makePath};${config:mspm0.gccPath}/bin;${config:mspm0.sysconfigPath};${config:mspm0.jlinkPath};${config:mspm0.openocdPath};${env:Path}';
		const makeToolEnv = {
			GCC_PATH: '${config:mspm0.gccPath}',
			SDK: '${config:mspm0.sdkPath}',
			SYSCONFIG_ROOT: '${config:mspm0.sysconfigPath}',
			JLINK_ROOT: '${config:mspm0.jlinkPath}',
			OPENOCD_BIN: '${config:mspm0.openocdPath}',
			MAKE_BIN: '${config:mspm0.makePath}',
			Path: pathEnv,
			PATH: pathEnv,
		};

		const svd = this.resolveSvd(device.svd);
		const cppConfig = this.buildCppConfiguration(project, device, tools, projectUri, projectRelFromWorkspace);

		this.writeJsonMerged(
			path.join(vscodeDir, 'settings.json'),
			{
				'files.associations': { '*.h': 'c', '*.c': 'c' },
				// Resolve from extension settings so projects stay portable across machines.
				'cortex-debug.armToolchainPath': '${config:mspm0.gccPath}/bin',
				'cortex-debug.gdbPath': '${config:mspm0.gccPath}/bin/arm-none-eabi-gdb.exe',
				'cortex-debug.JLinkGDBServerPath': '${config:mspm0.jlinkPath}/JLinkGDBServerCL.exe',
				'cortex-debug.openocdPath': '${config:mspm0.openocdPath}/openocd.exe',
				'terminal.integrated.env.windows': {
					GCC_PATH: '${config:mspm0.gccPath}',
					SDK: '${config:mspm0.sdkPath}',
					SYSCONFIG_ROOT: '${config:mspm0.sysconfigPath}',
					JLINK_ROOT: '${config:mspm0.jlinkPath}',
					OPENOCD_BIN: '${config:mspm0.openocdPath}',
					MAKE_BIN: '${config:mspm0.makePath}',
					Path: pathEnv,
				},
			},
			(existing, gen) => ({
				...existing,
				...gen,
				'files.associations': {
					...(existing['files.associations'] || {}),
					...(gen['files.associations'] || {}),
				},
				'terminal.integrated.env.windows': {
					...(existing['terminal.integrated.env.windows'] || {}),
					...(gen['terminal.integrated.env.windows'] || {}),
				},
			})
		);

		// Project-local IntelliSense (used when this folder is opened as the workspace root).
		this.writeJsonMerged(
			path.join(vscodeDir, 'c_cpp_properties.json'),
			{
				configurations: [cppConfig],
				version: 4,
			},
			(existing, gen) => this.mergeCppProperties(existing, gen)
		);

		// Nested projects: C/C++ extension only reads workspace-root .vscode/c_cpp_properties.json.
		// Also mirror settings defaults so includePath works even without switching configuration.
		if (isNested && wsRoot && path.normalize(wsRoot) !== path.normalize(projectRoot)) {
			const wsVscode = path.join(wsRoot, '.vscode');
			ensureDir(wsVscode);
			this.writeJsonMerged(
				path.join(wsVscode, 'c_cpp_properties.json'),
				{
					configurations: [cppConfig],
					version: 4,
				},
				(existing, gen) => this.mergeCppProperties(existing, gen)
			);
			this.writeJsonMerged(
				path.join(wsVscode, 'settings.json'),
				{
					'files.associations': { '*.h': 'c', '*.c': 'c' },
					'C_Cpp.default.includePath': cppConfig.includePath,
					'C_Cpp.default.defines': cppConfig.defines,
					'C_Cpp.default.compilerPath': cppConfig.compilerPath,
					'C_Cpp.default.cStandard': 'c99',
					'C_Cpp.default.intelliSenseMode': 'gcc-arm',
					'C_Cpp.default.browse.path': cppConfig.browse?.path ?? cppConfig.includePath,
				},
				(existing, gen) => {
					const prevIncludes = Array.isArray(existing['C_Cpp.default.includePath'])
						? (existing['C_Cpp.default.includePath'] as string[])
						: [];
					const nextIncludes = Array.isArray(gen['C_Cpp.default.includePath'])
						? (gen['C_Cpp.default.includePath'] as string[])
						: [];
					const mergedIncludes = Array.from(new Set([...prevIncludes, ...nextIncludes]));
					const prevBrowse = Array.isArray(existing['C_Cpp.default.browse.path'])
						? (existing['C_Cpp.default.browse.path'] as string[])
						: [];
					const nextBrowse = Array.isArray(gen['C_Cpp.default.browse.path'])
						? (gen['C_Cpp.default.browse.path'] as string[])
						: [];
					const prevDefs = Array.isArray(existing['C_Cpp.default.defines'])
						? (existing['C_Cpp.default.defines'] as string[])
						: [];
					const nextDefs = Array.isArray(gen['C_Cpp.default.defines'])
						? (gen['C_Cpp.default.defines'] as string[])
						: [];
					return {
						...existing,
						...gen,
						'files.associations': {
							...(existing['files.associations'] as object || {}),
							...(gen['files.associations'] as object || {}),
						},
						// Union paths from all nested projects so multi-project IntelliSense works.
						'C_Cpp.default.includePath': mergedIncludes,
						'C_Cpp.default.browse.path': Array.from(new Set([...prevBrowse, ...nextBrowse, ...mergedIncludes])),
						'C_Cpp.default.defines': Array.from(new Set([...prevDefs, ...nextDefs])),
					};
				}
			);
		}

		const launchConfigs = this.buildLaunchConfigs(project, device, svd, projectRelFromWorkspace);

		this.writeJsonMerged(
			path.join(vscodeDir, 'launch.json'),
			{
				version: '0.2.0',
				configurations: launchConfigs,
			},
			(existing, gen) => {
				const configs = Array.isArray(existing.configurations) ? [...existing.configurations] : [];
				for (const next of gen.configurations) {
					const idx = configs.findIndex((c: { name?: string }) => c?.name === next.name);
					if (idx >= 0) {
						configs[idx] = next;
					} else {
						configs.push(next);
					}
				}
				return { ...existing, version: gen.version, configurations: configs };
			}
		);

		this.writeJsonMerged(
			path.join(vscodeDir, 'tasks.json'),
			{
				version: '2.0.0',
				tasks: [
					{
						label: 'build',
						type: 'shell',
						command: 'make',
						args: ['-j${config:mspm0.buildJobs}'],
						options: { cwd: projectUri, env: makeToolEnv },
						group: { kind: 'build', isDefault: true },
						problemMatcher: ['$gcc'],
					},
					{
						label: 'clean',
						type: 'shell',
						command: 'make',
						args: ['clean'],
						options: { cwd: projectUri, env: makeToolEnv },
						problemMatcher: [],
					},
					{
						label: 'syscfg',
						type: 'shell',
						command: 'make',
						args: ['syscfg'],
						options: { cwd: projectUri, env: makeToolEnv },
						problemMatcher: [],
					},
					{
						label: 'syscfg-gui',
						type: 'shell',
						command: '${config:mspm0.sysconfigPath}/sysconfig_gui.bat',
						args: [
							'--product',
							'${config:mspm0.sdkPath}/.metadata/product.json',
							'--compiler',
							'gcc',
							'--output',
							`${projectUri}/syscfg`,
							`${projectUri}/` + project.syscfgFile,
						],
						options: { cwd: projectUri },
						problemMatcher: [],
						presentation: { reveal: 'silent', panel: 'shared' },
					},
					{
						label: 'flash',
						type: 'shell',
						command: 'make',
						args: ['flash'],
						options: { cwd: projectUri, env: makeToolEnv },
						problemMatcher: [],
						dependsOn: ['build'],
					},
					{
						label: 'flash-only',
						type: 'shell',
						command: 'make',
						args: ['flash-only'],
						options: { cwd: projectUri, env: makeToolEnv },
						problemMatcher: [],
					},
				],
			},
			(existing, gen) => {
				const tasks = Array.isArray(existing.tasks) ? [...existing.tasks] : [];
				for (const next of gen.tasks) {
					const idx = tasks.findIndex((c: { label?: string }) => c?.label === next.label);
					if (idx >= 0) {
						tasks[idx] = next;
					} else {
						tasks.push(next);
					}
				}
				return { ...existing, version: gen.version, tasks };
			}
		);

		this.writeJsonMerged(
			path.join(vscodeDir, 'extensions.json'),
			{
				recommendations: [
					'ms-vscode.cpptools',
					'ms-vscode.cpptools-extension-pack',
					'marus25.cortex-debug',
					'ti-development-tools.cortex-debug-dp-mspm0',
					'ms-vscode.vscode-serial-monitor',
					'ms-vscode.hexeditor',
					'dan-c-underwood.arm',
				],
			},
			(existing, gen) => {
				const rec = new Set([
					...(Array.isArray(existing.recommendations) ? existing.recommendations : []),
					...gen.recommendations,
				]);
				return { ...existing, recommendations: Array.from(rec) };
			}
		);

		writeTextFile(
			path.join(vscodeDir, 'flash.jlink'),
			['r', 'h', `loadfile ${project.executable}`, 'r', 'g', 'qc', ''].join('\n')
		);

		this.writeOpenocdConfig(vscodeDir, project, extensionPath);
	}

	/**
	 * VS Code variable pointing at the project root.
	 * Nested projects: ${workspaceFolder}/apps/blink
	 * Root projects:   ${workspaceFolder}
	 */
	private workspaceProjectUri(projectRelFromWorkspace: string): string {
		const rel = (projectRelFromWorkspace || '.').replace(/\\/g, '/').replace(/^\.\/+/, '');
		if (!rel || rel === '.') {
			return '${workspaceFolder}';
		}
		return `\${workspaceFolder}/${rel}`;
	}

	/** Infer workspace folder absolute path from projectRoot + relative path. */
	private inferWorkspaceRoot(projectRoot: string, projectRelFromWorkspace: string): string {
		const rel = (projectRelFromWorkspace || '.').replace(/\\/g, '/').replace(/^\.\/+/, '');
		if (!rel || rel === '.') {
			return path.normalize(path.resolve(projectRoot));
		}
		const parts = rel.split('/').filter(Boolean);
		let cur = path.normalize(path.resolve(projectRoot));
		for (let i = 0; i < parts.length; i++) {
			cur = path.dirname(cur);
		}
		return cur;
	}

	/**
	 * Build one C/C++ configuration for IntelliSense.
	 * ms-vscode.cpptools does NOT expand ${config:mspm0.*}, so also embed absolute
	 * SDK/GCC paths when known. Nested projects use ${workspaceFolder}/rel for local dirs.
	 */
	private buildCppConfiguration(
		project: Mspm0ProjectFile,
		device: DeviceInfo,
		tools: ToolPaths,
		projectUri: string,
		projectRelFromWorkspace: string
	): {
		name: string;
		includePath: string[];
		defines: string[];
		compilerPath: string;
		cStandard: string;
		intelliSenseMode: string;
		browse?: { path: string[]; limitSymbolsToIncludedHeaders?: boolean };
	} {
		const sdk = toForward(tools.sdk || '');
		const gcc = toForward(tools.gcc || '');
		const isNested = !!projectRelFromWorkspace && projectRelFromWorkspace !== '.';
		// For nested projects prefer workspace-relative project paths so the same
		// config works when loaded from the workspace-root c_cpp_properties.json.
		const localRoot = isNested ? projectUri : '${workspaceFolder}';

		const includePath = [
			`${localRoot}/**`,
			`${localRoot}/src`,
			`${localRoot}/syscfg`,
			// Portable settings vars (some environments resolve these; cpptools often does not)
			'${config:mspm0.sdkPath}/source',
			'${config:mspm0.sdkPath}/source/third_party/CMSIS/Core/Include',
			'${config:mspm0.gccPath}/arm-none-eabi/include',
		];

		// Absolute paths so IntelliSense can find ti/devices/msp/msp.h even when
		// ${config:mspm0.sdkPath} is not expanded by the C/C++ extension.
		if (sdk) {
			includePath.push(`${sdk}/source`);
			includePath.push(`${sdk}/source/third_party/CMSIS/Core/Include`);
		}
		if (gcc) {
			includePath.push(`${gcc}/arm-none-eabi/include`);
		}

		// De-dupe while preserving order
		const uniqueIncludes = Array.from(new Set(includePath.filter(Boolean)));

		const compilerPath = gcc
			? `${gcc}/bin/arm-none-eabi-gcc.exe`
			: '${config:mspm0.gccPath}/bin/arm-none-eabi-gcc.exe';

		const name = isNested
			? `MSPM0 ${project.device} (${projectRelFromWorkspace.replace(/\\/g, '/')})`
			: `MSPM0 ${project.device}`;

		return {
			name,
			includePath: uniqueIncludes,
			defines: [device.deviceDefine, device.familyDefine].filter(Boolean),
			compilerPath,
			cStandard: 'c99',
			intelliSenseMode: 'gcc-arm',
			browse: {
				path: uniqueIncludes,
				limitSymbolsToIncludedHeaders: true,
			},
		};
	}

	/**
	 * Merge c_cpp_properties: update same-named configs, append new ones.
	 * Keeps user / other-project configurations.
	 */
	private mergeCppProperties(
		existing: Record<string, unknown>,
		gen: Record<string, unknown>
	): Record<string, unknown> {
		const existingConfigs = Array.isArray(existing.configurations)
			? ([...existing.configurations] as Array<Record<string, unknown>>)
			: [];
		const genConfigs = Array.isArray(gen.configurations)
			? (gen.configurations as Array<Record<string, unknown>>)
			: [];
		for (const next of genConfigs) {
			const idx = existingConfigs.findIndex((c) => c?.name === next.name);
			if (idx >= 0) {
				existingConfigs[idx] = next;
			} else {
				existingConfigs.push(next);
			}
		}
		return {
			...existing,
			version: gen.version ?? existing.version ?? 4,
			configurations: existingConfigs,
		};
	}

	private buildLaunchConfigs(
		project: Mspm0ProjectFile,
		device: DeviceInfo,
		svd: string,
		projectRelFromWorkspace: string = '.'
	): Array<Record<string, unknown>> {
		const projectUri = this.workspaceProjectUri(projectRelFromWorkspace);
		const exe = `${projectUri}/` + project.executable;
		const gccBin = '${config:mspm0.gccPath}/bin';
		const gdb = '${config:mspm0.gccPath}/bin/arm-none-eabi-gdb.exe';
		const jlinkServer = '${config:mspm0.jlinkPath}/JLinkGDBServerCL.exe';
		const openocdServer = '${config:mspm0.openocdPath}/openocd.exe';
		// OpenOCD cfg lives under the project; give absolute-from-workspace path.
		const openocdCfg = `${projectUri}/.vscode/openocd.cfg`;
		const openocdSearch = [`${projectUri}/.vscode`];

		const configs: Array<Record<string, unknown>> = [
			{
				name: 'Debug (J-Link)',
				cwd: projectUri,
				executable: exe,
				request: 'launch',
				type: 'cortex-debug',
				runToEntryPoint: 'main',
				servertype: 'jlink',
				device: device.jlinkDevice,
				interface: project.interface,
				serverpath: jlinkServer,
				gdbPath: gdb,
				armToolchainPath: gccBin,
				svdFile: svd || undefined,
				// Extension builds via BuildService; avoid workspace-level preLaunchTask mismatch.
			},
			{
				name: 'Attach (J-Link)',
				cwd: projectUri,
				executable: exe,
				request: 'attach',
				type: 'cortex-debug',
				servertype: 'jlink',
				device: device.jlinkDevice,
				interface: project.interface,
				serverpath: jlinkServer,
				gdbPath: gdb,
				armToolchainPath: gccBin,
				svdFile: svd || undefined,
			},
		];

		const openocdProbes: ProbeType[] = ['openocd', 'xds110', 'cmsis-dap'];
		for (const probe of openocdProbes) {
			const label = probe === 'openocd' ? 'OpenOCD' : probe === 'xds110' ? 'XDS110' : 'CMSIS-DAP';
			configs.push({
				name: `Debug (${label})`,
				cwd: projectUri,
				executable: exe,
				request: 'launch',
				type: 'cortex-debug',
				runToEntryPoint: 'main',
				servertype: 'openocd',
				configFiles: [openocdCfg],
				searchDir: openocdSearch,
				openOCDLaunchCommands: [`adapter speed ${project.speed || 4000}`],
				gdbPath: gdb,
				armToolchainPath: gccBin,
				serverpath: openocdServer,
				svdFile: svd || undefined,
			});
			configs.push({
				name: `Attach (${label})`,
				cwd: projectUri,
				executable: exe,
				request: 'attach',
				type: 'cortex-debug',
				servertype: 'openocd',
				configFiles: [openocdCfg],
				searchDir: openocdSearch,
				gdbPath: gdb,
				armToolchainPath: gccBin,
				serverpath: openocdServer,
				svdFile: svd || undefined,
			});
		}

		return configs;
	}

	private writeOpenocdConfig(vscodeDir: string, project: Mspm0ProjectFile, extensionPath?: string): void {
		const speed = project.speed || 4000;
		const iface = (project.interface || 'swd').toLowerCase();
		const interfaceByProbe: Record<ProbeType, string> = {
			jlink: 'interface/jlink.cfg',
			xds110: 'interface/xds110.cfg',
			'cmsis-dap': 'interface/cmsis-dap.cfg',
			openocd: 'interface/cmsis-dap.cfg',
		};
		const interfaceScript = interfaceByProbe[project.probe] || 'interface/jlink.cfg';

		const lines = [
			`# Generated by MSPM0 Toolkit for probe=${project.probe}`,
			`source [find ${interfaceScript}]`,
			`transport select ${iface}`,
			`adapter speed ${speed}`,
			'',
			'# MSPM0 Cortex-M0+ SWD target',
			'source [find target/swj-dp.tcl]',
			'set _CHIPNAME mspm0',
			'swj_newdap $_CHIPNAME cpu -expected-id 0x0bc11477 -irlen 4',
			'dap create $_CHIPNAME.dap -chain-position $_CHIPNAME.cpu',
			'target create $_CHIPNAME.cpu cortex_m -dap $_CHIPNAME.dap',
			'$_CHIPNAME.cpu configure -work-area-phys 0x20200000 -work-area-size 0x2000 -work-area-backup 0',
			'',
		];

		if (extensionPath) {
			const resDir = path.join(extensionPath, 'resources', 'openocd');
			if (fs.existsSync(resDir)) {
				for (const f of fs.readdirSync(resDir)) {
					const src = path.join(resDir, f);
					const dst = path.join(vscodeDir, f);
					try {
						fs.copyFileSync(src, dst);
					} catch {
						// ignore
					}
				}
			}
		}

		writeTextFile(path.join(vscodeDir, 'openocd.cfg'), lines.join('\n'));
	}

	private readJsonIfExists(filePath: string): Record<string, unknown> | undefined {
		try {
			if (!fs.existsSync(filePath)) {
				return undefined;
			}
			return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
		} catch {
			return undefined;
		}
	}

	private writeJsonMerged(
		filePath: string,
		generated: Record<string, unknown>,
		merge: (existing: any, gen: any) => Record<string, unknown>
	): void {
		const existing = this.readJsonIfExists(filePath);
		const data = existing ? merge(existing, generated) : generated;
		writeJsonFile(filePath, data);
	}

	private resolveSvd(svdName: string): string {
		// Best-effort absolute path for SVD pack; empty is fine if pack missing.
		const extRoot = path.join(process.env.USERPROFILE || process.env.HOME || '', '.vscode', 'extensions');
		try {
			if (!fs.existsSync(extRoot)) {
				return '';
			}
			const hits = fs
				.readdirSync(extRoot, { withFileTypes: true })
				.filter((d) => d.isDirectory() && d.name.startsWith('ti-development-tools.cortex-debug-dp-mspm0'))
				.map((d) => path.join(extRoot, d.name, 'data', svdName))
				.filter((p) => fs.existsSync(p))
				.sort()
				.reverse();
			return hits[0] ? toForward(hits[0]) : '';
		} catch {
			return '';
		}
	}
}
