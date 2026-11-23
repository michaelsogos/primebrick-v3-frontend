#!/usr/bin/env node
/**
 * vendor-ensure — skip `vendor:build` when its inputs are unchanged.
 *
 * `pnpm dev` used to run the vendor-plane build unconditionally (~22s).
 * The vendoring mechanism is untouched — same config, same outputs, same
 * manifest handshake — this only gates the rebuild behind an input stamp.
 *
 * Stamp inputs (everything the bundle actually depends on):
 *   - vendor/vite.vendor.config.ts + vendor/entries/*  (build semantics)
 *   - primebrick-v3-ui/vendor-map.json                 (wrapper map)
 *   - package.json + pnpm-lock.yaml                    (dep ranges + the
 *     resolved transitive tree — a leaf bump inside a vendored package
 *     changes bundle bytes without touching any top version)
 *   - ui/core package.json + dist fingerprints         (link: deps — the
 *     vendor build resolves workspace packages through their DIST, so
 *     relpath:size:mtimeMs of every dist file catches a rebuild that
 *     kept the same version)
 *
 * Force a rebuild anytime with `pnpm vendor:build` (stamp rewrites after
 * a successful build).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const FE = fileURLToPath(new URL('..', import.meta.url));
const WS = join(FE, '..');
const STAMP = join(FE, 'static', 'vendor', '.stamp');
const MANIFEST = join(FE, 'static', 'vendor', 'vendor-manifest.json');

const hash = createHash('sha256');
const feed = (s) => hash.update(String(s));
const feedFile = (p) => { if (!existsSync(p)) { feed(`MISSING:${p}\n`); return; } feed(readFileSync(p)); feed('\n'); };

/** sorted `rel:size:mtimeMs` fingerprint of a tree */
function feedTree(root) {
  if (!existsSync(root)) { feed(`MISSING-DIR:${root}\n`); return; }
  const stack = [root], files = [];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) files.push(p);
    }
  }
  files.sort();
  for (const f of files) {
    const st = statSync(f);
    feed(`${relative(root, f)}:${st.size}:${st.mtimeMs}\n`);
  }
}

feedFile(join(FE, 'vendor', 'vite.vendor.config.ts'));
for (const e of readdirSync(join(FE, 'vendor', 'entries')).sort()) {
  feedFile(join(FE, 'vendor', 'entries', e));
}
feedFile(join(WS, 'primebrick-v3-ui', 'vendor-map.json'));
feedFile(join(FE, 'package.json'));
feedFile(join(FE, 'pnpm-lock.yaml'));
for (const repo of ['primebrick-v3-ui', 'primebrick-v3-core']) {
  feedFile(join(WS, repo, 'package.json'));
  feedTree(join(WS, repo, 'dist'));
}

const stamp = hash.digest('hex');
let current = '';
try { current = readFileSync(STAMP, 'utf8').trim(); } catch { /* stamp unreadable → rebuild below */ }

if (current === stamp && existsSync(MANIFEST)) {
  console.log('[vendor-ensure] vendor inputs unchanged — skipping build');
  process.exit(0);
}

console.log('[vendor-ensure] vendor inputs changed — building…');
const r = spawnSync('node', [join(FE, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vendor/vite.vendor.config.ts'],
  { cwd: FE, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
writeFileSync(STAMP, stamp + '\n');
console.log('[vendor-ensure] build done — stamp written');
