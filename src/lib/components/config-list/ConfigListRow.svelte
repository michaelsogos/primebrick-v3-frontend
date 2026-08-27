<script lang="ts">
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Badge } from '$lib/components/ui/badge';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Undo2 from '@lucide/svelte/icons/undo-2';
  import Info from '@lucide/svelte/icons/info';
  import { Button } from '$lib/components/ui/button';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import type { ConfigEntry } from '$lib/api-types';
  import ConfigValueInput from './ConfigValueInput.svelte';

  let {
    entry,
    selected = false,
    tainted = false,
    value,
    errors = [],
    onChange,
    onRevert,
    onDelete,
    onToggleSelect,
  }: {
    entry: ConfigEntry;
    selected?: boolean;
    tainted?: boolean;
    value: string;
    errors?: string[];
    onChange: (value: string) => void;
    onRevert: () => void;
    onDelete: (entry: ConfigEntry) => void;
    onToggleSelect: (entry: ConfigEntry, selected: boolean) => void;
  } = $props();

  let title = $derived(entry.label_key ? $t(entry.label_key) : entry.key);
  let description = $derived(entry.description_key ? $t(entry.description_key) : '');
  let updatedAt = $derived(entry.updated_at ? formatUiDateTime(entry.updated_at, $uiLang) : '');
  // Same fallback pattern as getAuditableDisplayValue:
  // updated_by_name (from join) → updated_by (raw) → empty
  let updatedByName = $derived(
    entry.updated_by_name && entry.updated_by_name.trim()
      ? entry.updated_by_name
      : entry.updated_by && entry.updated_by.trim()
        ? entry.updated_by
        : ''
  );

  function openVersionHistory() {
    openSheet('entity.versionHistory', { entity: 'config_entries', rowUuid: entry.uuid });
  }
</script>

<div
  class="grid grid-cols-12 items-center rounded-lg border bg-background p-3 gap-4 border-l-[5px] cursor-pointer select-none {tainted ? 'border-l-warning' : selected ? 'border-l-primary' : 'border-l-border'}"
  role="button"
  tabindex="0"
  aria-pressed={selected}
  data-testid={`config-row-${entry.key}`}
  onclick={(e) => {
    // Don't toggle when clicking on interactive elements (inputs, buttons, links, combo)
    // NOTE: the row div itself has role="button" — exclude it from the closest() check
    const target = e.target as HTMLElement;
    const interactive = target.closest('input, button, a, [role="combobox"], [role="listbox"], [role="option"], textarea, select, [data-no-row-toggle]');
    if (interactive && interactive !== e.currentTarget) return;
    onToggleSelect(entry, !selected);
  }}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggleSelect(entry, !selected);
    }
  }}
>
  <!-- Left (6/12): checkbox (disabled if reserved) + title + description -->
  <div class="col-span-6 flex items-start gap-3 min-w-0">
    <Checkbox
      checked={selected}
      onCheckedChange={(checked) => onToggleSelect(entry, checked)}
      class="mt-1"
      data-testid={`config-row-select-${entry.key}`}
    />
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <p class="font-medium truncate">{title}</p>
        {#if entry.reserved}
          <Badge
            variant="outline"
            class="shrink-0 text-xs font-mono border-muted-foreground/30 bg-muted/50 text-muted-foreground"
            title={entry.key}
          >
            {entry.key}
          </Badge>
          <Badge
            variant="outline"
            class="shrink-0 text-xs border-info/40 bg-info/10 text-info"
            title={$t('shell.settings.security.reservedBadge')}
          >
            <Info class="size-3" />
            {$t('shell.settings.security.reservedBadge')}
          </Badge>
        {/if}
      </div>
      {#if description}
        <p class="text-sm text-muted-foreground">{description}</p>
      {/if}
      <!-- Version badge + audit metadata -->
      {#if entry.version}
        <div class="flex items-center gap-2 mt-0.5">
          <button
            type="button"
            onclick={openVersionHistory}
            class="inline-flex"
            title={$t('entities.versionHistory.title')}
            data-testid={`config-row-version-${entry.key}`}
          >
            <Badge class="text-xs font-semibold border border-primary cursor-pointer hover:bg-primary/10" variant="outline">
              v{entry.version}
            </Badge>
          </button>
          {#if updatedAt && updatedByName}
            <div class="flex items-center gap-x-2 whitespace-nowrap text-xs">
              <span class="text-primary">{$t('shell.settings.security.lastUpdatedPrefix')}</span>
              <span class="italic text-muted-foreground">{updatedAt}</span>
              <span class="text-primary">{$t('shell.settings.security.lastUpdatedByMid')}</span>
              <span class="italic text-muted-foreground">{updatedByName}</span>
            </div>
          {:else if updatedAt}
            <div class="flex items-center gap-x-2 whitespace-nowrap text-xs">
              <span class="text-primary">{$t('shell.settings.security.lastUpdatedPrefix')}</span>
              <span class="italic text-muted-foreground">{updatedAt}</span>
            </div>
          {/if}
        </div>
      {:else if updatedAt && updatedByName}
        <div class="flex items-center gap-x-2 whitespace-nowrap text-xs mt-0.5">
          <span class="text-primary">{$t('shell.settings.security.lastUpdatedPrefix')}</span>
          <span class="italic text-muted-foreground">{updatedAt}</span>
          <span class="text-primary">{$t('shell.settings.security.lastUpdatedByMid')}</span>
          <span class="italic text-muted-foreground">{updatedByName}</span>
        </div>
      {:else if updatedAt}
        <div class="flex items-center gap-x-2 whitespace-nowrap text-xs mt-0.5">
          <span class="text-primary">{$t('shell.settings.security.lastUpdatedPrefix')}</span>
          <span class="italic text-muted-foreground">{updatedAt}</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Center (4/12): dynamic input -->
  <div class="col-span-4 flex items-center justify-center">
    <ConfigValueInput {entry} {value} {errors} {onChange} />
  </div>

  <!-- Right (2/12): undo (if tainted) + delete (always, disabled if reserved) -->
  <div class="col-span-2 flex items-center justify-end gap-2">
    {#if tainted}
      <Button
        variant="ghost"
        size="icon"
        onclick={onRevert}
        data-testid={`config-row-revert-${entry.key}`}
        title={$t('common.revertChanges')}
      >
        <Undo2 class="size-4 text-warning" />
      </Button>
    {/if}
    <Button
      variant="ghost"
      size="icon"
      onclick={() => onDelete(entry)}
      disabled={entry.reserved}
      data-testid={`config-row-delete-${entry.key}`}
      title={$t('common.delete')}
    >
      <Trash2 class="size-4 text-destructive" />
    </Button>
  </div>
</div>
