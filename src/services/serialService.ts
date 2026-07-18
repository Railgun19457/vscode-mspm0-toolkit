import * as vscode from 'vscode';

export type SerialOpenResult =
	| { ok: true; message: string }
	| { ok: false; message: string; canInstall?: boolean };

/**
 * Open Microsoft Serial Monitor via public extension API (preferred),
 * then fall back to discovered commands / panel focus.
 */
export class SerialService {
	constructor(private readonly context: vscode.ExtensionContext) {}

	async open(): Promise<SerialOpenResult> {
		const ext =
			vscode.extensions.getExtension('ms-vscode.vscode-serial-monitor') ||
			vscode.extensions.all.find((e) => /serial[-.]monitor/i.test(e.id));

		if (!ext) {
			return {
				ok: false,
				canInstall: true,
				message: '未安装 Serial Monitor 扩展 (ms-vscode.vscode-serial-monitor)',
			};
		}

		let apiRoot: any;
		try {
			apiRoot = ext.isActive ? ext.exports : await ext.activate();
		} catch (err) {
			const text = err instanceof Error ? err.message : String(err);
			return { ok: false, message: `Serial Monitor 激活失败: ${text}` };
		}

		// Official public API: exports.getApi(version, extensionContext)
		const api = await this.tryGetApi(apiRoot);
		if (api) {
			const opened = await this.openViaApi(api);
			if (opened.ok) {
				return opened;
			}
			// continue fallbacks with the API error as secondary info
		}

		const cmdResult = await this.openViaCommands();
		if (cmdResult.ok) {
			return cmdResult;
		}

		const viewResult = await this.focusSerialPanel();
		if (viewResult.ok) {
			return viewResult;
		}

		return {
			ok: false,
			message:
				'已检测到 Serial Monitor 扩展，但无法通过 API/命令启动。请从命令面板搜索 “Serial Monitor” 手动打开。',
		};
	}

	async promptInstallOrOpen(): Promise<void> {
		const pick = await vscode.window.showInformationMessage(
			'未找到可用的串口监视器。可安装 Microsoft “Serial Monitor” 扩展。',
			'安装 Serial Monitor',
			'打开扩展面板',
			'取消'
		);
		if (pick === '安装 Serial Monitor') {
			await vscode.commands.executeCommand(
				'workbench.extensions.installExtension',
				'ms-vscode.vscode-serial-monitor'
			);
		} else if (pick === '打开扩展面板') {
			await vscode.commands.executeCommand('workbench.extensions.search', '@id:ms-vscode.vscode-serial-monitor');
		}
	}

	private async tryGetApi(apiRoot: any): Promise<any | undefined> {
		if (!apiRoot) {
			return undefined;
		}
		try {
			if (typeof apiRoot.getApi === 'function') {
				// Version.v0 = 0
				return await apiRoot.getApi(0, this.context);
			}
			if (apiRoot.exports && typeof apiRoot.exports.getApi === 'function') {
				return await apiRoot.exports.getApi(0, this.context);
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	private async openViaApi(api: any): Promise<SerialOpenResult> {
		try {
			let ports: Array<{ portName: string; friendlyName?: string }> = [];
			if (typeof api.listAvailablePorts === 'function') {
				ports = (await api.listAvailablePorts()) || [];
			}

			if (!ports.length) {
				// No device yet: still try to focus UI so user can pick later
				await this.focusSerialPanel();
				return {
					ok: true,
					message: 'Serial Monitor 已就绪（当前未检测到串口设备，可在面板中手动选择）',
				};
			}

			let selected = ports[0];
			if (ports.length > 1) {
				const pick = await vscode.window.showQuickPick(
					ports.map((p) => ({
						label: p.portName,
						description: p.friendlyName || '',
						port: p,
					})),
					{ placeHolder: '选择要打开的串口', title: 'MSPM0 Serial Monitor' }
				);
				if (!pick) {
					return { ok: false, message: '已取消串口选择' };
				}
				selected = pick.port;
			}

			const baudRate = vscode.workspace.getConfiguration('mspm0').get<number>('serialBaudRate', 115200);
			if (typeof api.startMonitoringPort === 'function') {
				await api.startMonitoringPort({
					port: selected.portName,
					baudRate,
					lineEnding: '\n',
					dataBits: 8,
					stopBits: 'one',
					parity: 'none',
				});
				return { ok: true, message: `已打开串口 ${selected.portName} @ ${baudRate}` };
			}

			return { ok: false, message: 'Serial Monitor API 不包含 startMonitoringPort' };
		} catch (err) {
			const text = err instanceof Error ? err.message : String(err);
			return { ok: false, message: `Serial Monitor API 打开失败: ${text}` };
		}
	}

	private async openViaCommands(): Promise<SerialOpenResult> {
		const all = await vscode.commands.getCommands(true);
		const preferred = [
			'serial-monitor.openSerialMonitor',
			'serial-monitor.startSerialMonitor',
			'serialMonitor.openSerialMonitor',
			'serialMonitor.focus',
			'workbench.action.output.toggleOutput',
		];
		const discovered = all
			.filter((c) => /serial/i.test(c))
			.filter((c) => /(monitor|start|open|focus|view)/i.test(c));
		const candidates = Array.from(new Set([...preferred, ...discovered]));

		for (const cmd of candidates) {
			try {
				await vscode.commands.executeCommand(cmd);
				return { ok: true, message: `已通过命令打开串口: ${cmd}` };
			} catch {
				// try next
			}
		}
		return { ok: false, message: '未找到可用的 Serial Monitor 命令' };
	}

	private async focusSerialPanel(): Promise<SerialOpenResult> {
		const views = [
			'workbench.panel.serialMonitor.focus',
			'serial-monitor.mainView.focus',
			'serialMonitor.focus',
			'workbench.view.extension.serial-monitor',
		];
		for (const v of views) {
			try {
				await vscode.commands.executeCommand(v);
				return { ok: true, message: '已聚焦 Serial Monitor 面板' };
			} catch {
				// continue
			}
		}
		return { ok: false, message: '无法聚焦 Serial Monitor 面板' };
	}
}
