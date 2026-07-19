import * as vscode from 'vscode';
import { ToolPaths } from '../model/types';
import { logError, logInfo, logSection, revealOutput } from '../ui/output';
import { toBackslash } from '../util/pathUtil';
import { runCommand } from '../util/processUtil';

export class BuildService {
	private buildEnv(tools: ToolPaths): NodeJS.ProcessEnv {
		const pathParts = [
			toBackslash(tools.make),
			toBackslash(`${tools.gcc}/bin`),
			toBackslash(tools.sysconfig),
			toBackslash(tools.jlink),
			toBackslash(tools.openocd),
			process.env.Path || process.env.PATH || '',
		].filter(Boolean);
		const pathValue = pathParts.join(';');
		return {
			...process.env,
			// Make variables (override toolpaths.mk when set)
			GCC_PATH: tools.gcc || process.env.GCC_PATH || '',
			SDK: tools.sdk || process.env.SDK || '',
			SYSCONFIG_ROOT: tools.sysconfig || process.env.SYSCONFIG_ROOT || '',
			JLINK_ROOT: tools.jlink || process.env.JLINK_ROOT || '',
			OPENOCD_BIN: tools.openocd || process.env.OPENOCD_BIN || '',
			MAKE_BIN: tools.make || process.env.MAKE_BIN || '',
			Path: pathValue,
			PATH: pathValue,
		};
	}

	async build(projectRoot: string, tools: ToolPaths, jobs = 8): Promise<void> {
		await this.runMake(projectRoot, tools, ['-j' + String(jobs)], 'Build');
	}

	async clean(projectRoot: string, tools: ToolPaths): Promise<void> {
		await this.runMake(projectRoot, tools, ['clean'], 'Clean');
	}

	async flash(projectRoot: string, tools: ToolPaths, buildFirst = true): Promise<void> {
		await this.runMake(projectRoot, tools, [buildFirst ? 'flash' : 'flash-only'], buildFirst ? 'Flash' : 'Flash (no build)');
	}

	async syscfgGenerate(projectRoot: string, tools: ToolPaths): Promise<void> {
		await this.runMake(projectRoot, tools, ['syscfg'], 'SysConfig Generate');
	}

	async syscfgGui(projectRoot: string, tools: ToolPaths, sdk: string, syscfgFile: string): Promise<void> {
		logSection('SysConfig GUI');
		const gui = toBackslash(`${tools.sysconfig}/sysconfig_gui.bat`);
		const args = [
			'--product',
			`${sdk}/.metadata/product.json`.replace(/\\/g, '/'),
			'--compiler',
			'gcc',
			'--output',
			'syscfg',
			syscfgFile,
		];
		logInfo(`Starting: ${gui} ${args.join(' ')}`);
		const { spawn } = await import('child_process');
		spawn(gui, args, {
			cwd: projectRoot,
			detached: true,
			stdio: 'ignore',
			shell: true,
			windowsHide: true,
		}).unref();
		vscode.window.showInformationMessage('已启动 SysConfig GUI');
	}

	private async runMake(projectRoot: string, tools: ToolPaths, args: string[], title: string): Promise<void> {
		logSection(title);
		// Default: open output when action produces logs. If openOutputOnError is on, wait for failure.
		revealOutput('start');
		const makeExe = tools.make ? toBackslash(`${tools.make}/make.exe`) : 'make';
		logInfo(`$ ${makeExe} ${args.join(' ')}`);
		const result = await runCommand(makeExe, args, {
			cwd: projectRoot,
			env: this.buildEnv(tools),
			timeoutMs: 10 * 60 * 1000,
		});
		if (result.stdout) {
			logInfo(result.stdout.trimEnd());
		}
		if (result.stderr) {
			logError(result.stderr.trimEnd());
		}
		if (result.code !== 0) {
			revealOutput('error');
			throw new Error(`${title} 失败 (exit ${result.code})`);
		}
		logInfo(`${title} 完成`);
		revealOutput('success');
	}
}
