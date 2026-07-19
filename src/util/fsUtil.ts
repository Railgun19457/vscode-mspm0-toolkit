import * as fs from 'fs';
import * as path from 'path';
import { exists } from './pathUtil';

export function ensureDir(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

export function writeTextFile(filePath: string, content: string): void {
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, content, 'utf8');
}

export function readTextFile(filePath: string): string {
	return fs.readFileSync(filePath, 'utf8');
}

export function readJsonFile<T>(filePath: string): T {
	return JSON.parse(readTextFile(filePath)) as T;
}

export function writeJsonFile(filePath: string, data: unknown): void {
	writeTextFile(filePath, JSON.stringify(data, null, 2) + '\n');
}

export function copyFileIfMissing(src: string, dest: string): boolean {
	if (exists(dest)) {
		return false;
	}
	ensureDir(path.dirname(dest));
	fs.copyFileSync(src, dest);
	return true;
}

/** Alias of pathUtil.exists for project-layer readability. */
export function pathExists(p: string): boolean {
	return exists(p);
}
