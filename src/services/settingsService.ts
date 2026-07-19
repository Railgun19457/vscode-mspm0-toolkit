import * as vscode from 'vscode';
import { DEFAULT_PLUGIN_SETTINGS, PluginSettings } from '../model/types';

/** Read MSPM0 plugin settings with defaults (single source of truth). */
export function readPluginSettings(): PluginSettings {
	const cfg = vscode.workspace.getConfiguration('mspm0');
	const scope = cfg.get<string>('toolPathScope', DEFAULT_PLUGIN_SETTINGS.toolPathScope);
	return {
		buildJobs: cfg.get<number>('buildJobs', DEFAULT_PLUGIN_SETTINGS.buildJobs),
		autoDetectOnStartup: cfg.get<boolean>('autoDetectOnStartup', DEFAULT_PLUGIN_SETTINGS.autoDetectOnStartup),
		toolPathScope: scope === 'workspace' ? 'workspace' : 'user',
		serialBaudRate: cfg.get<number>('serialBaudRate', DEFAULT_PLUGIN_SETTINGS.serialBaudRate),
		defaultDevice: cfg.get<string>('defaultDevice', DEFAULT_PLUGIN_SETTINGS.defaultDevice),
		defaultProbe: cfg.get<string>('defaultProbe', DEFAULT_PLUGIN_SETTINGS.defaultProbe),
		autoSyscfgOnBuild: cfg.get<boolean>('autoSyscfgOnBuild', DEFAULT_PLUGIN_SETTINGS.autoSyscfgOnBuild),
		buildBeforeFlash: cfg.get<boolean>('buildBeforeFlash', DEFAULT_PLUGIN_SETTINGS.buildBeforeFlash),
		buildBeforeDebug: cfg.get<boolean>('buildBeforeDebug', DEFAULT_PLUGIN_SETTINGS.buildBeforeDebug),
		autoSwitchProject: cfg.get<boolean>('autoSwitchProject', DEFAULT_PLUGIN_SETTINGS.autoSwitchProject),
		openOutputOnError: cfg.get<boolean>('openOutputOnError', DEFAULT_PLUGIN_SETTINGS.openOutputOnError),
	};
}
