import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { firstExisting, toBackslash, toForward } from '../util/pathUtil';
import { isPathInsideRoot, normalizeRoot, pathKey } from '../util/workspacePath';

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

suite('workspacePath', () => {
	test('isPathInsideRoot accepts nested paths and rejects siblings', () => {
		const root = normalizeRoot(path.join(os.tmpdir(), 'mspm0-ws-root'));
		const child = path.join(root, 'apps', 'blink');
		const sibling = path.join(path.dirname(root), 'other');
		assert.strictEqual(isPathInsideRoot(child, root), true);
		assert.strictEqual(isPathInsideRoot(root, root), true);
		assert.strictEqual(isPathInsideRoot(sibling, root), false);
	});

	test('pathKey is case-insensitive on win32', () => {
		if (process.platform !== 'win32') {
			return;
		}
		const a = pathKey('E:/Code/App');
		const b = pathKey('e:\\code\\app');
		assert.strictEqual(a, b);
	});
});
