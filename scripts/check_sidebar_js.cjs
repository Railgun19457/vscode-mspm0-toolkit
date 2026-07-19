/**
 * Verify sidebar webview JS (media/sidebar/main.js) is syntactically valid.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const jsPath = path.join(__dirname, '../media/sidebar/main.js');
if (!fs.existsSync(jsPath)) {
console.error('Missing media/sidebar/main.js');
process.exit(1);
}
const script = fs.readFileSync(jsPath, 'utf8');

const sandbox = {
console,
document: {
getElementById: () => ({
classList: { toggle() {}, add() {}, remove() {} },
addEventListener() {},
value: '',
textContent: '',
innerHTML: '',
disabled: false,
checked: false,
title: '',
options: [],
appendChild() {},
onclick: null,
}),
querySelectorAll: () => [],
createElement: () => ({
value: '',
textContent: '',
title: '',
label: '',
appendChild() {},
}),
},
window: { addEventListener() {} },
acquireVsCodeApi: () => ({ postMessage() {} }),
Array,
String,
Number,
Boolean,
Object,
JSON,
Math,
Error,
setTimeout,
clearTimeout,
};

try {
vm.runInNewContext(script, sandbox, { timeout: 2000 });
console.log('sidebar webview JS: OK (parsed + executed stubs)');
} catch (err) {
console.error('sidebar webview JS: FAIL');
console.error(err && err.stack ? err.stack : err);
process.exit(1);
}
