<script lang="ts">
  import { t } from '$lib/i18n';
  import type { ConfigEntry } from '$lib/api-types';
  import ConfigListRow from './ConfigListRow.svelte';
  import ConfigBulkActionBar from './ConfigBulkActionBar.svelte';

  let {
    entries,
    loading = false,
    error = null,
    onSave,
    onDelete,
    onBulkDelete,
  }: {
    entries: ConfigEntry[];
    loading?: boolean;
    error?: string | null;
    onSave: (entry: ConfigEntry, value: string) => Promise<void>;
    onDelete: (entry: ConfigEntry) => void;
    onBulkDelete: (entries: ConfigEntry[]) => void;
  } = $props();

  // Selection state — only non-reserved rows can be selected
  let selectedUuids = $state<Set<string>>(new Set());

  let selectedEntries = $derived(
    entries.filter((e) => selectedUuids.has(e.uuid)),
  );

  function handleToggleSelect(entry: ConfigEntry, checked: boolean) {
    const next = new Set(selectedUuids);
    if (checked) {
      next.add(entry.uuid);
    } else {
      next.delete(entry.uuid);
    }
    selectedUuids = next;
  }

  function handleBulkDelete() {
    onBulkDelete(selectedEntries);
    selectedUuids = new Set();
  }

  function clearSelection() {
    selectedUuids = new Set();
  }

  // Clear selection when entries change (e.g. after delete)
  // svelte-ignore state_referenced_locally -- local mutable state initialized from a prop, then reassigned on change.
  let lastEntryCount = $state(entries.length);
  $effect(() => {
    if (entries.length !== lastEntryCount) {
      // Remove stale selections (deleted entries)
      const validUuids = new Set(entries.map((e) => e.uuid));
      selectedUuids = new Set([...selectedUuids].filter((uuid) => validUuids.has(uuid)));
      lastEntryCount = entries.length;
    }
  });

  // Entries with null/empty/whitespace group_key → ungrouped (rendered first, no header)
  let ungroupedEntries = $derived(
    entries.filter((e) => !e.group_key || e.group_key.trim() === ''),
  );

  // Entries with a group_key → grouped, preserving DAL sort order (group_key ASC, key ASC)
  let groupedEntries = $derived(
    entries.filter((e) => e.group_key && e.group_key.trim() !== ''),
  );

  // Build ordered list of unique group keys (preserving sort order from DAL)
  let groupKeys = $derived.by<string[]>(() => {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const e of groupedEntries) {
      const gk = e.group_key!;
      if (!seen.has(gk)) {
        seen.add(gk);
        keys.push(gk);
      }
    }
    return keys;
  });

  // Map group_key → entries (preserving sort order)
  let entriesByGroup = $derived.by<Map<string, ConfigEntry[]>>(() => {
    const map = new Map<string, ConfigEntry[]>();
    for (const e of groupedEntries) {
      const gk = e.group_key!;
      if (!map.has(gk)) map.set(gk, []);
      map.get(gk)!.push(e);
    }
    return map;
  });
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
    <p class="text-sm">{$t('common.loading')}</p>
  </div>
{:else if error}
  <div class="flex flex-col items-center justify-center py-8 text-center text-destructive">
    <p class="text-sm">{error}</p>
  </div>
{:else if entries.length === 0}
  <div class="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
    <p class="text-sm">{$t('shell.settings.security.noEntries')}</p>
  </div>
{:else}
  <ConfigBulkActionBar
    selectedCount={selectedEntries.length}
    onBulkDelete={handleBulkDelete}
  />

  <div class="space-y-3">
    {#each ungroupedEntries as entry (entry.uuid)}
      <ConfigListRow
        {entry}
        selected={selectedUuids.has(entry.uuid)}
        onSave={(value) => onSave(entry, value)}
        {onDelete}
        onToggleSelect={handleToggleSelect}
      />
    {/each}
  </div>

  {#each groupKeys as groupKey (groupKey)}
    <div class="pt-4 first:pt-0">
      <h3 class="self-start text-xs font-semibold uppercase tracking-wide bg-linear-to-br from-sky-400 to-indigo-400 text-white px-3 pt-1 pb-1 rounded-t-md relative z-10 w-fit ml-3">
        {$t(`config.auth.group.${groupKey}`)}
      </h3>
      <div class="border-primary-gradient rounded-lg px-3 pt-3 pb-3 space-y-3">
        {#each entriesByGroup.get(groupKey) ?? [] as entry (entry.uuid)}
          <ConfigListRow
            {entry}
            selected={selectedUuids.has(entry.uuid)}
            onSave={(value) => onSave(entry, value)}
            {onDelete}
            onToggleSelect={handleToggleSelect}
          />
        {/each}
      </div>
    </div>
  {/each}
{/if}
