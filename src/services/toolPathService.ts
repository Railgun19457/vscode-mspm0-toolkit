import * as fs from 'fs';
import * as vscode from 'vscode';
import { EMPTY_TOOL_PATHS, ToolKey, ToolPaths, TOOL_SETTING_KEYS } from '../model/types';
import { firstExisting, isDirectory, listSubdirs, normalizePath, toForward } from '../util/pathUtil';

export type ToolPathScope = 'user' | 'workspace';

export class ToolPathService {
	getPaths(): ToolPaths {
		const cfg = vscode.workspace.getConfiguration('mspm0');
		return {
			gcc: normalizePath(cfg.get<string>('gccPath', '')),
			sdk: normalizePath(cfg.get<string>('sdkPath', '')),
			sysconfig: normalizePath(cfg.get<string>('sysconfigPath', '')),
			jlink: normalizePath(cfg.get<string>('jlinkPath', '')),
			make: normalizePath(cfg.get<string>('makePath', '')),
			openocd: normalizePath(cfg.get<string>('openocdPath', '')),
		};
	}

	async setPath(key: ToolKey, value: string, scope: ToolPathScope = 'user'): Promise<void> {
		const target =
			scope === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
		const cfg = vscode.workspace.getConfiguration('mspm0');
		const setting = TOOL_SETTING_KEYS[key].replace(/^mspm0\./, '');
		await cfg.update(setting, value ? toForward(value) : '', target);
	}

	getDefaultScope(): ToolPathScope {
		const scope = vscode.workspace.getConfiguration('mspm0').get<string>('toolPathScope', 'user');
		return scope === 'workspace' ? 'workspace' : 'user';
	}

	async autoDetect(): Promise<ToolPaths> {
		const found: ToolPaths = { ...EMPTY_TOOL_PATHS };
		const driveRoots = ['C:/', 'D:/', 'E:/'];

		const gccCandidates: string[] = ['D:/arm-gnu-toolchain', 'C:/arm-gnu-toolchain'];
		for (const root of driveRoots) {
			gccCandidates.push(...listSubdirs(`${root}Program Files (x86)`).filter((p) => /arm gnu toolchain/i.test(p)));
			gccCandidates.push(...listSubdirs(`${root}Program Files`).filter((p) => /arm gnu toolchain/i.test(p)));
		}
		found.gcc =
			firstExisting(gccCandidates.filter((p) => isDirectory(p) && isDirectory(`${p}/bin`))) ??
			(await this.whichDir('arm-none-eabi-gcc')) ??
			'';

		const sdkCandidates: string[] = [];
		for (const root of ['C:/TI', 'D:/TI', 'E:/TI', 'C:/ti', 'D:/ti']) {
			sdkCandidates.push(...listSubdirs(root).filter((p) => /mspm0_sdk/i.test(p)));
		}
		found.sdk =
			firstExisting(sdkCandidates.filter((p) => isDirectory(`${p}/source`) || isDirectory(`${p}/.metadata`))) ?? '';

		const sysCandidates = ['C:/TI/sysconfig', 'D:/TI/sysconfig', 'E:/TI/sysconfig', 'C:/ti/sysconfig', 'D:/ti/sysconfig'];
		found.sysconfig = firstExisting(sysCandidates.filter((p) => isDirectory(p))) ?? '';

		const jlinkCandidates: string[] = ['D:/JLink', 'C:/JLink'];
		for (const root of driveRoots) {
			jlinkCandidates.push(...listSubdirs(`${root}Program Files/SEGGER`).filter((p) => /jlink/i.test(p)));
			jlinkCandidates.push(...listSubdirs(`${root}JLink`));
			jlinkCandidates.push(...listSubdirs(root).filter((p) => /jlink/i.test(p)));
		}
		found.jlink =
			firstExisting(
				jlinkCandidates.filter(
					(p) => isDirectory(p) && (fs.existsSync(`${p}/JLink.exe`) || fs.existsSync(`${p}/JLinkGDBServerCL.exe`))
				)
			) ?? '';

		const makeCandidates = ['D:/mingw64/bin', 'C:/mingw64/bin', 'C:/msys64/usr/bin', 'D:/msys64/usr/bin'];
		found.make = firstExisting(makeCandidates) ?? (await this.whichDir('make')) ?? '';

		const ocdCandidates = [
			'D:/OpenOCD/bin',
			'C:/OpenOCD/bin',
			'D:/openocd/bin',
			'C:/openocd/bin',
			'D:/xpack-openocd/bin',
			'C:/xpack-openocd/bin',
		];
		for (const root of driveRoots) {
			ocdCandidates.push(...listSubdirs(root).filter((p) => /openocd/i.test(p)).map((p) => `${p}/bin`));
			ocdCandidates.push(
				...listSubdirs(`${root}Program Files`).filter((p) => /openocd/i.test(p)).map((p) => `${p}/bin`)
			);
		}
		found.openocd =
			firstExisting(
				ocdCandidates.filter(
					(p) =>
						isDirectory(p) &&
						(fs.existsSync(`${p}/openocd.exe`) || fs.existsSync(`${p}/openocd`))
				)
			) ??
			(await this.whichDir('openocd')) ??
			'';

		return found;
	}

	async applyDetected(detected: ToolPaths, overwrite = false): Promise<ToolPaths> {
		const current = this.getPaths();
		const scope = this.getDefaultScope();
		const next: ToolPaths = { ...current };
		for (const key of Object.keys(detected) as ToolKey[]) {
			const value = detected[key];
			if (!value) {
				continue;
			}
			if (!overwrite && current[key]) {
				continue;
			}
			await this.setPath(key, value, scope);
			next[key] = value;
		}
		return next;
	}

	private async whichDir(exeName: string): Promise<string | undefined> {
		const pathEnv = process.env.PATH ?? process.env.Path ?? '';
		const parts = pathEnv.split(';').filter(Boolean);
		const names = process.platform === 'win32' ? [`${exeName}.exe`, exeName] : [exeName];
		for (const dir of parts) {
			for (const name of names) {
				const full = `${dir.replace(/\\/g, '/')}/${name}`;
				try {
					if (fs.existsSync(full)) {
						return normalizePath(dir);
					}
				} catch {
					// ignore
				}
			}
		}
		return undefined;
	}
}
