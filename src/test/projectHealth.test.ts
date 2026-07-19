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

	test('nested project under workspace uses ${workspaceFolder}/rel paths', async () => {
		const vscode = require('./mocks/vscode');
		const child = path.join(tmpA, 'apps', 'blink');
		fs.mkdirSync(child, { recursive: true });
		vscode.workspace.workspaceFolders = [
			{ name: 'repo', uri: { fsPath: tmpA, path: tmpA } },
		];
		try {
			await service.initProject({ ...DEFAULT_TARGET }, tools, child);
			assert.ok(service.isInitialized(child));
			assert.strictEqual(service.getProjectRelFromWorkspace(child).replace(/\\/g, '/'), 'apps/blink');

			const launch = JSON.parse(fs.readFileSync(path.join(child, '.vscode', 'launch.json'), 'utf8'));
			const dbg = launch.configurations.find((c: any) => c.name === 'Debug (J-Link)');
			assert.ok(String(dbg?.cwd || '').includes('${workspaceFolder}/apps/blink'));
			assert.ok(String(dbg?.executable || '').includes('${workspaceFolder}/apps/blink/'));

			const tasks = JSON.parse(fs.readFileSync(path.join(child, '.vscode', 'tasks.json'), 'utf8'));
			const build = tasks.tasks.find((t: any) => t.label === 'build');
			assert.ok(String(build?.options?.cwd || '').includes('${workspaceFolder}/apps/blink'));

			// IntelliSense: project-local + workspace-root c_cpp_properties with absolute SDK path
			const childCpp = JSON.parse(fs.readFileSync(path.join(child, '.vscode', 'c_cpp_properties.json'), 'utf8'));
			const childCfg = childCpp.configurations[0];
			assert.ok(childCfg.includePath.some((p: string) => p.includes('/apps/blink/syscfg') || p.includes('${workspaceFolder}/apps/blink/syscfg')));
			assert.ok(
				childCfg.includePath.some((p: string) => p.replace(/\\/g, '/').includes('mspm0_sdk') && p.replace(/\\/g, '/').endsWith('/source')),
				`expected absolute SDK include, got: ${JSON.stringify(childCfg.includePath)}`
			);

			assert.ok(fs.existsSync(path.join(tmpA, '.vscode', 'c_cpp_properties.json')));
			const wsCpp = JSON.parse(fs.readFileSync(path.join(tmpA, '.vscode', 'c_cpp_properties.json'), 'utf8'));
			assert.ok(wsCpp.configurations.some((c: any) => String(c.name || '').includes('apps/blink')));
			const wsSettings = JSON.parse(fs.readFileSync(path.join(tmpA, '.vscode', 'settings.json'), 'utf8'));
			assert.ok(Array.isArray(wsSettings['C_Cpp.default.includePath']));
			assert.ok(
				wsSettings['C_Cpp.default.includePath'].some(
					(p: string) => p.replace(/\\/g, '/').includes('mspm0_sdk') && p.replace(/\\/g, '/').includes('/source')
				)
			);

			const listed = service.listWorkspaceFolders();
			assert.ok(listed.some((p) => path.normalize(p.path) === path.normalize(child) && p.initialized));
			assert.ok(listed.some((p) => path.normalize(p.path) === path.normalize(tmpA)));
		} finally {
			vscode.workspace.workspaceFolders = undefined;
		}
	});

	test('multiple nested projects can coexist and switch active root', async () => {
		const vscode = require('./mocks/vscode');
		const p1 = path.join(tmpA, 'proj_a');
		const p2 = path.join(tmpA, 'proj_b');
		fs.mkdirSync(p1, { recursive: true });
		fs.mkdirSync(p2, { recursive: true });
		vscode.workspace.workspaceFolders = [
			{ name: 'mono', uri: { fsPath: tmpA, path: tmpA } },
		];
		try {
			await service.initProject({ ...DEFAULT_TARGET, target: 'app_a' }, tools, p1);
			await service.initProject({ ...DEFAULT_TARGET, target: 'app_b', device: 'MSPM0G3507' }, tools, p2);

			const listed = service.listWorkspaceFolders().filter((p) => p.initialized);
			assert.ok(listed.length >= 2);
			assert.ok(listed.some((p) => path.normalize(p.path) === path.normalize(p1)));
			assert.ok(listed.some((p) => path.normalize(p.path) === path.normalize(p2)));

			service.setWorkspaceRoot(p1);
			assert.strictEqual(path.normalize(service.getWorkspaceRoot()!), path.normalize(p1));
			assert.strictEqual(service.readConfig()?.target, 'app_a');

			service.setWorkspaceRoot(p2);
			assert.strictEqual(path.normalize(service.getWorkspaceRoot()!), path.normalize(p2));
			assert.strictEqual(service.readConfig()?.target, 'app_b');
		} finally {
			vscode.workspace.workspaceFolders = undefined;
		}
	});

	test('scan finds many sibling projects and under initialized parent', async () => {
		const vscode = require('./mocks/vscode');
		// Workspace root itself is a project AND has multiple children that are projects.
		// Old scanner stopped at parent and only listed ~2 entries.
		const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
		for (const n of names) {
			fs.mkdirSync(path.join(tmpA, 'apps', n), { recursive: true });
		}
		vscode.workspace.workspaceFolders = [
			{ name: 'mono', uri: { fsPath: tmpA, path: tmpA } },
		];
		try {
			await service.initProject({ ...DEFAULT_TARGET, target: 'root_app' }, tools, tmpA);
			for (const n of names) {
				await service.initProject(
					{ ...DEFAULT_TARGET, target: n },
					tools,
					path.join(tmpA, 'apps', n)
				);
			}
			const listed = service.listWorkspaceFolders().filter((p) => p.initialized);
			// root + 5 children
			assert.ok(listed.length >= 6, `expected >=6 projects, got ${listed.length}: ${listed.map((p) => p.name).join(', ')}`);
			for (const n of names) {
				const full = path.normalize(path.join(tmpA, 'apps', n));
				assert.ok(
					listed.some((p) => path.normalize(p.path) === full),
					`missing project ${n}`
				);
			}
		} finally {
			vscode.workspace.workspaceFolders = undefined;
		}
	});

	test('setWorkspaceRoot rejects paths outside workspace when workspace is open', async () => {
		const vscode = require('./mocks/vscode');
		vscode.workspace.workspaceFolders = [
			{ name: 'ws', uri: { fsPath: tmpA, path: tmpA } },
		];
		try {
			service.setWorkspaceRoot(tmpA);
			assert.strictEqual(path.normalize(service.getWorkspaceRoot()!), path.normalize(tmpA));
			service.setWorkspaceRoot(tmpB);
			// Outside path ignored; active root stays tmpA
			assert.strictEqual(path.normalize(service.getWorkspaceRoot()!), path.normalize(tmpA));
		} finally {
			vscode.workspace.workspaceFolders = undefined;
		}
	});

	test('findProjectForFile prefers deepest initialized project', async () => {
		const vscode = require('./mocks/vscode');
		const p1 = path.join(tmpA, 'apps', 'blink');
		const p2 = path.join(tmpA, 'apps', 'uart');
		fs.mkdirSync(path.join(p1, 'src'), { recursive: true });
		fs.mkdirSync(path.join(p2, 'src'), { recursive: true });
		vscode.workspace.workspaceFolders = [
			{ name: 'mono', uri: { fsPath: tmpA, path: tmpA } },
		];
		try {
			await service.initProject({ ...DEFAULT_TARGET, target: 'blink' }, tools, p1);
			await service.initProject({ ...DEFAULT_TARGET, target: 'uart' }, tools, p2);

			const fileInP1 = path.join(p1, 'src', 'main.c');
			const hit = service.findProjectForFile(fileInP1);
			assert.ok(hit);
			assert.strictEqual(path.normalize(hit!.path), path.normalize(p1));

			const fileInP2 = path.join(p2, 'syscfg', 'app.syscfg');
			const hit2 = service.findProjectForFile(fileInP2);
			assert.ok(hit2);
			assert.strictEqual(path.normalize(hit2!.path), path.normalize(p2));

			// Root project + nested: file under nested must not stick to root
			await service.initProject({ ...DEFAULT_TARGET, target: 'root' }, tools, tmpA);
			const nestedHit = service.findProjectForFile(fileInP1);
			assert.ok(nestedHit);
			assert.strictEqual(path.normalize(nestedHit!.path), path.normalize(p1));

			// Case-insensitive / mixed separators (Windows-like)
			const mixed = fileInP1.replace(/\\/g, '/');
			const mixedHit = service.findProjectForFile(mixed);
			assert.ok(mixedHit);
			assert.strictEqual(path.normalize(mixedHit!.path), path.normalize(p1));

			// Switching
			service.setWorkspaceRoot(p1);
			const switched = service.switchToProjectForFile(fileInP2);
			assert.ok(switched);
			assert.strictEqual(path.normalize(switched!), path.normalize(p2));
			// Same project → no switch
			assert.strictEqual(service.switchToProjectForFile(fileInP2), undefined);

			// Display: nested projects use relative path as name
			const listed = service.listWorkspaceFolders().filter((p) => p.initialized);
			const blinkInfo = listed.find((p) => path.normalize(p.path) === path.normalize(p1));
			assert.ok(blinkInfo);
			assert.ok(
				blinkInfo!.name.includes('apps/blink') || blinkInfo!.name.includes('apps\\blink') || blinkInfo!.name === 'apps/blink',
				`unexpected name: ${blinkInfo!.name}`
			);
			assert.strictEqual(blinkInfo!.device, 'MSPM0G3507');
		} finally {
			vscode.workspace.workspaceFolders = undefined;
		}
	});
});
