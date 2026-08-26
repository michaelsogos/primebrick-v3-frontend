<script lang="ts">
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Badge } from '$lib/components/ui/badge';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Info from '@lucide/svelte/icons/info';
  import { Button } from '$lib/components/ui/button';
  import type { ConfigEntry } from '$lib/api-types';
  import ConfigValueInput from './ConfigValueInput.svelte';

  let {
    entry,
    selected = false,
    onSave,
    onDelete,
    onToggleSelect,
  }: {
    entry: ConfigEntry;
    selected?: boolean;
    onSave: (value: string) => Promise<void>;
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
</script>

<div
  class="grid grid-cols-12 items-center rounded-lg border bg-background p-3 gap-4"
  data-testid={`config-row-${entry.key}`}
>
  <!-- Left (4/12): checkbox (disabled if reserved) + title + description -->
  <div class="col-span-4 flex items-start gap-3 min-w-0">
    <Checkbox
      checked={selected}
      disabled={entry.reserved}
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
      {#if updatedAt && updatedByName}
        <p class="text-xs text-muted-foreground/60 mt-0.5">
          <span>{$t('shell.settings.security.lastUpdatedPrefix')}</span>
          <span class="font-medium text-muted-foreground/70">{updatedAt}</span>
          <span>{$t('shell.settings.security.lastUpdatedByMid')}</span>
          <span class="font-medium text-muted-foreground/70">{updatedByName}</span>
        </p>
      {:else if updatedAt}
        <p class="text-xs text-muted-foreground/60 mt-0.5">
          <span>{$t('shell.settings.security.lastUpdatedPrefix')}</span>
          <span class="font-medium text-muted-foreground/70">{updatedAt}</span>
        </p>
      {/if}
    </div>
  </div>

  <!-- Center (4/12): dynamic input -->
  <div class="col-span-4 flex items-center justify-center">
    <ConfigValueInput {entry} {onSave} />
  </div>

  <!-- Right (4/12): delete CTA (non-reserved only) -->
  <div class="col-span-4 flex items-center justify-end gap-2">
    {#if !entry.reserved}
      <Button
        variant="ghost"
        size="icon"
        onclick={() => onDelete(entry)}
        data-testid={`config-row-delete-${entry.key}`}
        title={$t('common.delete')}
      >
        <Trash2 class="size-4 text-destructive" />
      </Button>
    {/if}
  </div>
</div>
