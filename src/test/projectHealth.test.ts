import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_TARGET, ToolPaths } from '../model/types';
import { ConfigGenerator } from '../services/configGenerator';
import { DeviceRegistry } from '../services/deviceRegistry';
import { ProjectService } from '../services/projectService';

suite('ProjectService multi-root and health', () => {
	const tools: ToolPaths = {
		gcc: 'D:/arm-gnu-toolchain',
		sdk: 'D:/TI/mspm0_sdk_2_05_01_00',
		sysconfig: 'D:/TI/sysconfig',
		jlink: 'D:/JLink/JLink_V854',
		make: 'D:/mingw64/bin',
		openocd: 'D:/OpenOCD/bin',
	};
	let tmpA = '';
	let tmpB = '';
	let service: ProjectService;

	setup(() => {
		tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'mspm0-a-'));
		tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'mspm0-b-'));
		const extRoot = path.resolve(__dirname, '../..');
		service = new ProjectService(extRoot, new DeviceRegistry(extRoot), new ConfigGenerator());
	});

	teardown(() => {
		for (const d of [tmpA, tmpB]) {
			try {
				fs.rmSync(d, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	});

	test('checkHealth fails when not initialized', () => {
		const health = service.checkHealth(tmpB);
		assert.strictEqual(health.ok, false);
		assert.ok(health.issues.some((i) => i.code === 'not-initialized'));
	});

	test('checkHealth passes after init', async () => {
		await service.initProject({ ...DEFAULT_TARGET }, tools, tmpA);
		const device = new DeviceRegistry(path.resolve(__dirname, '../..')).get('MSPM0G3507');
		const health = service.checkHealth(tmpA, device);
		assert.strictEqual(health.ok, true, JSON.stringify(health.issues));
	});

	test('config merge keeps custom launch entries', async () => {
		await service.initProject({ ...DEFAULT_TARGET }, tools, tmpA);
		const launchPath = path.join(tmpA, '.vscode', 'launch.json');
		const launch = JSON.parse(fs.readFileSync(launchPath, 'utf8'));
		launch.configurations.push({ name: 'Custom User Launch', type: 'node', request: 'launch' });
		fs.writeFileSync(launchPath, JSON.stringify(launch, null, 2));
		await service.syncConfig(tools, tmpA);
		const after = JSON.parse(fs.readFileSync(launchPath, 'utf8'));
		assert.ok(after.configurations.some((c: any) => c.name === 'Custom User Launch'));
		assert.ok(after.configurations.some((c: any) => c.name === 'Debug (J-Link)'));
		assert.ok(after.configurations.some((c: any) => c.name === 'Debug (OpenOCD)'));
	});

	test('explicit root APIs work without active workspace mock', async () => {
		await service.initProject({ ...DEFAULT_TARGET }, tools, tmpA);
		assert.ok(service.isInitialized(tmpA));
		assert.ok(!service.isInitialized(tmpB));
		const stateA = service.getState(tmpA);
		assert.strictEqual(stateA.initialized, true);
		assert.strictEqual(stateA.root, tmpA);
	});

	test('sync probe to xds110 rewrites makefile flash and openocd.cfg', async () => {
		await service.initProject({ ...DEFAULT_TARGET, probe: 'jlink' }, tools, tmpA);
		await service.updateTargetConfig({ probe: 'xds110' }, tmpA);
		await service.syncConfig(tools, tmpA);
		const mk = fs.readFileSync(path.join(tmpA, 'Makefile'), 'utf8');
		assert.ok(mk.includes('OPENOCD'));
		const ocd = fs.readFileSync(path.join(tmpA, '.vscode', 'openocd.cfg'), 'utf8');
		assert.ok(ocd.includes('xds110'));
	});
});
