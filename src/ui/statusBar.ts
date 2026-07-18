import * as vscode from 'vscode';
import { DoctorReport, ProjectState } from '../model/types';

/**
 * Status bar: only show current chip / project status on the left.
 */
export class StatusBarController implements vscode.Disposable {
	private readonly projectItem: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];

	constructor() {
		this.projectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.projectItem.command = 'mspm0.openSidebar';
		this.projectItem.tooltip = '打开 MSPM0 侧边栏';
		this.projectItem.show();
		this.disposables.push(this.projectItem);
	}

	update(project: ProjectState, _doctor?: DoctorReport): void {
		if (!project.root) {
			this.projectItem.text = '$(chip) MSPM0';
			this.projectItem.tooltip = '未打开工作区 · 点击打开 MSPM0 侧边栏';
			this.projectItem.backgroundColor = undefined;
			return;
		}
		if (!project.initialized) {
			this.projectItem.text = '$(chip) 未初始化';
			this.projectItem.tooltip = '工程未初始化 · 点击打开 MSPM0 侧边栏';
			this.projectItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			return;
		}
		const device = project.config?.device ?? 'MSPM0';
		this.projectItem.text = `$(chip) ${device}`;
		this.projectItem.tooltip = `当前芯片: ${device} · 点击打开 MSPM0 侧边栏`;
		this.projectItem.backgroundColor = undefined;
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}
}
