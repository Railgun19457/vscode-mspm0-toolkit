import * as vscode from 'vscode';
import {
	ActionAvailability,
	ActionId,
	DEFAULT_TARGET,
	PluginSettings,
	PROBE_LABELS,
	ProbeType,
	SidebarPage,
	SidebarState,
	TargetConfig,
	ToolKey,
	TOOL_LABELS,
} from '../../model/types';
import { DeviceRegistry } from '../../services/deviceRegistry';
import { ProjectService } from '../../services/projectService';
import { SerialService } from '../../services/serialService';
import { readPluginSettings } from '../../services/settingsService';
import { ToolPathService } from '../../services/toolPathService';
import { ToolchainDetector } from '../../services/toolchainDetector';
import { WorkflowService } from '../../services/workflowService';
import { pathBasename } from '../../util/pathBase';
import { logError, logInfo, logSection, revealOutput } from '../output';
import { StatusBarController } from '../statusBar';
import { HostToWebview, WebviewToHost } from './messages';
import { getSidebarHtml } from './sidebarHtml';

export class SidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'mspm0.sidebar.panel';

	private view?: vscode.WebviewView;
	private targetDraft: TargetConfig = { ...DEFAULT_TARGET };
	private busyAction?: string;
	private lastMessage?: string;
	private lastMessageLevel?: 'info' | 'success' | 'error';
	private messageClearTimer?: ReturnType<typeof setTimeout>;
	private doctorCache?: SidebarState['doctor'];
	private healthCache?: SidebarState['health'];
	private page: SidebarPage = 'console';
	/** Suppress auto-switch noise when user just picked a project manually. */
	private suppressAutoSwitchUntil = 0;
	private autoSwitchTimer?: ReturnType<typeof setTimeout>;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly toolPaths: ToolPathService,
		private readonly detector: ToolchainDetector,
		private readonly projects: ProjectService,
		private readonly devices: DeviceRegistry,
		private readonly workflow: WorkflowService,
		private readonly statusBar?: StatusBarController,
		private readonly serial?: SerialService
	) {
		const settings = readPluginSettings();
		if (settings.defaultDevice) {
			this.targetDraft.device = settings.defaultDevice;
		}
		const probe = settings.defaultProbe;
		if (probe === 'jlink' || probe === 'openocd' || probe === 'xds110' || probe === 'cmsis-dap') {
			this.targetDraft.probe = probe as ProbeType;
		}

		// Auto-switch project when active editor / tab changes (debounced).
		context.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				void this.maybeAutoSwitchProject(this.filePathFromEditor(editor));
			}),
			vscode.window.tabGroups.onDidChangeTabs(() => {
				void this.maybeAutoSwitchProject(this.filePathFromEditor(vscode.window.activeTextEditor));
			}),
			vscode.workspace.onDidOpenTextDocument((doc) => {
				if (doc.uri.scheme !== 'file') {
					return;
				}
				if (vscode.window.activeTextEditor?.document?.uri.toString() === doc.uri.toString()) {
					void this.maybeAutoSwitchProject(doc.uri.fsPath);
				}
			})
		);
	}

	/** Extract a filesystem path from an editor / text document (file scheme only). */
	private filePathFromEditor(editor?: vscode.TextEditor): string | undefined {
		const doc = editor?.document;
		if (!doc) {
			return undefined;
		}
		if (doc.uri.scheme !== 'file') {
			return undefined;
		}
		return doc.uri.fsPath || doc.fileName;
	}

	/**
	 * Switch active project to the one owning the given file (if setting enabled).
	 * Debounced; quiet when busy or user just switched manually.
	 */
	async maybeAutoSwitchProject(filePath?: string): Promise<void> {
		if (this.busyAction) {
			return;
		}
		if (Date.now() < this.suppressAutoSwitchUntil) {
			return;
		}
		if (!readPluginSettings().autoSwitchProject) {
			return;
		}
		const pathToMatch =
			filePath ||
			this.filePathFromEditor(vscode.window.activeTextEditor);
		if (!pathToMatch) {
			return;
		}

		if (this.autoSwitchTimer) {
			clearTimeout(this.autoSwitchTimer);
		}
		// Capture path in closure; re-read active editor at fire time for latest file.
		const requested = pathToMatch;
		this.autoSwitchTimer = setTimeout(() => {
			this.autoSwitchTimer = undefined;
			const latest =
				this.filePathFromEditor(vscode.window.activeTextEditor) || requested;
			void this.runAutoSwitch(latest);
		}, 80);
	}

	private async runAutoSwitch(filePath: string): Promise<void> {
		if (this.busyAction || Date.now() < this.suppressAutoSwitchUntil) {
			return;
		}
		if (!readPluginSettings().autoSwitchProject) {
			return;
		}
		const hit = this.projects.findProjectForFile(filePath);
		if (!hit) {
			return;
		}
		const switched = this.projects.switchToProjectForFile(filePath);
		if (!switched) {
			// Already on the matching project — no UI change needed
			return;
		}
		this.healthCache = undefined;
		const name = hit.name || pathBasename(switched);
		this.setMessage(`已自动切换工程: ${name}`, 'info');
		this.statusBar?.setAction(`工程: ${name}`, 'info', 2500);
		await this.pushState();
	}

	/** Call after user manually selects a project so auto-switch does not fight them. */
	private bumpManualProjectPick(): void {
		// Short suppress so auto-switch still feels responsive after a manual click
		this.suppressAutoSwitchUntil = Date.now() + 800;
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};
		const nonce = getNonce();
		webviewView.webview.html = getSidebarHtml(
			webviewView.webview,
			nonce,
			this.context.extensionUri
		);
		webviewView.webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
			try {
				await this.onMessage(msg);
			} catch (err) {
				const text = err instanceof Error ? err.message : String(err);
				logError(text);
				this.setMessage(text, 'error');
				this.statusBar?.setAction(text, 'error');
				revealOutput('error');
				await this.pushState();
			}
		});
		void this.refreshDoctorAndPush();
	}

	async refreshDoctorAndPush(): Promise<void> {
		const paths = this.toolPaths.getPaths();
		this.doctorCache = await this.detector.inspect(paths);
		await this.pushState();
	}

	async pushState(): Promise<void> {
		const state = this.buildState();
		this.statusBar?.update(state.project, state.doctor);
		if (!this.view) {
			return;
		}
		const msg: HostToWebview = { type: 'state', payload: state };
		await this.view.webview.postMessage(msg);
	}

	private buildState(): SidebarState {
		const project = this.projects.getState();
		if (project.config) {
			this.targetDraft = {
				device: project.config.device,
				probe: project.config.probe,
				interface: project.config.interface,
				speed: project.config.speed,
				target: project.config.target,
				buildDir: project.config.buildDir,
				syscfgFile: project.config.syscfgFile,
				executable: project.config.executable,
			};
		}

		const tools = this.toolPaths.getPaths();
		const doctor = this.doctorCache;
		const toolOk = (key: ToolKey) => doctor?.tools.find((t) => t.key === key)?.status === 'ok';
		const initialized = project.initialized;
		const hasWs = !!this.projects.getWorkspaceRoot();

		const device = this.devices.get(this.targetDraft.device);
		const health = this.healthCache ?? this.projects.checkHealth(project.root, device);
		this.healthCache = health;
		const folders = this.projects.listWorkspaceFolders();

		const probe = this.targetDraft.probe;
		const probeReady =
			probe === 'jlink'
				? toolOk('jlink')
				: toolOk('openocd');
		const actions: ActionAvailability = {
			initProject: hasWs && !this.busyAction,
			syncConfig: hasWs && initialized && !this.busyAction,
			build: hasWs && initialized && toolOk('gcc') && toolOk('make') && toolOk('sdk') && !this.busyAction,
			clean: hasWs && initialized && toolOk('make') && !this.busyAction,
			flash: hasWs && initialized && probeReady && toolOk('make') && !this.busyAction,
			syscfgGui: hasWs && initialized && toolOk('sysconfig') && toolOk('sdk') && !this.busyAction,
			syscfgGen: hasWs && initialized && toolOk('sysconfig') && toolOk('sdk') && toolOk('make') && !this.busyAction,
			debug: hasWs && initialized && toolOk('gcc') && probeReady && !this.busyAction,
			healthCheck: hasWs && !this.busyAction,
			createProject: !this.busyAction,
			openSerial: !this.busyAction,
			forceDetect: !this.busyAction,
		};


		return {
			page: this.page,
			settings: readPluginSettings(),
			workspaceFolder: this.projects.getWorkspaceRoot(),
			workspaceFolders: folders,
			project,
			health,
			tools,
			doctor,
			target: this.targetDraft,
			devices: this.devices.list(),
			probes: (Object.keys(PROBE_LABELS) as ProbeType[]).map((id) => ({
				id,
				label: PROBE_LABELS[id],
			})),
			actions,
			busyAction: this.busyAction,
			lastMessage: this.lastMessage,
			lastMessageLevel: this.lastMessageLevel,
		};
	}

	private setMessage(message: string, level: 'info' | 'success' | 'error' = 'info'): void {
		this.lastMessage = message;
		this.lastMessageLevel = level;
		if (this.messageClearTimer) {
			clearTimeout(this.messageClearTimer);
		}
		this.messageClearTimer = setTimeout(() => {
			this.messageClearTimer = undefined;
			this.lastMessage = undefined;
			this.lastMessageLevel = undefined;
			void this.pushState();
		}, 4000);
	}

	private async onMessage(msg: WebviewToHost): Promise<void> {
		switch (msg.type) {
			case 'ready':
				await this.refreshDoctorAndPush();
				return;
			case 'setPage':
				this.page = msg.payload.page;
				await this.pushState();
				return;
			case 'setPluginSetting':
				await this.handlePluginSetting(msg.payload.key, msg.payload.value);
				return;
			case 'autoDetect':
				await this.handleAutoDetect();
				return;
			case 'doctor':
				await this.refreshDoctorAndPush();
				this.setMessage('检测完成', 'info');
				await this.pushState();
				return;
			case 'setToolPath':
				await this.toolPaths.setPath(msg.payload.key, msg.payload.path, msg.payload.scope ?? this.toolPaths.getDefaultScope());
				await this.refreshDoctorAndPush();
				return;
			case 'browseToolPath':
				await this.handleBrowse(msg.payload.key);
				return;
			case 'setTargetConfig':
				await this.handleTargetConfig(msg.payload);
				return;
			case 'setWorkspaceFolder':
				this.bumpManualProjectPick();
				this.projects.setWorkspaceRoot(msg.payload.path);
				this.healthCache = undefined;
				await this.refreshDoctorAndPush();
				this.setMessage('已切换当前工程', 'info');
				await this.pushState();
				return;
			case 'pickProjectFolder':
				await this.handlePickProjectFolder();
				return;
			case 'refreshProjects':
				this.healthCache = undefined;
				await this.refreshDoctorAndPush();
				this.setMessage('已刷新工程列表', 'info');
				await this.pushState();
				return;
			case 'healthCheck':
				await this.handleHealthCheck();
				return;
			case 'createProject':
				await this.handleCreateProject();
				return;
			case 'forceDetect':
				await this.handleAutoDetect(true);
				return;
			case 'openSerial':
				await this.handleOpenSerial();
				return;
			case 'initProject':
				await this.handleInit();
				return;
			case 'syncConfig':
				await this.handleSync();
				return;
			case 'runAction':
				await this.handleAction(msg.payload.action);
				return;
			case 'setProbe':
				await this.handleTargetConfig({ probe: msg.payload.probe });
				return;
		}
	}

	private async handleAutoDetect(force = false): Promise<void> {
		this.busyAction = 'autoDetect';
		this.statusBar?.setAction(force ? '强制探测工具…' : '探测工具中…', 'running');
		await this.pushState();
		logSection('Auto Detect Tools');
		const detected = await this.toolPaths.autoDetect();
		const applied = await this.toolPaths.applyDetected(detected, force);
		logInfo(JSON.stringify(applied, null, 2));
		this.busyAction = undefined;
		await this.refreshDoctorAndPush();
		const filled = Object.values(applied).filter(Boolean).length;
		const msg = `自动探测完成，已填充 ${filled} 项（${force ? '强制覆盖' : '不覆盖已有配置'}）`;
		this.setMessage(msg, 'success');
		this.statusBar?.setAction(force ? '强制探测完成' : '工具探测完成', 'success');
		await this.pushState();
	}

	private async handleBrowse(key: ToolKey): Promise<void> {
		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: `选择 ${TOOL_LABELS[key]} 目录`,
		});
		if (!picked?.[0]) {
			return;
		}
		await this.toolPaths.setPath(key, picked[0].fsPath, this.toolPaths.getDefaultScope());
		await this.refreshDoctorAndPush();
		this.setMessage(`已更新 ${TOOL_LABELS[key]}`, 'success');
		await this.pushState();
	}

	private async handleTargetConfig(partial: Partial<TargetConfig>): Promise<void> {
		if (partial.device) {
			const raw = String(partial.device).trim();
			const normalized = raw.toUpperCase();
			const hit =
				this.devices.get(raw) ||
				this.devices.get(normalized) ||
				this.devices.list().find((d) => d.id.toUpperCase() === normalized) ||
				this.devices.list().find((d) => d.id.toUpperCase().replace(/^MSPM0/, '') === normalized.replace(/^MSPM0/, ''));
			if (!hit) {
				this.setMessage(`未知芯片型号: ${raw}（可在输入框筛选后从列表选择）`, 'error');
				await this.pushState();
				return;
			}
			partial = { ...partial, device: hit.id };
		}

		this.targetDraft = { ...this.targetDraft, ...partial };
		if (this.projects.isInitialized()) {
			await this.projects.updateTargetConfig(partial);
			// Keep generated configs in sync for device/probe changes
			if (partial.device || partial.probe || partial.interface || partial.speed) {
				await this.projects.syncConfig(this.toolPaths.getPaths());
			}
		}
		if (partial.device) {
			this.setMessage(`已选择芯片: ${partial.device}`, 'success');
		}
		await this.pushState();
	}



	/**
	 * Let the user pick any subfolder inside the current VS Code workspace
	 * and use it as the active project root (for init / multi-project).
	 */
	private async handlePickProjectFolder(): Promise<void> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (!folders.length) {
			throw new Error('请先打开一个工作区文件夹');
		}
		const defaultUri = vscode.Uri.file(this.projects.getWorkspaceRoot() || folders[0].uri.fsPath);
		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			defaultUri,
			openLabel: '选择为工程根目录',
			title: '选择工作区内的工程文件夹',
		});
		if (!picked?.[0]) {
			return;
		}
		const target = picked[0].fsPath;
		if (!this.projects.isPathInsideWorkspace(target)) {
			this.setMessage('只能选择当前工作区内的文件夹', 'error');
			await this.pushState();
			return;
		}
		this.bumpManualProjectPick();
		this.projects.setWorkspaceRoot(target);
		this.healthCache = undefined;
		const initialized = this.projects.isInitialized(target);
		await this.refreshDoctorAndPush();
		this.setMessage(
			initialized ? `已切换到工程: ${target}` : `已选择工程根: ${target}（尚未初始化）`,
			initialized ? 'success' : 'info'
		);
		await this.pushState();
	}

	private async handleCreateProject(): Promise<void> {
		const pathMod = await import('path');
		const fsMod = await import('fs');
		const wsFolders = vscode.workspace.workspaceFolders ?? [];
		const defaultParent = this.projects.getWorkspaceRoot() || wsFolders[0]?.uri.fsPath;

		// Step 1: choose mode — init in selected folder, or create a named subfolder under parent.
		const mode = await vscode.window.showQuickPick(
			[
				{
					label: '在所选文件夹中创建',
					description: '推荐',
					detail: '选择的目录即为工程根（例如选 /Project/test1 → 工程就是 /Project/test1）',
					mode: 'inplace' as const,
				},
				{
					label: '在父目录下新建子文件夹',
					description: '可选',
					detail: '先选父目录，再输入子文件夹名（例如选 /Project + 名称 test1 → /Project/test1）',
					mode: 'subdir' as const,
				},
			],
			{ title: '新建工程', placeHolder: '选择创建方式', ignoreFocusOut: true }
		);
		if (!mode) {
			return;
		}

		const folderUri = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			defaultUri: defaultParent ? vscode.Uri.file(defaultParent) : undefined,
			openLabel: mode.mode === 'inplace' ? '选择工程目录' : '选择父目录',
			title:
				mode.mode === 'inplace'
					? '新建工程 — 选择工程根目录'
					: '新建工程 — 选择父目录',
		});
		if (!folderUri?.[0]) {
			return;
		}

		let targetRoot = folderUri[0].fsPath;
		let displayName = pathMod.basename(targetRoot);

		if (mode.mode === 'subdir') {
			const name = await vscode.window.showInputBox({
				prompt: '子文件夹名称（将在所选父目录下创建）',
				value: 'mspm0_app',
				validateInput: (v) => (!v || /[<>:"/\\|?*]/.test(v) ? '名称无效' : undefined),
				ignoreFocusOut: true,
			});
			if (!name) {
				return;
			}
			targetRoot = pathMod.join(folderUri[0].fsPath, name);
			displayName = name;
		}

		if (fsMod.existsSync(targetRoot) && fsMod.readdirSync(targetRoot).length) {
			const already = this.projects.isInitialized(targetRoot);
			const ok = await vscode.window.showWarningMessage(
				already
					? `目录已是 MSPM0 工程，将补齐缺失文件:\n${targetRoot}`
					: `目录非空，仍要在此初始化吗？\n${targetRoot}`,
				{ modal: true },
				'继续'
			);
			if (ok !== '继续') {
				return;
			}
		}
		fsMod.mkdirSync(targetRoot, { recursive: true });

		this.busyAction = 'createProject';
		await this.pushState();
		try {
			await this.projects.initProject(this.targetDraft, this.toolPaths.getPaths(), targetRoot);
			this.healthCache = undefined;
			this.bumpManualProjectPick();

			const insideWs = this.projects.isPathInsideWorkspace(targetRoot);
			if (insideWs) {
				this.projects.setWorkspaceRoot(targetRoot);
				this.setMessage(`新建工程完成并已切换: ${targetRoot}`, 'success');
				vscode.window.showInformationMessage(`MSPM0 工程已创建并切换为当前工程:\n${targetRoot}`);
			} else {
				const open = await vscode.window.showInformationMessage(
					`工程已创建（在工作区外）: ${targetRoot}`,
					'在新窗口打开',
					'添加到工作区'
				);
				if (open === '在新窗口打开') {
					await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetRoot), true);
				} else if (open === '添加到工作区') {
					const start = vscode.workspace.workspaceFolders?.length ?? 0;
					vscode.workspace.updateWorkspaceFolders(start, 0, {
						uri: vscode.Uri.file(targetRoot),
						name: displayName,
					});
					this.projects.setWorkspaceRoot(targetRoot);
				}
				this.setMessage(`新建工程完成: ${targetRoot}`, 'success');
			}
		} finally {
			this.busyAction = undefined;
			await this.refreshDoctorAndPush();
		}
	}

	private async handleOpenSerial(): Promise<void> {
		const serial = this.serial ?? new SerialService(this.context);
		const result = await serial.open();
		if (result.ok) {
			this.setMessage(result.message, 'success');
			this.statusBar?.setAction('串口已打开', 'success');
			await this.pushState();
			return;
		}
		if (result.canInstall) {
			await serial.promptInstallOrOpen();
		}
		this.setMessage(result.message, 'error');
		this.statusBar?.setAction('串口打开失败', 'error');
		await this.pushState();
	}

	private async handleHealthCheck(): Promise<void> {
		const root = this.projects.getWorkspaceRoot();
		const device = this.devices.get(this.targetDraft.device);
		this.healthCache = this.projects.checkHealth(root, device);
		const bad = this.healthCache.issues.filter((i) => i.level === 'error').length;
		const warn = this.healthCache.issues.filter((i) => i.level === 'warn').length;
		if (this.healthCache.ok) {
			this.setMessage('工程健康检查通过', 'success');
			this.statusBar?.setAction('健康检查通过', 'success');
		} else {
			const msg = `工程健康检查: ${bad} error, ${warn} warn`;
			this.setMessage(msg, 'error');
			this.statusBar?.setAction('健康检查有问题', 'error');
			revealOutput('error');
		}
		await this.pushState();
	}

	private async handleInit(): Promise<void> {
		const root = this.projects.getWorkspaceRoot();
		if (!root) {
			throw new Error('请先打开一个工作区文件夹');
		}
		const already = this.projects.isInitialized(root);
		const pick = await vscode.window.showWarningMessage(
			already
				? `将在已初始化工程上补齐缺失文件:
${root}`
				: `将初始化 MSPM0 工程到:
${root}`,
			{ modal: true },
			'继续',
			'取消'
		);
		if (pick !== '继续') {
			this.setMessage('已取消初始化', 'info');
			await this.pushState();
			return;
		}

		this.busyAction = 'initProject';
		this.statusBar?.setAction('初始化工程…', 'running');
		await this.pushState();
		try {
			this.bumpManualProjectPick();
			await this.projects.initProject(this.targetDraft, this.toolPaths.getPaths(), root);
			this.healthCache = undefined;
			this.setMessage(`工程初始化完成: ${root}`, 'success');
			this.statusBar?.setAction('工程已初始化', 'success');
			vscode.window.showInformationMessage(`MSPM0 工程已初始化: ${root}`);
		} finally {
			this.busyAction = undefined;
			await this.refreshDoctorAndPush();
		}
	}

	private async handleSync(): Promise<void> {
		this.busyAction = 'syncConfig';
		this.statusBar?.setAction('同步配置…', 'running');
		await this.pushState();
		try {
			await this.projects.syncConfig(this.toolPaths.getPaths());
			this.setMessage('配置已同步', 'success');
			this.statusBar?.setAction('配置已同步', 'success');
		} finally {
			this.busyAction = undefined;
			await this.pushState();
		}
	}

	private async handleAction(action: ActionId): Promise<void> {
		const runningLabels: Record<ActionId, string> = {
			build: '构建中…',
			clean: '清理中…',
			flash: '烧录中…',
			syscfgGui: '启动 SysConfig…',
			syscfgGen: '生成 SysConfig…',
			debug: '启动调试…',
		};

		this.busyAction = action;
		this.statusBar?.setAction(runningLabels[action] || '执行中…', 'running');
		await this.pushState();
		try {
			const result = await this.workflow.run(action);
			this.setMessage(result.successMessage, 'success');
			this.statusBar?.setAction(result.statusMessage, 'success');
		} catch (err) {
			const text = err instanceof Error ? err.message : String(err);
			this.setMessage(text, 'error');
			this.statusBar?.setAction(text, 'error');
			revealOutput('error');
			throw err;
		} finally {
			this.busyAction = undefined;
			await this.pushState();
		}
	}

	private async handlePluginSetting(key: keyof PluginSettings, value: string | number | boolean): Promise<void> {
		const cfg = vscode.workspace.getConfiguration('mspm0');
		const target =
			this.toolPaths.getDefaultScope() === 'workspace'
				? vscode.ConfigurationTarget.Workspace
				: vscode.ConfigurationTarget.Global;
		await cfg.update(String(key), value, target);

		if (key === 'defaultDevice' && typeof value === 'string' && value) {
			this.targetDraft.device = value;
		}
		if (key === 'defaultProbe' && typeof value === 'string') {
			if (value === 'jlink' || value === 'openocd' || value === 'xds110' || value === 'cmsis-dap') {
				this.targetDraft.probe = value;
			}
		}

		this.setMessage(`已更新设置: ${String(key)}`, 'success');
		await this.refreshDoctorAndPush();
	}
}

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let id = '';
	for (let i = 0; i < 32; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}
