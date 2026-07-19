import * as path from 'path';
import * as vscode from 'vscode';

/** Normalize to an absolute path. */
export function normalizeRoot(p: string): string {
	return path.normalize(path.resolve(p));
}

/** Case-insensitive map key on Windows so E:\a and e:\a match. */
export function pathKey(p: string): string {
	const n = normalizeRoot(p);
	return process.platform === 'win32' ? n.toLowerCase() : n;
}

/**
 * True when `fileAbs` is the same as or inside `rootAbs` (Windows-safe).
 * Uses path.relative to avoid startsWith pitfalls (C:\proj vs C:\project).
 */
export function isPathInsideRoot(fileAbs: string, rootAbs: string): boolean {
	const fileKey = pathKey(fileAbs);
	const rootKey = pathKey(rootAbs);
	if (fileKey === rootKey) {
		return true;
	}
	const rel = path.relative(rootAbs, fileAbs);
	if (!rel || rel === '') {
		return true;
	}
	if (path.isAbsolute(rel)) {
		return false;
	}
	if (rel === '..' || rel.startsWith('..' + path.sep) || rel.startsWith('../')) {
		return false;
	}
	return true;
}

/** Nearest workspace folder containing `targetAbs`, or undefined. */
export function findContainingWorkspaceFolder(
	targetAbs: string,
	folders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders ?? []
): vscode.WorkspaceFolder | undefined {
	const abs = normalizeRoot(targetAbs);
	let best: vscode.WorkspaceFolder | undefined;
	let bestLen = -1;
	for (const f of folders) {
		const folderAbs = normalizeRoot(f.uri.fsPath);
		if (!isPathInsideRoot(abs, folderAbs)) {
			continue;
		}
		if (folderAbs.length > bestLen) {
			best = f;
			bestLen = folderAbs.length;
		}
	}
	return best;
}
