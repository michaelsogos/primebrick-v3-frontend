<script lang="ts">
  import { t } from '$lib/i18n';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import BadgeValueRow from './BadgeValueRow.svelte';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';

  let { builder }: { builder: ReturnType<typeof useTypeConfigBuilder> } = $props();

  // Local editable rows state (value, label_key, color)
  interface BadgeRow { value: string; label_key: string; color: string; }
  let rows = $state<BadgeRow[]>([]);

  // Sync from builder state
  $effect(() => {
    const values = builder.values;
    if (values) {
      rows = Object.entries(values).map(([value, cfg]) => ({
        value,
        label_key: cfg.label_key ?? '',
        color: cfg.color ?? '',
      }));
    }
  });

  function addRow() {
    rows = [...rows, { value: '', label_key: '', color: '' }];
  }

  function updateRow(index: number, field: keyof BadgeRow, val: string) {
    rows = rows.map((r, i) => i === index ? { ...r, [field]: val } : r);
    syncToBuilder();
  }

  function removeRow(index: number) {
    rows = rows.filter((_, i) => i !== index);
    syncToBuilder();
  }

  function syncToBuilder() {
    // Clear and re-set all values
    for (const row of rows) {
      if (row.value.trim()) {
        builder.setBadgeValue(row.value.trim(), row.label_key || undefined, row.color || undefined);
      }
    }
    // Remove values that are no longer in rows
    const currentValues = rows.map((r) => r.value.trim()).filter(Boolean);
    const builderValues = Object.keys(builder.values ?? {});
    for (const existing of builderValues) {
      if (!currentValues.includes(existing)) {
        builder.removeBadgeValue(existing);
      }
    }
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <Label>{$t('config.typeConfig.badgeValues')}</Label>
    <Button type="button" variant="outline" size="sm" onclick={addRow} data-testid="tcb-badge-add">
      {$t('config.typeConfig.addValue')}
    </Button>
  </div>
  {#each rows as row, index (index)}
    <BadgeValueRow
      value={row.value}
      labelKey={row.label_key}
      color={row.color}
      onValueChange={(v) => updateRow(index, 'value', v)}
      onLabelKeyChange={(v) => updateRow(index, 'label_key', v)}
      onColorChange={(v) => updateRow(index, 'color', v)}
      onRemove={() => removeRow(index)}
    />
  {/each}
  {#if rows.length === 0}
    <p class="text-xs text-muted-foreground">{$t('config.typeConfig.noBadgeValues')}</p>
  {/if}
</div>
