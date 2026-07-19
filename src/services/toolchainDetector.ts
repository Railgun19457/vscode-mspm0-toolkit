import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
	CheckStatus,
	DoctorReport,
	ToolCheckResult,
	ToolKey,
	ToolPaths,
	TOOL_LABELS,
} from '../model/types';
import { exists, isDirectory, isFile, joinForward, toBackslash } from '../util/pathUtil';
import { runCommand } from '../util/processUtil';

export class ToolchainDetector {
	async inspect(paths: ToolPaths): Promise<DoctorReport> {
		const tools = await Promise.all([
			this.checkGcc(paths.gcc),
			this.checkSdk(paths.sdk),
			this.checkSysconfig(paths.sysconfig),
			this.checkJlink(paths.jlink),
			this.checkMake(paths.make),
			this.checkOpenocd(paths.openocd),
		]);

		const extensions = [
			this.checkExtension('marus25.cortex-debug', 'Cortex-Debug'),
			this.checkExtension('ms-vscode.cpptools', 'C/C++ Tools'),
			this.checkExtension('ti-development-tools.cortex-debug-dp-mspm0', 'MSPM0 Device Pack (SVD)'),
		];

		const required: ToolKey[] = ['gcc', 'sdk', 'make'];
		return {
			ok: tools.filter((t) => required.includes(t.key)).every((t) => t.status === 'ok'),
			checkedAt: new Date().toISOString(),
			tools,
			extensions,
		};
	}

	private base(key: ToolKey, toolPath: string): ToolCheckResult {
		return {
			key,
			label: TOOL_LABELS[key],
			path: toolPath,
			status: 'unknown',
			message: '',
		};
	}

	/** Shared: missing path / not a directory. Returns a finished result when invalid. */
	private requireDir(
		key: ToolKey,
		root: string,
		emptyMsg: string,
		emptyStatus: CheckStatus = 'error'
	): ToolCheckResult | undefined {
		const result = this.base(key, root);
		if (!root) {
			result.status = emptyStatus;
			result.message = emptyMsg;
			return result;
		}
		if (!isDirectory(root)) {
			result.status = 'error';
			result.message = '路径不存在或不是目录';
			return result;
		}
		return undefined;
	}

	private winExe(name: string, unixName = name): string {
		return process.platform === 'win32' ? `${name}.exe` : unixName;
	}

	private async versionLine(command: string, args: string[] = ['--version']): Promise<{ ok: boolean; line?: string; err?: string }> {
		const ver = await runCommand(toBackslash(command), args, { timeoutMs: 5000 });
		if (ver.code !== 0) {
			return { ok: false, err: ver.stderr || `无法执行 ${path.basename(command)}` };
		}
		const line = ver.stdout.split(/\r?\n/)[0]?.trim();
		return { ok: true, line };
	}

	private async checkGcc(root: string): Promise<ToolCheckResult> {
		const early = this.requireDir('gcc', root, '未配置 GCC 路径');
		if (early) {
			return early;
		}
		const result = this.base('gcc', root);
		const gcc = joinForward(root, 'bin', this.winExe('arm-none-eabi-gcc', 'arm-none-eabi-gcc'));
		if (!isFile(gcc)) {
			result.status = 'error';
			result.message = '未找到 bin/arm-none-eabi-gcc';
			return result;
		}
		const ver = await this.versionLine(gcc);
		if (!ver.ok) {
			result.status = 'error';
			result.message = ver.err || '无法执行 gcc';
			return result;
		}
		result.status = 'ok';
		result.version = ver.line;
		result.message = result.version || 'OK';
		return result;
	}

	private async checkSdk(root: string): Promise<ToolCheckResult> {
		const early = this.requireDir('sdk', root, '未配置 SDK 路径');
		if (early) {
			return early;
		}
		const result = this.base('sdk', root);
		const product = path.join(root, '.metadata', 'product.json');
		const driverlib = path.join(root, 'source', 'ti', 'driverlib');
		if (!exists(product)) {
			result.status = 'error';
			result.message = '缺少 .metadata/product.json';
			return result;
		}
		if (!isDirectory(driverlib)) {
			result.status = 'warn';
			result.message = '未找到 source/ti/driverlib';
			return result;
		}
		result.status = 'ok';
		result.message = path.basename(root);
		return result;
	}

