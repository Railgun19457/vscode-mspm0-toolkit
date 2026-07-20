import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_TARGET, ToolPaths } from '../model/types';
import { ConfigGenerator } from '../services/configGenerator';
import { Mspm0CppConfigurationProvider } from '../services/cppConfigurationProvider';
import { DeviceRegistry } from '../services/deviceRegistry';
import { ProjectService } from '../services/projectService';
import { ToolPathService } from '../services/toolPathService';

suite('CppConfigurationProvider / source-file IntelliSense', () => {
	const tools: ToolPaths = {
		gcc: 'D:/arm-gnu-toolchain',
		sdk: 'D:/TI/mspm0_sdk_2_05_01_00',
		sysconfig: 'D:/TI/sysconfig',
		jlink: 'D:/JLink/JLink_V854',
		make: 'D:/mingw64/bin',
		openocd: 'D:/OpenOCD/bin',
	};
	let tmp = '';
	let service: ProjectService;
	let gen: ConfigGenerator;

	setup(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mspm0-cpp-'));
		const extRoot = path.resolve(__dirname, '../..');
		gen = new ConfigGenerator();
		service = new ProjectService(extRoot, new DeviceRegistry(extRoot), gen);
	});

	teardown(() => {
		try {
			fs.rmSync(tmp, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	});

	test('buildSourceFileConfiguration uses absolute project paths only', async () => {
		const vscode = require('./mocks/vscode');
		const p1 = path.join(tmp, 'test2');
		const p2 = path.join(tmp, 'test3');
		fs.mkdirSync(p1, { recursive: true });
		fs.mkdirSync(p2, { recursive: true });
		vscode.workspace.workspaceFolders = [{ name: 'repo', uri: { fsPath: tmp, path: tmp } }];
		try {
			await service.initProject({ ...DEFAULT_TARGET, target: 'app2' }, tools, p1);
			await service.initProject({ ...DEFAULT_TARGET, target: 'app3' }, tools, p2);

			// Nested headers like real apps: #include "board.h" needs …/src/board on -I.
			const nest = path.join(p1, 'src', 'board');
			fs.mkdirSync(nest, { recursive: true });
			fs.writeFileSync(path.join(nest, 'board.h'), '#pragma once\n');

			const device = new DeviceRegistry(path.resolve(__dirname, '../..')).get('MSPM0G3507')!;
			const cfg1 = gen.buildSourceFileConfiguration(p1, service.readConfig(p1)!, device, tools);
			const cfg2 = gen.buildSourceFileConfiguration(p2, service.readConfig(p2)!, device, tools);

			const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
			const p1n = norm(p1);
			const p2n = norm(p2);

			assert.ok(cfg1.includePath.some((p) => norm(p).includes(p1n) && norm(p).endsWith('/syscfg')));
			assert.ok(cfg2.includePath.some((p) => norm(p).includes(p2n) && norm(p).endsWith('/syscfg')));
			assert.ok(
				cfg1.includePath.some((p) => norm(p).endsWith('/src/board')),
				`expected nested header dir in includePath, got: ${JSON.stringify(cfg1.includePath)}`
			);
			// Critical: each config must not pull the sibling project's syscfg.
			assert.ok(!cfg1.includePath.some((p) => norm(p).includes(p2n)));
			assert.ok(!cfg2.includePath.some((p) => norm(p).includes(p1n)));
			assert.ok(cfg1.includePath.some((p) => norm(p).includes('mspm0_sdk') && norm(p).endsWith('/source')));
			assert.ok(cfg1.defines.includes('__MSPM0G3507__'));
			assert.ok(cfg1.compilerPath.replace(/\\/g, '/').includes('arm-none-eabi-gcc'));
			assert.ok(!cfg1.includePath.some((p) => p.includes('/**')));
		} finally {
			vscode.workspace.workspaceFolders = undefined;
		}
	});

	test('provider maps file under nested project to that project config', async () => {
		const vscode = require('./mocks/vscode');
		const p1 = path.join(tmp, 'test2');
		const p2 = path.join(tmp, 'test3');
		fs.mkdirSync(p1, { recursive: true });
		fs.mkdirSync(p2, { recursive: true });
		vscode.workspace.workspaceFolders = [{ name: 'repo', uri: { fsPath: tmp, path: tmp } }];

		// Stub tool paths used by the provider
		const toolsService = {
			getPaths: () => tools,
		} as unknown as ToolPathService;

		const extRoot = path.resolve(__dirname, '../..');
		const devices = new DeviceRegistry(extRoot);
		const provider = new Mspm0CppConfigurationProvider(service, devices, toolsService, gen);

		try {
			await service.initProject({ ...DEFAULT_TARGET, target: 'app2' }, tools, p1);
			await service.initProject({ ...DEFAULT_TARGET, target: 'app3' }, tools, p2);

			const file1 = path.join(p1, 'src', 'main.c');
			const file2 = path.join(p2, 'src', 'main.c');
			fs.mkdirSync(path.dirname(file1), { recursive: true });
			fs.mkdirSync(path.dirname(file2), { recursive: true });
			fs.writeFileSync(file1, '/* a */\n');
			fs.writeFileSync(file2, '/* b */\n');

			const can1 = await provider.canProvideConfiguration(vscode.Uri.file(file1));
			const can2 = await provider.canProvideConfiguration(vscode.Uri.file(file2));
			assert.strictEqual(can1, true);
			assert.strictEqual(can2, true);

			const items = await provider.provideConfigurations([
				vscode.Uri.file(file1),
				vscode.Uri.file(file2),
			]);
			assert.strictEqual(items.length, 2);

			const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
			const inc1 = items[0].configuration.includePath.map(norm);
			const inc2 = items[1].configuration.includePath.map(norm);
			assert.ok(inc1.some((p) => p.includes(norm(p1)) && p.endsWith('/syscfg')));
			assert.ok(inc2.some((p) => p.includes(norm(p2)) && p.endsWith('/syscfg')));
			assert.ok(!inc1.some((p) => p.includes(norm(p2))));
			assert.ok(!inc2.some((p) => p.includes(norm(p1))));
		} finally {
			provider.dispose();
			vscode.workspace.workspaceFolders = undefined;
		}
	});
});
