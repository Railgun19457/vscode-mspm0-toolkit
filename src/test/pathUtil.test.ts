import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { firstExisting, toBackslash, toForward } from '../util/pathUtil';

suite('pathUtil', () => {
	test('toForward converts backslashes', () => {
		assert.strictEqual(toForward('C:\\TI\\sdk'), 'C:/TI/sdk');
	});

	test('toBackslash converts forward slashes', () => {
		assert.strictEqual(toBackslash('C:/TI/sdk'), 'C:\\TI\\sdk');
	});

	test('firstExisting returns first existing path', () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mspm0-'));
		const a = path.join(tmp, 'a');
		const b = path.join(tmp, 'b');
		fs.mkdirSync(b);
		const hit = firstExisting([a, b]);
		assert.ok(hit);
		assert.ok(hit.replace(/\\/g, '/').endsWith('/b'));
	});
});
