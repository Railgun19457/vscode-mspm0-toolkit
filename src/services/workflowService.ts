import { ActionId, ProbeType, ToolPaths } from '../model/types';
import { BuildService } from './buildService';
import { DebugService } from './debugService';
import { ProjectService } from './projectService';
import { readPluginSettings } from './settingsService';
import { ToolPathService } from './toolPathService';

export interface WorkflowResult {
	successMessage: string;
	statusMessage: string;
}

/**
 * Shared build/flash/debug/syscfg pipeline used by both command palette and sidebar.
 * Keeps auto-syscfg / build-before-flash / build-before-debug semantics in one place.
 */
export class WorkflowService {
	constructor(
		private readonly projects: ProjectService,
		private readonly tools: ToolPathService,
		private readonly build: BuildService,
		private readonly debug: DebugService
	) {}

	/** Active initialized project root, or throw. */
	requireRoot(): string {
		const root = this.projects.getWorkspaceRoot();
		if (!root) {
			throw new Error('请先打开工作区文件夹');
		}
		if (!this.projects.isInitialized(root)) {
			throw new Error('请先初始化 MSPM0 工程');
		}
		return root;
	}

	async run(action: ActionId, projectRoot?: string): Promise<WorkflowResult> {
		const root = projectRoot ?? this.requireRoot();
		const tools = this.tools.getPaths();
		const settings = readPluginSettings();
		const project = this.projects.readConfig(root);
		if (!project) {
			throw new Error('无法读取工程配置');
		}

		switch (action) {
			case 'build':
				await this.maybeSyscfg(root, tools, settings.autoSyscfgOnBuild);
				await this.build.build(root, tools, settings.buildJobs);
				return {
					successMessage: settings.autoSyscfgOnBuild ? 'SysConfig + 构建完成' : '构建完成',
					statusMessage: '构建成功',
				};
			case 'clean':
				await this.build.clean(root, tools);
				return { successMessage: '清理完成', statusMessage: '清理完成' };
			case 'flash': {
				const buildFirst = settings.buildBeforeFlash;
				if (buildFirst) {
					await this.maybeSyscfg(root, tools, settings.autoSyscfgOnBuild);
				}
				await this.build.flash(root, tools, buildFirst);
				return {
					successMessage: buildFirst ? '构建并烧录完成' : '烧录完成（未重建）',
					statusMessage: buildFirst ? '构建并烧录成功' : '烧录成功',
				};
			}
			case 'syscfgGui':
				await this.build.syscfgGui(root, tools, tools.sdk, project.syscfgFile);
				return { successMessage: '已打开 SysConfig GUI', statusMessage: 'SysConfig 已启动' };
			case 'syscfgGen':
				await this.build.syscfgGenerate(root, tools);
				return { successMessage: 'SysConfig 代码生成完成', statusMessage: 'SysConfig 生成成功' };
			case 'debug':
				if (settings.buildBeforeDebug) {
					await this.maybeSyscfg(root, tools, settings.autoSyscfgOnBuild);
					await this.build.build(root, tools, settings.buildJobs);
				}
				await this.debug.start(undefined, project.probe as ProbeType | undefined, root);
				return {
					successMessage: settings.buildBeforeDebug ? '构建后已启动调试' : '已启动调试',
					statusMessage: '调试已启动',
				};
			default: {
				const _exhaustive: never = action;
				throw new Error(`未知操作: ${_exhaustive}`);
			}
		}
	}

	private async maybeSyscfg(root: string, tools: ToolPaths, enabled: boolean): Promise<void> {
		if (enabled) {
			await this.build.syscfgGenerate(root, tools);
		}
	}
}
