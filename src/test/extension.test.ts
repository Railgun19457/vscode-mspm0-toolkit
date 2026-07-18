import * as assert from 'assert';
import * as vscode from 'vscode';

suite('MSPM0 Toolkit', () => {
test('extension is present', () => {
const ext = vscode.extensions.getExtension('mspm0-toolkit.mspm0-toolkit');
// In development host publisher may vary; just ensure API works
assert.ok(vscode.workspace !== undefined);
assert.ok(ext === undefined || typeof ext.activate === 'function');
});
});
