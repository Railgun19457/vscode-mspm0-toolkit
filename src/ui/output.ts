import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutput(): vscode.OutputChannel {
	if (!channel) {
		channel = vscode.window.createOutputChannel('MSPM0');
	}
	return channel;
}

export function logInfo(message: string): void {
	const c = getOutput();
	c.appendLine(`[info] ${message}`);
}

export function logError(message: string): void {
	const c = getOutput();
	c.appendLine(`[error] ${message}`);
}

export function logSection(title: string): void {
	const c = getOutput();
	c.appendLine('');
	c.appendLine(`==== ${title} ====`);
}

export function showOutput(): void {
	getOutput().show(true);
}
