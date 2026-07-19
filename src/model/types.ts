export type ToolKey = 'gcc' | 'sdk' | 'sysconfig' | 'jlink' | 'make' | 'openocd';

export type ProbeType = 'jlink' | 'openocd' | 'xds110' | 'cmsis-dap';

export type InterfaceType = 'swd' | 'jtag';

export type CheckStatus = 'ok' | 'warn' | 'error' | 'unknown';

export type ActionId =
	| 'build'
	| 'clean'
	| 'flash'
	| 'syscfgGui'
	| 'syscfgGen'
	| 'debug';

export interface ToolPaths {
	gcc: string;
	sdk: string;
	sysconfig: string;
	jlink: string;
	make: string;
	openocd: string;
}

export interface ToolCheckResult {
	key: ToolKey;
	label: string;
	path: string;
	status: CheckStatus;
	message: string;
	version?: string;
}

export interface DoctorReport {
	ok: boolean;
	checkedAt: string;
	tools: ToolCheckResult[];
	extensions: Array<{ id: string; label: string; status: CheckStatus; message: string }>;
}

export interface TargetConfig {
	device: string;
	probe: ProbeType;
	interface: InterfaceType;
	speed: number;
	target: string;
	buildDir: string;
	syscfgFile: string;
	executable: string;
}

export interface Mspm0ProjectFile extends TargetConfig {
	version: 1;
}

export interface DeviceInfo {
	id: string;
	series: string;
	family?: string;
	familyDefine: string;
	deviceDefine: string;
	jlinkDevice: string;
	svd: string;
	cpu: string;
	template: string;
	linker: string;
	startup: string;
	driverlibLib?: string;
	openocdTarget?: string;
}

export interface WorkspaceFolderInfo {
	/** Display label, e.g. "app_blink" or "ws/apps/foo" */
	name: string;
	/** Absolute project root path */
	path: string;
	initialized: boolean;
	/** Path relative to nearest VS Code workspace folder */
	relativePath?: string;
	/** True when this entry is a VS Code workspace folder root */
	isWorkspaceRoot?: boolean;
	/** Containing VS Code workspace folder absolute path */
	workspaceFolder?: string;
	/** Short folder name (basename) for compact UI */
	shortName?: string;
	/** Device id from mspm0.project.json when initialized */
	device?: string;
}

export interface ProjectState {
	initialized: boolean;
	root?: string;
	name?: string;
	config?: Mspm0ProjectFile;
}

export interface HealthIssue {
	level: 'ok' | 'warn' | 'error';
	code: string;
	message: string;
}

export interface ProjectHealth {
	ok: boolean;
	issues: HealthIssue[];
}

export interface ActionAvailability {
	build: boolean;
	clean: boolean;
	flash: boolean;
	syscfgGui: boolean;
	syscfgGen: boolean;
	debug: boolean;
	initProject: boolean;
	syncConfig: boolean;
	healthCheck: boolean;
	createProject: boolean;
	openSerial: boolean;
	forceDetect: boolean;
}

export type SidebarPage = 'console' | 'settings';

export interface PluginSettings {
	buildJobs: number;
	autoDetectOnStartup: boolean;
	toolPathScope: 'user' | 'workspace';
	serialBaudRate: number;
	defaultDevice: string;
	defaultProbe: string;
	autoSyscfgOnBuild: boolean;
	buildBeforeFlash: boolean;
	buildBeforeDebug: boolean;
	/**
	 * When true, only auto-open the MSPM0 output channel on failure (success: status bar only).
	 * When false (default), auto-open whenever an action produces output.
	 */
	openOutputOnError: boolean;
	/**
	 * When true (default), switch active MSPM0 project based on the file open in the editor.
	 */
	autoSwitchProject: boolean;
}

export interface SidebarState {
	page: SidebarPage;
	settings: PluginSettings;
	workspaceFolder?: string;
	workspaceFolders: WorkspaceFolderInfo[];
	project: ProjectState;
	health?: ProjectHealth;
	tools: ToolPaths;
	doctor?: DoctorReport;
	target: TargetConfig;
	devices: DeviceInfo[];
	probes: Array<{ id: ProbeType; label: string }>;
	actions: ActionAvailability;
	busyAction?: string;
	lastMessage?: string;
	lastMessageLevel?: 'info' | 'success' | 'error';
}

export const DEFAULT_TARGET: TargetConfig = {
	device: 'MSPM0G3507',
	probe: 'jlink',
	interface: 'swd',
	speed: 4000,
	target: 'app',
	buildDir: 'build',
	syscfgFile: 'syscfg/app.syscfg',
	executable: 'build/app.out',
};

export const EMPTY_TOOL_PATHS: ToolPaths = {
	gcc: '',
	sdk: '',
	sysconfig: '',
	jlink: '',
	make: '',
	openocd: '',
};

export const TOOL_LABELS: Record<ToolKey, string> = {
	gcc: 'Arm GNU Toolchain',
	sdk: 'MSPM0 SDK',
	sysconfig: 'SysConfig',
	jlink: 'J-Link',
	make: 'make',
	openocd: 'OpenOCD',
};

export const TOOL_SETTING_KEYS: Record<ToolKey, string> = {
	gcc: 'mspm0.gccPath',
	sdk: 'mspm0.sdkPath',
	sysconfig: 'mspm0.sysconfigPath',
	jlink: 'mspm0.jlinkPath',
	make: 'mspm0.makePath',
	openocd: 'mspm0.openocdPath',
};

export const PROBE_LABELS: Record<ProbeType, string> = {
	jlink: 'SEGGER J-Link',
	openocd: 'OpenOCD (generic)',
	xds110: 'TI XDS110 (via OpenOCD)',
	'cmsis-dap': 'CMSIS-DAP (via OpenOCD)',
};

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
	buildJobs: 8,
	autoDetectOnStartup: true,
	toolPathScope: 'user',
	serialBaudRate: 115200,
	defaultDevice: 'MSPM0G3507',
	defaultProbe: 'jlink',
	autoSyscfgOnBuild: true,
	buildBeforeFlash: true,
	buildBeforeDebug: true,
	openOutputOnError: false,
	autoSwitchProject: true,
};
