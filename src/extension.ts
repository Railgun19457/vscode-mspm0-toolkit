import * as vscode from 'vscode';
import { DEFAULT_TARGET } from './model/types';
import { BuildService } from './services/buildService';
import { ConfigGenerator } from './services/configGenerator';
import { DebugService } from './services/debugService';
import { DeviceRegistry } from './services/deviceRegistry';
import { ProjectService } from './services/projectService';
import { ToolPathService } from './services/toolPathService';
import { ToolchainDetector } from './services/toolchainDetector';
import { getOutput, logInfo } from './ui/output';
import { SidebarProvider } from './ui/sidebar/sidebarProvider';
import { StatusBarController } from './ui/statusBar';
import { SerialService } from './services/serialService';

export function activate(context: vscode.ExtensionContext): void {
	logInfo('MSPM0 Toolkit activating...');

	const toolPaths = new ToolPathService();
	const detector = new ToolchainDetector();
	const devices = new DeviceRegistry(context.extensionPath);
	const configGenerator = new ConfigGenerator();
	const projects = new ProjectService(context.extensionPath, devices, configGenerator);
	const build = new BuildService();
	const debug = new DebugService();
	const statusBar = new StatusBarController();
	const serial = new SerialService(context);
	context.subscriptions.push(statusBar);

	const sidebar = new SidebarProvider(
		context,
		toolPaths,
		detector,
		projects,
		devices,
		build,
		debug,
		statusBar
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebar, {
			webviewOptions: { retainContextWhenHidden: true },
		})
	);

	const register = (command: string, fn: () => Promise<void> | void) => {
		context.subscriptions.push(
			vscode.commands.registerCommand(command, async () => {
				try {
					await fn();
				} catch (err) {
					const text = err instanceof Error ? err.message : String(err);
					vscode.window.showErrorMessage(`MSPM0: ${text}`);
					getOutput().appendLine(`[error] ${text}`);
				}
			})
		);
	};

	register('mspm0.openSidebar', async () => {
		await vscode.commands.executeCommand('workbench.view.extension.mspm0');
	});

	register('mspm0.doctor', async () => {
		await sidebar.refreshDoctorAndPush();
		getOutput().show(true);
		vscode.window.showInformationMessage('MSPM0: 环境检测完成（见侧边栏与输出通道）');
	});

	register('mspm0.autoDetectTools', async () => {
		const detected = await toolPaths.autoDetect();
		await toolPaths.applyDetected(detected, false);
		await sidebar.refreshDoctorAndPush();
		vscode.window.showInformationMessage('MSPM0: 自动探测完成');
	});

	register('mspm0.initProject', async () => {
		const project = projects.getState();
		const target = project.config ?? {
			...DEFAULT_TARGET,
			device: vscode.workspace.getConfiguration('mspm0').get<string>('defaultDevice', DEFAULT_TARGET.device),
		};
		await projects.initProject(target, toolPaths.getPaths());
		await sidebar.refreshDoctorAndPush();
		vscode.window.showInformationMessage('MSPM0: 工程已初始化');
	});

	register('mspm0.syncConfig', async () => {
		await projects.syncConfig(toolPaths.getPaths());
		await sidebar.refreshDoctorAndPush();
		vscode.window.showInformationMessage('MSPM0: 配置已同步');
	});

	register('mspm0.build', async () => {
		const root = requireRoot(projects);
		const cfg = vscode.workspace.getConfiguration('mspm0');
		const jobs = cfg.get<number>('buildJobs', 8);
		const tools = toolPaths.getPaths();
		if (cfg.get<boolean>('autoSyscfgOnBuild', true)) {
			await build.syscfgGenerate(root, tools);
		}
		await build.build(root, tools, jobs);
		vscode.window.showInformationMessage('MSPM0: 构建完成');
	});

	register('mspm0.clean', async () => {
		const root = requireRoot(projects);
		await build.clean(root, toolPaths.getPaths());
		vscode.window.showInformationMessage('MSPM0: 清理完成');
	});

	register('mspm0.flash', async () => {
		const root = requireRoot(projects);
		const cfg = vscode.workspace.getConfiguration('mspm0');
		const tools = toolPaths.getPaths();
		const buildFirst = cfg.get<boolean>('buildBeforeFlash', true);
		if (buildFirst && cfg.get<boolean>('autoSyscfgOnBuild', true)) {
			await build.syscfgGenerate(root, tools);
		}
		await build.flash(root, tools, buildFirst);
		vscode.window.showInformationMessage(buildFirst ? 'MSPM0: 构建并烧录完成' : 'MSPM0: 烧录完成');
	});


	register('mspm0.sysconfig.openGui', async () => {
		const root = requireRoot(projects);
		const cfg = projects.readConfig(root);
		if (!cfg) {
			throw new Error('工程未初始化');
		}
		const tools = toolPaths.getPaths();
		await build.syscfgGui(root, tools, tools.sdk, cfg.syscfgFile);
	});

	register('mspm0.sysconfig.generate', async () => {
		const root = requireRoot(projects);
		await build.syscfgGenerate(root, toolPaths.getPaths());
		vscode.window.showInformationMessage('MSPM0: SysConfig 生成完成');
	});

	register('mspm0.debug', async () => {
		const root = requireRoot(projects);
		const project = projects.readConfig(root);
		const cfg = vscode.workspace.getConfiguration('mspm0');
		const tools = toolPaths.getPaths();
		if (cfg.get<boolean>('buildBeforeDebug', true)) {
			const jobs = cfg.get<number>('buildJobs', 8);
			if (cfg.get<boolean>('autoSyscfgOnBuild', true)) {
				await build.syscfgGenerate(root, tools);
			}
			await build.build(root, tools, jobs);
		}
		await debug.start(undefined, project?.probe, root);
	});
	register('mspm0.healthCheck', async () => {
		const root = projects.getWorkspaceRoot();
		const cfg = projects.readConfig(root);
		const deviceId = cfg?.device || vscode.workspace.getConfiguration('mspm0').get<string>('defaultDevice', DEFAULT_TARGET.device);
		const device = devices.get(deviceId);
		const health = projects.checkHealth(root, device);
		getOutput().show(true);
		getOutput().appendLine('==== Health Check ====');
		for (const issue of health.issues) {
			getOutput().appendLine('[' + issue.level + '] ' + issue.message);
		}
		await sidebar.refreshDoctorAndPush();
		vscode.window.showInformationMessage(health.ok ? 'MSPM0: 工程健康检查通过' : 'MSPM0: 工程健康检查发现问题，详见输出通道');
	});

	register('mspm0.createProject', async () => {
		// reuse sidebar flow via command palette
		await vscode.commands.executeCommand('mspm0.openSidebar');
		vscode.window.showInformationMessage('请在 MSPM0 侧边栏点击 “新建工程”');
	});

	register('mspm0.openSerial', async () => {
		const result = await serial.open();
		if (result.ok) {
			vscode.window.showInformationMessage(`MSPM0: ${result.message}`);
			return;
		}
		if (result.canInstall) {
			await serial.promptInstallOrOpen();
			return;
		}
		vscode.window.showWarningMessage(`MSPM0: ${result.message}`);
	});

	register('mspm0.forceDetectTools', async () => {
		const detected = await toolPaths.autoDetect();
		await toolPaths.applyDetected(detected, true);
		await sidebar.refreshDoctorAndPush();
		vscode.window.showInformationMessage('MSPM0: 强制探测并覆盖路径完成');
	});


	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('mspm0')) {
				await sidebar.refreshDoctorAndPush();
			}
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(async () => {
			await sidebar.refreshDoctorAndPush();
		})
	);

	const auto = vscode.workspace.getConfiguration('mspm0').get<boolean>('autoDetectOnStartup', true);
	if (auto) {
		void (async () => {
			const current = toolPaths.getPaths();
			const missing = Object.values(current).some((v) => !v);
			if (missing) {
				const detected = await toolPaths.autoDetect();
				await toolPaths.applyDetected(detected, false);
			}
			await sidebar.refreshDoctorAndPush();
		})();
	} else {
		void sidebar.refreshDoctorAndPush();
	}

	logInfo('MSPM0 Toolkit activated');
}

export function deactivate(): void {}

function requireRoot(projects: ProjectService): string {
	const root = projects.getWorkspaceRoot();
	if (!root) {
		throw new Error('请先打开工作区文件夹');
	}
	if (!projects.isInitialized(root)) {
		throw new Error('请先初始化 MSPM0 工程');
	}
	return root;
}

