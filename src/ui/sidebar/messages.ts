import {
	ActionId,
	PluginSettings,
	ProbeType,
	SidebarPage,
	SidebarState,
	TargetConfig,
	ToolKey,
} from '../../model/types';
import { ToolPathScope } from '../../services/toolPathService';

export type HostToWebview =
	| { type: 'state'; payload: SidebarState }
	| { type: 'actionProgress'; payload: { id: string; status: 'running' | 'ok' | 'error'; message?: string } };

export type WebviewToHost =
	| { type: 'ready' }
	| { type: 'setPage'; payload: { page: SidebarPage } }
	| { type: 'autoDetect' }
	| { type: 'doctor' }
	| { type: 'healthCheck' }
	| { type: 'setToolPath'; payload: { key: ToolKey; path: string; scope?: ToolPathScope } }
	| { type: 'browseToolPath'; payload: { key: ToolKey } }
	| { type: 'setTargetConfig'; payload: Partial<TargetConfig> }
	| { type: 'setPluginSetting'; payload: { key: keyof PluginSettings; value: string | number | boolean } }
	| { type: 'setWorkspaceFolder'; payload: { path: string } }
	| { type: 'initProject' }
	| { type: 'createProject' }
	| { type: 'forceDetect' }
	| { type: 'openSerial' }
	| { type: 'syncConfig' }
	| { type: 'runAction'; payload: { action: ActionId } }
	| { type: 'setProbe'; payload: { probe: ProbeType } };
