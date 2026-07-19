/** Path basename without importing Node `path` (works for webview-adjacent host code). */
export function pathBasename(p: string): string {
	const norm = p.replace(/\\/g, '/');
	const parts = norm.split('/').filter(Boolean);
	return parts[parts.length - 1] || p;
}