	private async checkSysconfig(root: string): Promise<ToolCheckResult> {
		const early = this.requireDir('sysconfig', root, '未配置 SysConfig 路径');
		if (early) {
			return early;
		}
		const result = this.base('sysconfig', root);
		const gui = path.join(root, process.platform === 'win32' ? 'sysconfig_gui.bat' : 'sysconfig_gui');
		const cli = path.join(root, process.platform === 'win32' ? 'sysconfig_cli.bat' : 'sysconfig_cli.sh');
		if (!exists(gui) && !exists(cli)) {
			result.status = 'error';
			result.message = '未找到 sysconfig_gui / sysconfig_cli';
			return result;
		}
		result.status = 'ok';
		result.message = exists(gui) && exists(cli) ? 'GUI + CLI' : exists(gui) ? 'GUI' : 'CLI';
		return result;
	}

	private async checkJlink(root: string): Promise<ToolCheckResult> {
		const early = this.requireDir('jlink', root, '未配置 J-Link 路径');
		if (early) {
			return early;
		}
		const result = this.base('jlink', root);
		const jlink = path.join(root, process.platform === 'win32' ? 'JLink.exe' : 'JLinkExe');
		const gdbServer = path.join(
			root,
			process.platform === 'win32' ? 'JLinkGDBServerCL.exe' : 'JLinkGDBServerCLExe'
		);
		if (!exists(jlink) && !exists(gdbServer)) {
			result.status = 'error';
			result.message = '未找到 JLink 可执行文件';
			return result;
		}
		result.status = 'ok';
		result.message = [exists(jlink) ? 'JLink' : '', exists(gdbServer) ? 'GDBServer' : '']
			.filter(Boolean)
			.join(' + ');
		return result;
	}

	private async checkMake(binDir: string): Promise<ToolCheckResult> {
		const early = this.requireDir('make', binDir, '未配置 make 目录');
		if (early) {
			return early;
		}
		const result = this.base('make', binDir);
		const make = path.join(binDir, this.winExe('make'));
		if (!exists(make)) {
			result.status = 'error';
			result.message = '未找到 make 可执行文件';
			return result;
		}
		const ver = await this.versionLine(make);
		if (!ver.ok) {
			result.status = 'error';
			result.message = ver.err || '无法执行 make';
			return result;
		}
		result.status = 'ok';
		result.version = ver.line;
		result.message = result.version || 'OK';
		return result;
	}

	private async checkOpenocd(binDir: string): Promise<ToolCheckResult> {
		const early = this.requireDir('openocd', binDir, '未配置 OpenOCD（仅 J-Link 时可忽略）', 'warn');
		if (early) {
			return early;
		}
		const result = this.base('openocd', binDir);
		const exe = path.join(binDir, this.winExe('openocd'));
		if (!exists(exe)) {
			result.status = 'error';
			result.message = '未找到 openocd 可执行文件';
			return result;
		}
		// openocd often prints version to stderr
		const ver = await runCommand(exe, ['--version'], { timeoutMs: 5000 });
		const text = `${ver.stdout}\n${ver.stderr}`;
		result.status = 'ok';
		result.version = text.split(/\r?\n/).find((l) => /openocd/i.test(l))?.trim();
		result.message = result.version || 'OK';
		return result;
	}

	private checkExtension(id: string, label: string) {
		const ext = vscode.extensions.getExtension(id);
		if (!ext) {
			return { id, label, status: 'warn' as const, message: '未安装' };
		}
		return {
			id,
			label,
			status: 'ok' as const,
			message: ext.packageJSON?.version ? `v${ext.packageJSON.version}` : '已安装',
		};
	}
}
