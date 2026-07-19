import * as vscode from 'vscode';
import { DEFAULT_TARGET } from './model/types';
import { BuildService } from './services/buildService';
import { ConfigGenerator } from './services/configGenerator';
import { DebugService } from './services/debugService';
import { DeviceRegistry } from './services/deviceRegistry';
import { ProjectService } from './services/projectService';
import { SerialService } from './services/serialService';
import { readPluginSettings } from './services/settingsService';
import { ToolPathService } from './services/toolPathService';
import { ToolchainDetector } from './services/toolchainDetector';
import { WorkflowService } from './services/workflowService';
import { getOutput, logInfo, revealOutput, showOutput } from './ui/output';
import { SidebarProvider } from './ui/sidebar/sidebarProvider';
import { StatusBarController } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext): void {
	logInfo('MSPM0 Toolkit activating...');

	const toolPaths = new ToolPathService();
	const detector = new ToolchainDetector();
	const devices = new DeviceRegistry(context.extensionPath);
	const configGenerator = new ConfigGenerator();
	const projects = new ProjectService(context.extensionPath, devices, configGenerator);
	const build = new BuildService();
	const debug = new DebugService();
	const workflow = new WorkflowService(projects, toolPaths, build, debug);
	const statusBar = new StatusBarController();
	const serial = new SerialService(context);
	context.subscriptions.push(statusBar);

	const sidebar = new SidebarProvider(
		context,
		toolPaths,
		detector,
		projects,
		devices,
		workflow,
		statusBar,
		serial
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
					statusBar.setAction(text, 'error');
					revealOutput('error');
					vscode.window.showErrorMessage(`MSPM0: ${text}`);
					getOutput().appendLine(`[error] ${text}`);
				}
			})
		);
	};

	const runWorkflow = async (
		action: 'build' | 'clean' | 'flash' | 'syscfgGui' | 'syscfgGen' | 'debug',
		runningLabel: string,
		notify = true
	) => {
		statusBar.setAction(runningLabel, 'running');
		const result = await workflow.run(action);
		statusBar.setAction(result.statusMessage, 'success');
		if (notify) {
			vscode.window.showInformationMessage(`MSPM0: ${result.successMessage}`);
		}
	};

	register('mspm0.openSidebar', async () => {
		await vscode.commands.executeCommand('workbench.view.extension.mspm0');
	});

	register('mspm0.showOutput', async () => {
		showOutput();
	});

	register('mspm0.doctor', async () => {
		statusBar.setAction('环境检测中…', 'running');
		await sidebar.refreshDoctorAndPush();
		statusBar.setAction('环境检测完成', 'success');
		vscode.window.showInformationMessage('MSPM0: 环境检测完成（见侧边栏；点击状态栏可看输出）');
	});

	register('mspm0.autoDetectTools', async () => {
		statusBar.setAction('探测工具中…', 'running');
		const detected = await toolPaths.autoDetect();
		await toolPaths.applyDetected(detected, false);
		await sidebar.refreshDoctorAndPush();
		statusBar.setAction('工具探测完成', 'success');
		vscode.window.showInformationMessage('MSPM0: 自动探测完成');
	});

	register('mspm0.initProject', async () => {
		statusBar.setAction('初始化工程…', 'running');
		const project = projects.getState();
		const settings = readPluginSettings();
		const target = project.config ?? {
			...DEFAULT_TARGET,
			device: settings.defaultDevice,
		};
		await projects.initProject(target, toolPaths.getPaths());
		await sidebar.refreshDoctorAndPush();
		statusBar.setAction('工程已初始化', 'success');
		vscode.window.showInformationMessage('MSPM0: 工程已初始化');
	});

	register('mspm0.syncConfig', async () => {
		statusBar.setAction('同步配置…', 'running');
		await projects.syncConfig(toolPaths.getPaths());
		await sidebar.refreshDoctorAndPush();
		statusBar.setAction('配置已同步', 'success');
		vscode.window.showInformationMessage('MSPM0: 配置已同步');
	});

	register('mspm0.build', async () => {
		await runWorkflow('build', '构建中…');
	});

	register('mspm0.clean', async () => {
		await runWorkflow('clean', '清理中…');
	});

	register('mspm0.flash', async () => {
		const buildFirst = readPluginSettings().buildBeforeFlash;
		await runWorkflow('flash', buildFirst ? '构建并烧录…' : '烧录中…');
	});

	register('mspm0.sysconfig.openGui', async () => {
		await runWorkflow('syscfgGui', '启动 SysConfig…', false);
	});

	register('mspm0.sysconfig.generate', async () => {
		await runWorkflow('syscfgGen', '生成 SysConfig…');
	});

	register('mspm0.debug', async () => {
		await runWorkflow('debug', '启动调试…', false);
	});

	register('mspm0.healthCheck', async () => {
		const root = projects.getWorkspaceRoot();
		const cfg = projects.readConfig(root);
		const deviceId = cfg?.device || readPluginSettings().defaultDevice;
		const device = devices.get(deviceId);
		const health = projects.checkHealth(root, device);
		getOutput().appendLine('==== Health Check ====');
		for (const issue of health.issues) {
			getOutput().appendLine('[' + issue.level + '] ' + issue.message);
		}
		await sidebar.refreshDoctorAndPush();
		if (health.ok) {
			statusBar.setAction('健康检查通过', 'success');
		} else {
			statusBar.setAction('健康检查有问题', 'error');
			revealOutput('error');
		}
		vscode.window.showInformationMessage(
			health.ok ? 'MSPM0: 工程健康检查通过' : 'MSPM0: 工程健康检查发现问题，点击状态栏查看输出'
		);
	});

	register('mspm0.createProject', async () => {
		await vscode.commands.executeCommand('mspm0.openSidebar');
		vscode.window.showInformationMessage('请在 MSPM0 侧边栏点击 “新建工程”');
	});

	register('mspm0.openSerial', async () => {
		const result = await serial.open();
		if (result.ok) {
			statusBar.setAction('串口已打开', 'success');
			vscode.window.showInformationMessage(`MSPM0: ${result.message}`);
			return;
		}
		statusBar.setAction('串口打开失败', 'error');
		if (result.canInstall) {
			await serial.promptInstallOrOpen();
			return;
		}
		vscode.window.showWarningMessage(`MSPM0: ${result.message}`);
	});

	register('mspm0.forceDetectTools', async () => {
		statusBar.setAction('强制探测工具…', 'running');
		const detected = await toolPaths.autoDetect();
		await toolPaths.applyDetected(detected, true);
		await sidebar.refreshDoctorAndPush();
		statusBar.setAction('强制探测完成', 'success');
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

	void (async () => {
		const settings = readPluginSettings();
		if (settings.autoDetectOnStartup) {
			const current = toolPaths.getPaths();
			const missing = Object.values(current).some((v) => !v);
			if (missing) {
				const detected = await toolPaths.autoDetect();
				await toolPaths.applyDetected(detected, false);
			}
		}
		await sidebar.refreshDoctorAndPush();
		await sidebar.maybeAutoSwitchProject();
	})();

	logInfo('MSPM0 Toolkit activated');
}

export function deactivate(): void {}
