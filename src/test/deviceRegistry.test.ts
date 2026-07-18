import * as assert from 'assert';
import * as path from 'path';
import { DeviceRegistry } from '../services/deviceRegistry';

suite('DeviceRegistry', () => {
	test('loads full MSPM0 catalog', () => {
		const extRoot = path.resolve(__dirname, '../..');
		const reg = new DeviceRegistry(extRoot);
		const list = reg.list();
		assert.ok(list.length >= 39, `expected >=39 devices, got ${list.length}`);
		const d = reg.get('MSPM0G3507');
		assert.ok(d);
		assert.strictEqual(d?.deviceDefine, '__MSPM0G3507__');
		assert.strictEqual(d?.template, 'mspm0g3507');
		assert.ok(d?.driverlibLib);
		assert.ok(d?.startup);
	});

	test('covers major series', () => {
		const extRoot = path.resolve(__dirname, '../..');
		const reg = new DeviceRegistry(extRoot);
		const series = new Set(reg.list().map((d) => d.series));
		for (const s of ['MSPM0L', 'MSPM0G', 'MSPM0C', 'MSPM0H']) {
			assert.ok(series.has(s), `missing series ${s}`);
		}
	});
});
