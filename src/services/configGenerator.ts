import * as fs from 'fs';
import * as path from 'path';
import { DeviceInfo, Mspm0ProjectFile, ProbeType, ToolPaths } from '../model/types';
import { ensureDir, writeJsonFile, writeTextFile } from '../util/fsUtil';
import { toBackslash, toForward } from '../util/pathUtil';

/**
 * Generate portable VS Code configs.
 * Machine paths come from ${config:mspm0.*} / env, not hard-coded drive letters.
 * toolpaths.mk is an optional local cache for plain terminal `make`.
 */
export class ConfigGenerator {
	async generate(
		projectRoot: string,
		project: Mspm0ProjectFile,
		tools: ToolPaths,
		device: DeviceInfo,
		extensionPath?: string
	): Promise<void> {
		const vscodeDir = path.join(projectRoot, '.vscode');
		ensureDir(vscodeDir);

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

		this.writeJsonMerged(
			path.join(vscodeDir, 'c_cpp_properties.json'),
			{
				configurations: [
					{
						name: project.device,
						includePath: [
							'${workspaceFolder}/**',
							'${workspaceFolder}/src',
							'${workspaceFolder}/syscfg',
							'${config:mspm0.sdkPath}/source',
							'${config:mspm0.sdkPath}/source/third_party/CMSIS/Core/Include',
							'${config:mspm0.gccPath}/arm-none-eabi/include',
						],
						defines: [device.deviceDefine, device.familyDefine],
						compilerPath: '${config:mspm0.gccPath}/bin/arm-none-eabi-gcc.exe',
						cStandard: 'c99',
						intelliSenseMode: 'gcc-arm',
					},
				],
				version: 4,
			},
			// Keep only the active device configuration to avoid stale hard-coded chip entries.
			(_existing, gen) => gen
		);

		const launchConfigs = this.buildLaunchConfigs(project, device, svd);

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
						options: { cwd: '${workspaceFolder}', env: makeToolEnv },
						group: { kind: 'build', isDefault: true },
						problemMatcher: ['$gcc'],
					},
					{
						label: 'clean',
						type: 'shell',
						command: 'make',
						args: ['clean'],
						options: { cwd: '${workspaceFolder}', env: makeToolEnv },
						problemMatcher: [],
					},
					{
						label: 'syscfg',
						type: 'shell',
						command: 'make',
						args: ['syscfg'],
						options: { cwd: '${workspaceFolder}', env: makeToolEnv },
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
							'${workspaceFolder}/syscfg',
							'${workspaceFolder}/' + project.syscfgFile,
						],
						options: { cwd: '${workspaceFolder}' },
						problemMatcher: [],
						presentation: { reveal: 'silent', panel: 'shared' },
					},
					{
						label: 'flash',
						type: 'shell',
						command: 'make',
						args: ['flash'],
						options: { cwd: '${workspaceFolder}', env: makeToolEnv },
						problemMatcher: [],
						dependsOn: ['build'],
					},
					{
						label: 'flash-only',
						type: 'shell',
						command: 'make',
						args: ['flash-only'],
						options: { cwd: '${workspaceFolder}', env: makeToolEnv },
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

		// silence unused absolute vars in case future toggles need them
		void toBackslash;
	}

	private buildLaunchConfigs(
		project: Mspm0ProjectFile,
		device: DeviceInfo,
		svd: string
	): Array<Record<string, unknown>> {
		const exe = '${workspaceFolder}/' + project.executable;
		const gccBin = '${config:mspm0.gccPath}/bin';
		const gdb = '${config:mspm0.gccPath}/bin/arm-none-eabi-gdb.exe';
		const jlinkServer = '${config:mspm0.jlinkPath}/JLinkGDBServerCL.exe';
		const openocdServer = '${config:mspm0.openocdPath}/openocd.exe';

		const configs: Array<Record<string, unknown>> = [
			{
				name: 'Debug (J-Link)',
				cwd: '${workspaceFolder}',
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
				preLaunchTask: 'build',
			},
			{
				name: 'Attach (J-Link)',
				cwd: '${workspaceFolder}',
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
				cwd: '${workspaceFolder}',
				executable: exe,
				request: 'launch',
				type: 'cortex-debug',
				runToEntryPoint: 'main',
				servertype: 'openocd',
				configFiles: ['.vscode/openocd.cfg'],
				searchDir: ['.vscode'],
				openOCDLaunchCommands: [`adapter speed ${project.speed || 4000}`],
				gdbPath: gdb,
				armToolchainPath: gccBin,
				serverpath: openocdServer,
				svdFile: svd || undefined,
				preLaunchTask: 'build',
			});
			configs.push({
				name: `Attach (${label})`,
				cwd: '${workspaceFolder}',
				executable: exe,
				request: 'attach',
				type: 'cortex-debug',
				servertype: 'openocd',
				configFiles: ['.vscode/openocd.cfg'],
				searchDir: ['.vscode'],
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
		let interfaceScript = 'interface/jlink.cfg';
		if (project.probe === 'xds110') {
			interfaceScript = 'interface/xds110.cfg';
		} else if (project.probe === 'cmsis-dap') {
			interfaceScript = 'interface/cmsis-dap.cfg';
		} else if (project.probe === 'openocd') {
			interfaceScript = 'interface/cmsis-dap.cfg';
		} else if (project.probe === 'jlink') {
			interfaceScript = 'interface/jlink.cfg';
		}

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
