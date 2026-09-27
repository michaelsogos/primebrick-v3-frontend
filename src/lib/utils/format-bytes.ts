/**
 * Byte size formatting — the ONE shared helper (replaces the inline
 * `formatBytes` copies in ModelCachePanel / ModelCacheSection /
 * StorageBreakdownBar / ai-model-details-popover).
 *
 * Locale-aware via Intl.NumberFormat + the shell `uiLang` store:
 * `16.66 GB` (en) / `16,66 GB` (it). B–MB → 0 decimals, GB+ → 2 by default.
 */
import { get } from 'svelte/store';
import { uiLang } from '$lib/i18n/store.svelte';
import { uiLocaleTag } from '$lib/i18n/date-format';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

const _fmtCache = new Map<string, Intl.NumberFormat>();

function formatter(decimals: number): Intl.NumberFormat {
  const key = `${uiLocaleTag(get(uiLang))}:${decimals}`;
  let f = _fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(uiLocaleTag(get(uiLang)), {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
    _fmtCache.set(key, f);
  }
  return f;
}

/** Format a byte count (`null`/`NaN` → `'—'`). */
export function formatBytes(
  bytes: number | null | undefined,
  opts?: { decimals?: number },
): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  let i = 0;
  let v = Math.abs(bytes);
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  const decimals = opts?.decimals ?? (i >= 3 ? 2 : 0);
  return `${formatter(decimals).format(Math.sign(bytes) < 0 ? -v : v)} ${UNITS[i]}`;
}

/** Format a value already expressed in MB. */
export function formatMB(
  mb: number | null | undefined,
  opts?: { decimals?: number },
): string {
  if (mb === null || mb === undefined) return '—';
  return formatBytes(mb * 1024 * 1024, opts);
}
