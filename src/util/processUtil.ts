import { spawn } from 'child_process';

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

export interface RunOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
}

export function runCommand(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			shell: false,
			windowsHide: true,
		});

		let stdout = '';
		let stderr = '';
		let settled = false;

		const finish = (code: number | null) => {
			if (settled) {
				return;
			}
			settled = true;
			resolve({ code, stdout, stderr });
		};

		const timer =
			options.timeoutMs && options.timeoutMs > 0
				? setTimeout(() => {
						child.kill();
						stderr += `\n[timeout after ${options.timeoutMs}ms]`;
						finish(null);
					}, options.timeoutMs)
				: undefined;

		child.stdout.on('data', (d) => {
			stdout += d.toString();
		});
		child.stderr.on('data', (d) => {
			stderr += d.toString();
		});
		child.on('error', (err) => {
			stderr += err.message;
			if (timer) {
				clearTimeout(timer);
			}
			finish(null);
		});
		child.on('close', (code) => {
			if (timer) {
				clearTimeout(timer);
			}
			finish(code);
		});
	});
}
