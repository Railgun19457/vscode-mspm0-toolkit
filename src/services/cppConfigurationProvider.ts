import * as path from 'path';
import * as vscode from 'vscode';
import {
	CustomConfigurationProvider,
	CppToolsApi,
	SourceFileConfiguration,
	SourceFileConfigurationItem,
	Version,
	WorkspaceBrowseConfiguration,
	getCppToolsApi,
} from 'vscode-cpptools';
import { DeviceInfo, Mspm0ProjectFile, ToolPaths } from '../model/types';
import { logInfo } from '../ui/output';
import { toForward } from '../util/pathUtil';
import { pathKey } from '../util/workspacePath';
import { ConfigGenerator } from './configGenerator';
import { DeviceRegistry } from './deviceRegistry';
import { ProjectService } from './projectService';
import { ToolPathService } from './toolPathService';

/**
 * Custom Configuration Provider for ms-vscode.cpptools.
 * Returns per-file IntelliSense config based on the owning MSPM0 project root,
 * so nested monorepos with identical ti_msp_dl_config.h names resolve correctly.
 */
export class Mspm0CppConfigurationProvider implements CustomConfigurationProvider {
	readonly name = 'MSPM0 Toolkit';
	/** Must match marketplace id: publisher.name */
	readonly extensionId = 'Railgun19457.mspm0-toolkit';

	private api: CppToolsApi | undefined;
	private disposed = false;
	/** Cache by project root pathKey → configuration */
	private readonly configCache = new Map<string, SourceFileConfiguration>();

	constructor(
		private readonly projects: ProjectService,
		private readonly devices: DeviceRegistry,
		private readonly toolPaths: ToolPathService,
		private readonly configGenerator: ConfigGenerator
	) {}

	/**
	 * Register with cpptools when available. Safe no-op if C/C++ extension is missing.
	 * @returns true when provider was registered
	 */
	async register(): Promise<boolean> {
		if (this.disposed) {
			return false;
		}
		try {
			const api = await getCppToolsApi(Version.v6);
			if (!api || this.disposed) {
				logInfo('C/C++ extension API unavailable; IntelliSense falls back to project-local c_cpp_properties.json (if present)');
				return false;
			}
			this.api = api;
			api.registerCustomConfigurationProvider(this);
			// v2+: signal ready so cpptools starts requesting configs.
			if (typeof api.notifyReady === 'function') {
				api.notifyReady(this);
			}
			logInfo('Registered C/C++ custom configuration provider (per-project IntelliSense)');
			return true;
		} catch (err) {
			const text = err instanceof Error ? err.message : String(err);
			logInfo(`C/C++ configuration provider registration skipped: ${text}`);
			return false;
		}
	}

	/** Drop caches and tell cpptools to re-query (tool paths / projects changed). */
	notifyChanged(): void {
		this.configCache.clear();
		if (!this.api || this.disposed) {
			return;
		}
		try {
			this.api.didChangeCustomConfiguration(this);
			this.api.didChangeCustomBrowseConfiguration(this);
		} catch {
			// cpptools may be disposing
		}
	}

	dispose(): void {
		this.disposed = true;
		this.configCache.clear();
		try {
			this.api?.dispose();
		} catch {
			// ignore
		}
		this.api = undefined;
	}

	canProvideConfiguration(uri: vscode.Uri, _token?: vscode.CancellationToken): Thenable<boolean> {
		return Promise.resolve(!!this.resolveInitializedProject(uri));
	}

	provideConfigurations(
		uris: vscode.Uri[],
		_token?: vscode.CancellationToken
	): Thenable<SourceFileConfigurationItem[]> {
		const tools = this.toolPaths.getPaths();
		const items: SourceFileConfigurationItem[] = [];
		for (const uri of uris) {
			const hit = this.resolveInitializedProject(uri);
			if (!hit) {
				continue;
			}
			const configuration = this.configurationForProject(hit.path, hit.project, hit.device, tools);
			if (!configuration) {
				continue;
			}
			items.push({ uri, configuration });
		}
		return Promise.resolve(items);
	}

