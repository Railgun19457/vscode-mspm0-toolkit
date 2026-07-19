import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutput(): vscode.OutputChannel {
	if (!channel) {
		channel = vscode.window.createOutputChannel('MSPM0');
	}
	return channel;
}

export function logInfo(message: string): void {
	getOutput().appendLine(`[info] ${message}`);
}

export function logError(message: string): void {
	getOutput().appendLine(`[error] ${message}`);
}

export function logSection(title: string): void {
	const c = getOutput();
	c.appendLine('');
	c.appendLine(`==== ${title} ====`);
}

/** Always open the MSPM0 output channel (manual / force). */
export function showOutput(): void {
	getOutput().show(true);
}

/**
 * When true: only auto-open output on error; success uses status bar only.
 * When false (default): auto-open whenever an action produces output.
 */
export function onlyOpenOutputOnError(): boolean {
	return vscode.workspace.getConfiguration('mspm0').get<boolean>('openOutputOnError', false);
}

/**
 * Open output according to policy.
 * - force: always open
 * - start/success: open unless openOutputOnError is enabled
 * - error: always open
 * - never: never open
 */
export function revealOutput(reason: 'force' | 'start' | 'success' | 'error' | 'never' = 'start'): void {
	if (reason === 'never') {
		return;
	}
	if (reason === 'force' || reason === 'error') {
		showOutput();
		return;
	}
	// start / success: open by default; suppress when "only on error" is enabled
	if (!onlyOpenOutputOnError()) {
		showOutput();
	}
}
