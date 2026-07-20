import * as fs from 'fs';
import * as path from 'path';
import { DeviceInfo } from '../model/types';

export class DeviceRegistry {
	private devices: DeviceInfo[] = [];

	constructor(private readonly extensionPath: string) {
		this.reload();
	}

	reload(): void {
		const file = path.join(this.extensionPath, 'devices', 'devices.json');
		if (!fs.existsSync(file)) {
			this.devices = [];
			return;
		}
		const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, DeviceInfo>;
		this.devices = Object.values(raw)
			.map((d) => ({
				...d,
				id: d.id || '',
				driverlibLib: d.driverlibLib || 'mspm0g1x0x_g3x0x',
			}))
			.sort((a, b) => a.id.localeCompare(b.id));
	}

	list(): DeviceInfo[] {
		return [...this.devices];
	}

	get(id: string): DeviceInfo | undefined {
		return this.devices.find((d) => d.id === id);
	}
}
