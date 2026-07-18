import * as fs from 'fs';
import * as path from 'path';

export function toForward(p: string): string {
	return p ? p.replace(/\\/g, '/') : p;
}

export function toBackslash(p: string): string {
	return p ? p.replace(/\//g, '\\') : p;
}

export function normalizePath(p: string): string {
	if (!p) {
		return '';
	}
	return toForward(path.resolve(p.trim()));
}

export function exists(p: string): boolean {
	if (!p) {
		return false;
	}
	try {
		return fs.existsSync(p);
	} catch {
		return false;
	}
}

export function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

export function isFile(p: string): boolean {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
}

export function joinForward(...parts: string[]): string {
	return toForward(path.join(...parts));
}

export function firstExisting(candidates: string[]): string | undefined {
	for (const c of candidates) {
		if (c && exists(c)) {
			return normalizePath(c);
		}
	}
	return undefined;
}

export function listSubdirs(root: string): string[] {
	try {
		return fs
			.readdirSync(root, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => path.join(root, d.name));
	} catch {
		return [];
	}
}
