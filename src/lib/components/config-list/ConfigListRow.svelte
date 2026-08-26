<script lang="ts">
  import { t } from '$lib/i18n';
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
</script>

<div
  class="grid grid-cols-12 items-center rounded-lg border border-primary-gradient p-3 gap-4"
  data-testid={`config-row-${entry.key}`}
>
  <!-- Left (4/12): checkbox (non-reserved only) + title + description -->
  <div class="col-span-4 flex items-start gap-3 min-w-0">
    {#if !entry.reserved}
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onToggleSelect(entry, checked)}
        class="mt-1"
        data-testid={`config-row-select-${entry.key}`}
      />
    {/if}
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