	canProvideBrowseConfiguration(_token?: vscode.CancellationToken): Thenable<boolean> {
		return Promise.resolve(this.listInitializedRoots().length > 0);
	}

	provideBrowseConfiguration(_token?: vscode.CancellationToken): Thenable<WorkspaceBrowseConfiguration | null> {
		const roots = this.listInitializedRoots();
		if (!roots.length) {
			return Promise.resolve(null);
		}
		return Promise.resolve(this.buildBrowseConfiguration(roots));
	}

	canProvideBrowseConfigurationsPerFolder(_token?: vscode.CancellationToken): Thenable<boolean> {
		return Promise.resolve(true);
	}

	provideFolderBrowseConfiguration(
		uri: vscode.Uri,
		_token?: vscode.CancellationToken
	): Thenable<WorkspaceBrowseConfiguration | null> {
		const folderRoot = path.normalize(uri.fsPath);
		const roots = this.listInitializedRoots().filter((r) => {
			const key = pathKey(r);
			const folderKey = pathKey(folderRoot);
			return key === folderKey || key.startsWith(folderKey + path.sep) || key.startsWith(folderKey + '/');
		});
		if (!roots.length) {
			return Promise.resolve(null);
		}
		return Promise.resolve(this.buildBrowseConfiguration(roots));
	}

	private resolveInitializedProject(
		uri: vscode.Uri
	): { path: string; project: Mspm0ProjectFile; device: DeviceInfo } | undefined {
		const hit = this.projects.findProjectForFile(uri.fsPath);
		if (!hit?.initialized) {
			return undefined;
		}
		const project = this.projects.readConfig(hit.path);
		if (!project) {
			return undefined;
		}
		const device = this.devices.get(project.device);
		if (!device) {
			return undefined;
		}
		return { path: hit.path, project, device };
	}

	private listInitializedRoots(): string[] {
		return this.projects
			.listWorkspaceFolders()
			.filter((p) => p.initialized)
			.map((p) => p.path);
	}

	private configurationForProject(
		projectRoot: string,
		project: Mspm0ProjectFile,
		device: DeviceInfo,
		tools: ToolPaths
	): SourceFileConfiguration | undefined {
		const key = `${pathKey(projectRoot)}|${tools.sdk}|${tools.gcc}|${project.device}`;
		const cached = this.configCache.get(key);
		if (cached) {
			return cached;
		}
		const built = this.configGenerator.buildSourceFileConfiguration(projectRoot, project, device, tools);
		// Map our portable shape onto cpptools SourceFileConfiguration field names.
		const mapped: SourceFileConfiguration = {
			includePath: built.includePath,
			defines: built.defines,
			compilerPath: built.compilerPath,
			standard: built.cStandard,
			intelliSenseMode: built.intelliSenseMode,
		};
		this.configCache.set(key, mapped);
		return mapped;
	}

	private buildBrowseConfiguration(projectRoots: string[]): WorkspaceBrowseConfiguration {
		const tools = this.toolPaths.getPaths();
		const browsePath: string[] = [];
		for (const root of projectRoots) {
			const abs = toForward(path.resolve(root));
			browsePath.push(abs);
			browsePath.push(`${abs}/src`);
			browsePath.push(`${abs}/syscfg`);
			// Explicit nested header dirs (browse also benefits from concrete paths).
			for (const d of this.configGenerator.collectHeaderIncludeDirs(path.join(root, 'src'))) {
				browsePath.push(d);
			}
		}
		const sdk = toForward(tools.sdk || '');
		const gcc = toForward(tools.gcc || '');
		if (sdk) {
			browsePath.push(`${sdk}/source`);
			browsePath.push(`${sdk}/source/third_party/CMSIS/Core/Include`);
		}
		if (gcc) {
			browsePath.push(`${gcc}/arm-none-eabi/include`);
		}
		const compilerPath = gcc
			? process.platform === 'win32'
				? `${gcc}/bin/arm-none-eabi-gcc.exe`
				: `${gcc}/bin/arm-none-eabi-gcc`
			: undefined;
		return {
			browsePath: Array.from(new Set(browsePath.filter(Boolean))),
			compilerPath,
			standard: 'c99',
		};
	}
}
