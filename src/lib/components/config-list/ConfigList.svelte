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
    {#each entries as entry (entry.uuid)}
      <ConfigListRow
        {entry}
        selected={selectedUuids.has(entry.uuid)}
        onSave={(value) => onSave(entry, value)}
        {onDelete}
        onToggleSelect={handleToggleSelect}
      />
    {/each}
  </div>
{/if}
