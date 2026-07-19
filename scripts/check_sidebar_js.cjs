/**
 * Verify webview JS embedded in sidebarHtml.ts is syntactically valid after
 * TypeScript template-literal escape processing.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '../src/ui/sidebar/sidebarHtml.ts');
const src = fs.readFileSync(srcPath, 'utf8');

// Extract the template string body of getSidebarHtml return `...`
const start = src.indexOf('return `');
if (start < 0) {
	console.error('Could not find return template');
	process.exit(1);
}
let i = start + 'return `'.length;
let html = '';
while (i < src.length) {
	const ch = src[i];
	if (ch === '\\' && i + 1 < src.length) {
		// TS template escape: consume backslash, keep next char (except for specials we care about)
		const next = src[i + 1];
		if (next === '`' || next === '\\' || next === '$') {
			html += next;
			i += 2;
			continue;
		}
		// other escapes like \n
		if (next === 'n') {
			html += '\n';
			i += 2;
			continue;
		}
		if (next === 'r') {
			html += '\r';
			i += 2;
			continue;
		}
		if (next === 't') {
			html += '\t';
			i += 2;
			continue;
		}
		html += next;
		i += 2;
		continue;
	}
	if (ch === '`') {
		// end of template (not escaped)
		break;
	}
	if (ch === '$' && src[i + 1] === '{') {
		// skip ${...} interpolation — replace with placeholder
		let depth = 1;
		i += 2;
		while (i < src.length && depth > 0) {
			if (src[i] === '{') depth++;
			else if (src[i] === '}') depth--;
			i++;
		}
		html += 'PLACEHOLDER';
		continue;
	}
	html += ch;
	i++;
}

const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
if (!scriptMatch) {
	console.error('No script block found in emitted HTML');
	process.exit(1);
}
const script = scriptMatch[1];

// Stub browser / vscode APIs so we only check parse + basic init structure
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
	// Show nearby lines if SyntaxError
	if (err instanceof SyntaxError) {
		const lines = script.split('\n');
		const m = String(err.stack || '').match(/:(\d+)/);
		const line = m ? Number(m[1]) : 0;
		if (line) {
			const from = Math.max(0, line - 3);
			const to = Math.min(lines.length, line + 2);
			console.error('--- context ---');
			for (let n = from; n < to; n++) {
				console.error(String(n + 1).padStart(4) + (n + 1 === line ? '>>' : '  ') + lines[n]);
			}
		}
	}
	process.exit(1);
}
