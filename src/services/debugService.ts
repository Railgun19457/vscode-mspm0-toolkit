import * as vscode from 'vscode';
import { ProbeType } from '../model/types';

export class DebugService {
	async start(configName?: string, probe?: ProbeType, workspaceFolder?: string): Promise<void> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (!folders.length) {
			throw new Error('请先打开工作区文件夹');
		}
		const folder =
			(workspaceFolder && folders.find((f) => f.uri.fsPath === workspaceFolder)) ||
			folders[0];

		const cortex = vscode.extensions.getExtension('marus25.cortex-debug');
		if (!cortex) {
			throw new Error('未安装 Cortex-Debug 扩展 (marus25.cortex-debug)');
		}
		if (!cortex.isActive) {
			await cortex.activate();
		}

		const preferred = configName || this.defaultConfigName(probe);
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
