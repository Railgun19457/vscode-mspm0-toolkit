import * as vscode from 'vscode';
import { DoctorReport, ProjectState } from '../model/types';
import { pathBasename } from '../util/pathBase';

export type StatusActionLevel = 'info' | 'running' | 'success' | 'error';

/**
 * Status bar: chip/project on the left + transient action result on the right.
 * Clicking the action item opens the MSPM0 output channel.
 */
export class StatusBarController implements vscode.Disposable {
	private readonly projectItem: vscode.StatusBarItem;
	private readonly actionItem: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];
	private clearTimer?: NodeJS.Timeout;

	constructor() {
		this.projectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.projectItem.command = 'mspm0.openSidebar';
		this.projectItem.tooltip = '打开 MSPM0 侧边栏';
		this.projectItem.show();

		this.actionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
		this.actionItem.command = 'mspm0.showOutput';
		this.actionItem.tooltip = '点击查看 MSPM0 输出';
		this.actionItem.hide();

		this.disposables.push(this.projectItem, this.actionItem);
	}

	update(project: ProjectState, _doctor?: DoctorReport): void {
		if (!project.root) {
			this.projectItem.text = '$(chip) MSPM0';
			this.projectItem.tooltip = '未打开工作区 · 点击打开 MSPM0 侧边栏';
			this.projectItem.backgroundColor = undefined;
			return;
		}
		const shortName = project.name || pathBasename(project.root);
		if (!project.initialized) {
			this.projectItem.text = `$(chip) ${shortName}`;
			this.projectItem.tooltip = `工程未初始化\n${shortName}\n根目录: ${project.root}\n点击打开 MSPM0 侧边栏`;
			this.projectItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			return;
		}
		const device = project.config?.device ?? 'MSPM0';
		// Compact: chip + short project name when multi-project layouts are common
		this.projectItem.text = shortName && shortName !== device
			? `$(chip) ${device} · ${shortName}`
			: `$(chip) ${device}`;
		this.projectItem.tooltip = `工程: ${shortName}\n芯片: ${device}\n根目录: ${project.root}\n点击打开 MSPM0 侧边栏`;
		this.projectItem.backgroundColor = undefined;
	}

	/**
	 * Show transient action feedback on the status bar.
	 * Success/error auto-clear after a few seconds; running stays until next update.
	 */
	setAction(message: string, level: StatusActionLevel = 'info', autoClearMs?: number): void {
		if (this.clearTimer) {
			clearTimeout(this.clearTimer);
			this.clearTimer = undefined;
		}

		const icon =
			level === 'running'
				? '$(sync~spin)'
				: level === 'success'
					? '$(check)'
					: level === 'error'
						? '$(error)'
						: '$(info)';

		this.actionItem.text = `${icon} ${message}`;
		this.actionItem.tooltip = `${message}\n点击打开 MSPM0 输出`;
		this.actionItem.backgroundColor =
			level === 'error' ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
		this.actionItem.show();

		const clearAfter =
			autoClearMs ??
			(level === 'running' ? 0 : level === 'error' ? 12000 : 6000);
		if (clearAfter > 0) {
			this.clearTimer = setTimeout(() => {
				this.clearAction();
			}, clearAfter);
		}
	}

	clearAction(): void {
		if (this.clearTimer) {
			clearTimeout(this.clearTimer);
			this.clearTimer = undefined;
		}
		this.actionItem.hide();
		this.actionItem.text = '';
		this.actionItem.backgroundColor = undefined;
	}

	dispose(): void {
		if (this.clearTimer) {
			clearTimeout(this.clearTimer);
		}
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
