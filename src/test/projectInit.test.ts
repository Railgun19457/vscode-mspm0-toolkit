import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_TARGET, ToolPaths } from '../model/types';
import { ConfigGenerator } from '../services/configGenerator';
import { DeviceRegistry } from '../services/deviceRegistry';
import { ProjectService } from '../services/projectService';

suite('ProjectService.initProject', () => {
	let tmp = '';
	let service: ProjectService;
	const tools: ToolPaths = {
		gcc: 'D:/arm-gnu-toolchain',
		sdk: 'D:/TI/mspm0_sdk_2_05_01_00',
		sysconfig: 'D:/TI/sysconfig',
		jlink: 'D:/JLink/JLink_V854',
		make: 'D:/mingw64/bin',
		openocd: 'D:/OpenOCD/bin',
	};

	setup(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mspm0-proj-'));
		const extRoot = path.resolve(__dirname, '../..');
		const devices = new DeviceRegistry(extRoot);
		const gen = new ConfigGenerator();
		service = new ProjectService(extRoot, devices, gen);
	});

	teardown(() => {
		try {
			fs.rmSync(tmp, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	test('creates standard project skeleton', async () => {
		await service.initProject({ ...DEFAULT_TARGET }, tools, tmp);
		assert.ok(fs.existsSync(path.join(tmp, 'mspm0.project.json')));
		assert.ok(fs.existsSync(path.join(tmp, 'Makefile')));
		assert.ok(fs.existsSync(path.join(tmp, 'toolpaths.mk')));
		assert.ok(fs.existsSync(path.join(tmp, 'src', 'main.c')));
		assert.ok(fs.existsSync(path.join(tmp, 'src', 'startup_mspm0g350x_gcc.c')));
		assert.ok(fs.existsSync(path.join(tmp, 'linker', 'device.lds')));
		assert.ok(fs.existsSync(path.join(tmp, 'syscfg', 'app.syscfg')));
		assert.ok(fs.existsSync(path.join(tmp, 'syscfg', 'ti_msp_dl_config.c')));
		assert.ok(fs.existsSync(path.join(tmp, '.vscode', 'launch.json')));
		assert.ok(fs.existsSync(path.join(tmp, '.vscode', 'tasks.json')));
		assert.ok(fs.existsSync(path.join(tmp, '.vscode', 'openocd.cfg')));
		const toolpaths = fs.readFileSync(path.join(tmp, 'toolpaths.mk'), 'utf8');
		assert.ok(toolpaths.includes('OPENOCD_BIN'));
		const settings = JSON.parse(fs.readFileSync(path.join(tmp, '.vscode', 'settings.json'), 'utf8'));
		assert.ok(String(settings['cortex-debug.armToolchainPath'] || '').includes('${config:mspm0.gccPath}'));
		const launch = JSON.parse(fs.readFileSync(path.join(tmp, '.vscode', 'launch.json'), 'utf8'));
		const dbg = launch.configurations.find((c: any) => c.name === 'Debug (J-Link)');
		assert.ok(String(dbg?.gdbPath || '').includes('${config:mspm0.gccPath}'));
		const cpp = JSON.parse(fs.readFileSync(path.join(tmp, '.vscode', 'c_cpp_properties.json'), 'utf8'));
		const cfg = cpp.configurations[0];
		assert.ok(cfg.includePath.some((p: string) => p.includes('syscfg')));
		// Absolute SDK path must be present (cpptools does not expand ${config:mspm0.sdkPath})
		assert.ok(
			cfg.includePath.some((p: string) => p.replace(/\\/g, '/').includes('mspm0_sdk') && p.replace(/\\/g, '/').endsWith('/source')),
			JSON.stringify(cfg.includePath)
		);
		const mk = fs.readFileSync(path.join(tmp, 'Makefile'), 'utf8');
		assert.ok(mk.includes('-include toolpaths.mk'));
		const proj = JSON.parse(fs.readFileSync(path.join(tmp, 'mspm0.project.json'), 'utf8'));
		assert.strictEqual(proj.device, 'MSPM0G3507');
		assert.strictEqual(proj.version, 1);
	});

	test('does not overwrite existing main.c', async () => {
		fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
		const custom = '/* custom main */\nint main(void){return 0;}\n';
		fs.writeFileSync(path.join(tmp, 'src', 'main.c'), custom, 'utf8');
		await service.initProject({ ...DEFAULT_TARGET }, tools, tmp);
		const after = fs.readFileSync(path.join(tmp, 'src', 'main.c'), 'utf8');
		assert.strictEqual(after, custom);
	});

	test('init non-G3507 device uses matching startup/opt', async () => {
		await service.initProject(
			{ ...DEFAULT_TARGET, device: 'MSPM0L1306', probe: 'cmsis-dap' },
			tools,
			tmp
		);
		const proj = JSON.parse(fs.readFileSync(path.join(tmp, 'mspm0.project.json'), 'utf8'));
		assert.strictEqual(proj.device, 'MSPM0L1306');
		assert.strictEqual(proj.probe, 'cmsis-dap');
		assert.ok(fs.existsSync(path.join(tmp, 'src', 'startup_mspm0l130x_gcc.c')));
		const opt = fs.readFileSync(path.join(tmp, 'linker', 'device.opt'), 'utf8');
		assert.ok(opt.includes('__MSPM0L1306__'));
		const genlibs = fs.readFileSync(path.join(tmp, 'linker', 'device.lds.genlibs'), 'utf8');
		assert.ok(genlibs.includes('mspm0l11xx_l13xx'));
		const mk = fs.readFileSync(path.join(tmp, 'Makefile'), 'utf8');
		assert.ok(mk.includes('openocd') || mk.includes('OPENOCD'));
		const launch = JSON.parse(fs.readFileSync(path.join(tmp, '.vscode', 'launch.json'), 'utf8'));
		assert.ok(launch.configurations.some((c: any) => c.name === 'Debug (CMSIS-DAP)'));
		assert.ok(launch.configurations.some((c: any) => c.name === 'Debug (J-Link)'));
	});
});
