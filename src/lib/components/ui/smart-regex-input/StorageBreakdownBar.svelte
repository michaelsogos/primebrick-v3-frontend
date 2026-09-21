<script lang="ts">
  /**
   * StorageBreakdownBar — stacked horizontal bar that attributes every byte
   * reported by navigator.storage.estimate() to exactly one segment:
   *
   *   [ cataloged models | orphaned models | other cache | other browser data | free ]
   *
   * The math is honest by construction: segment widths are proportional to
   * `quota`, and `other_storage_bytes` is computed as usage minus everything
   * the Cache API scan could measure (IndexedDB, service workers, etc.).
   *
   * Used by ModelCacheSection (settings page) and ModelCachePanel (popover).
   */
  import { t } from '$lib/i18n';

  let {
    usage,
    quota,
    cataloged_bytes,
    orphaned_bytes,
    other_cache_bytes,
    other_storage_bytes,
    compact = false,
  }: {
    usage: number;
    quota: number;
    cataloged_bytes: number;
    orphaned_bytes: number;
    other_cache_bytes: number;
    other_storage_bytes: number;
    /** Compact = thinner bar + smaller legend text (popover variant). */
    compact?: boolean;
  } = $props();

  function formatBytes(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  const segments = $derived(
    [
      { key: 'cataloged', label: $t('app.smart.regex.ai.cache.seg_cataloged'), bytes: cataloged_bytes, color: '#38bdf8' },
      { key: 'orphaned', label: $t('app.smart.regex.ai.cache.seg_orphaned'), bytes: orphaned_bytes, color: '#f59e0b' },
      { key: 'other_cache', label: $t('app.smart.regex.ai.cache.seg_other_cache'), bytes: other_cache_bytes, color: '#a78bfa' },
      { key: 'other_storage', label: $t('app.smart.regex.ai.cache.seg_other_storage'), bytes: other_storage_bytes, color: '#a1a1aa' },
    ].filter((s) => s.bytes > 0),
  );

  const usedPct = $derived(quota > 0 ? Math.min(100, (usage / quota) * 100) : 0);
</script>

<div class="space-y-1">
  <div class="flex justify-between {compact ? 'text-[9px]' : 'text-xs'} text-muted-foreground">
    <span>{$t('app.smart.regex.ai.cache.storage_used', { used: formatBytes(usage), quota: formatBytes(quota) })}</span>
    <span>{usedPct.toFixed(0)}%</span>
  </div>
  <div
    class="{compact ? 'h-1' : 'h-1.5'} w-full rounded-full bg-muted overflow-hidden flex"
    data-testid="storage-breakdown-bar"
  >
    {#each segments as seg (seg.key)}
      {@const w = Math.max(0, Math.min(100, (seg.bytes / quota) * 100))}
      <div
        class="h-full transition-all"
        style="width: {w}%; background-color: {seg.color};"
        title="{seg.label}: {formatBytes(seg.bytes)}"
      ></div>
    {/each}
  </div>
  {#if segments.length > 0}
    <div class="flex flex-wrap gap-x-3 gap-y-0.5 {compact ? 'text-[9px]' : 'text-[10px]'} text-muted-foreground">
      {#each segments as seg (seg.key)}
        <span class="inline-flex items-center gap-1">
          <span class="inline-block size-2 rounded-full" style="background-color: {seg.color};"></span>
          {seg.label} · {formatBytes(seg.bytes)}
        </span>
      {/each}
    </div>
  {/if}
</div>
