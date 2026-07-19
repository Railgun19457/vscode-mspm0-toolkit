import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProbeType } from '../model/types';
import { findContainingWorkspaceFolder, normalizeRoot } from '../util/workspacePath';

export class DebugService {
	/**
	 * Start a debug session for the active project.
	 * projectRoot may be a nested folder; launch.json is read from that project.
	 * The VS Code WorkspaceFolder used as the debug "folder" is the containing workspace root.
	 */
	async start(configName?: string, probe?: ProbeType, projectRoot?: string): Promise<void> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (!folders.length) {
			throw new Error('请先打开工作区文件夹');
		}

		const projectAbs = projectRoot ? normalizeRoot(projectRoot) : undefined;
		const folder =
			(projectAbs && findContainingWorkspaceFolder(projectAbs, folders)) ||
			(projectAbs && folders.find((f) => normalizeRoot(f.uri.fsPath) === projectAbs)) ||
			folders[0];

		const cortex = vscode.extensions.getExtension('marus25.cortex-debug');
		if (!cortex) {
			throw new Error('未安装 Cortex-Debug 扩展 (marus25.cortex-debug)');
		}
		if (!cortex.isActive) {
			await cortex.activate();
		}

		const preferred = configName || this.defaultConfigName(probe);

		// Prefer launch.json inside the project root (supports nested multi-project layouts).
		const projectConfigs = projectAbs ? this.readProjectLaunchConfigs(projectAbs) : [];
		const fromProject =
			this.pickConfig(projectConfigs, probe) ||
			projectConfigs.find((c) => c.name === preferred) ||
			projectConfigs.find((c) => c.type === 'cortex-debug');

		if (fromProject) {
			const started = await vscode.debug.startDebugging(folder, fromProject as vscode.DebugConfiguration);
			if (!started) {
				throw new Error('启动调试失败');
			}
			return;
		}

		// Fallback: workspace-level launch configurations (root project).
		let started = await vscode.debug.startDebugging(folder, preferred);
		if (!started) {
			const launches = vscode.workspace.getConfiguration('launch', folder);
			const configs = launches.get<Array<{ name: string; type?: string; servertype?: string }>>(
				'configurations',
				[]
			);
			const byProbe = this.pickConfig(configs, probe);
			const hit = byProbe ?? configs.find((c) => c.type === 'cortex-debug') ?? configs[0];
			if (!hit) {
				throw new Error('未找到调试配置，请先同步配置');
			}
			started = await vscode.debug.startDebugging(folder, hit.name);
			if (!started) {
				throw new Error('启动调试失败');
			}
		}
	}

	private readProjectLaunchConfigs(
		projectRoot: string
	): Array<{ name: string; type?: string; servertype?: string } & Record<string, unknown>> {
		const file = path.join(projectRoot, '.vscode', 'launch.json');
		try {
			if (!fs.existsSync(file)) {
				return [];
			}
			const raw = fs.readFileSync(file, 'utf8');
			// Strip simple // comments that VS Code launch.json may contain.
			const json = raw.replace(/^\s*\/\/.*$/gm, '');
			const parsed = JSON.parse(json) as { configurations?: Array<Record<string, unknown>> };
			return Array.isArray(parsed.configurations)
				? (parsed.configurations as Array<{ name: string; type?: string; servertype?: string } & Record<string, unknown>>)
				: [];
		} catch {
			return [];
		}
	}

	defaultConfigName(probe?: ProbeType): string {
		switch (probe) {
			case 'xds110':
				return 'Debug (XDS110)';
			case 'cmsis-dap':
				return 'Debug (CMSIS-DAP)';
			case 'openocd':
				return 'Debug (OpenOCD)';
			case 'jlink':
			default:
				return 'Debug (J-Link)';
		}
	}

	private pickConfig(
		configs: Array<{ name: string; type?: string; servertype?: string }>,
		probe?: ProbeType
	) {
		if (!probe) {
			return undefined;
		}
		if (probe === 'jlink') {
			return configs.find((c) => c.name === 'Debug (J-Link)') ?? configs.find((c) => c.servertype === 'jlink');
		}
		const label =
			probe === 'xds110' ? 'XDS110' : probe === 'cmsis-dap' ? 'CMSIS-DAP' : 'OpenOCD';
		return (
			configs.find((c) => c.name === `Debug (${label})`) ??
			configs.find((c) => c.servertype === 'openocd')
		);
	}
}
