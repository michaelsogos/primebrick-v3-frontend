/**
 * i18n-fallback — regenerates `src/lib/i18n/messages/en-GB-fallback.json`
 * from the BE's public translations endpoint.
 *
 * The file is the app's offline EN floor for the `app.*` namespace: a
 * generated artifact, never hand-edited. `public.translations` (via the
 * BE seed patches) is the single source of truth.
 *
 * Runs on every dev/build (predev + prebuild). Best-effort by design: a
 * build machine without a reachable BE keeps the committed file — the
 * script warns and exits 0, so builds never depend on a live server.
 *
 *   PB_BE_URL  backend origin override (default http://localhost:3001)
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BE_URL = process.env.PB_BE_URL ?? 'http://localhost:3001';
const LANG = 'en-GB';
const TIMEOUT_MS = 4000;

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'src', 'lib', 'i18n', 'messages', 'en-GB-fallback.json');

const url = `${BE_URL}/api/v1/system/translations/public/${LANG}`;

try {
	const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const dict = await res.json();
	if (!dict || typeof dict !== 'object' || Array.isArray(dict) || Object.keys(dict).length === 0) {
		throw new Error('empty or malformed dict payload');
	}
	const sorted = Object.fromEntries(
		Object.entries(dict).sort(([a], [b]) => a.localeCompare(b)),
	);
	await writeFile(outFile, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
	console.log(`[i18n-fallback] wrote ${Object.keys(sorted).length} keys → ${outFile}`);
} catch (e) {
	console.warn(`[i18n-fallback] BE unreachable (${e.message ?? e}) — keeping committed file`);
}
