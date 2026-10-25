<script lang="ts">
  /**
   * FilterPresetToolbar — one mutually-exclusive preset filter control,
   * declared in `meta.table.filter_presets` and rendered in the list toolbar
   * (tandem with the deletion-filter group). Exactly one option is always
   * active — there is no deselect affordance by contract.
   *
   * `display: "button_group"` → segmented icon-only buttons — the toolbar
   * standard: no visible label, meaning carried by the tooltip (`title`)
   * and `aria-pressed` state. Options without `icon` are a meta bug; the
   * label is rendered as graceful fallback so the button is never empty.
   * `display: "combobox"` → combo-select (icon + label + tooltip as the
   * item's secondary line).
   */
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils.js';
  import { Button } from '@primebrick/ui';
  import { ButtonGroup } from '@primebrick/ui';
  import { ComboSelect } from '@primebrick/ui';
  import { DynamicIcon } from '@primebrick/ui';
  import type { FilterPreset } from '$lib/entity-list';

  let {
    preset,
    selected,
    onSelect
  }: {
    preset: FilterPreset;
    /** Active option id — resolved by the list engine (never empty). */
    selected: string;
    onSelect: (optionId: string) => void;
  } = $props();

  const groupLabel = $derived(preset.label_key ? $t(preset.label_key) : preset.id);
  // secondaryField renders raw text — pre-resolve tooltip_key to the
  // translated description shown on the detailed option row.
  const comboOptions = $derived(
    preset.options.map((o) => ({
      ...o,
      _tip: o.tooltip_key ? $t(o.tooltip_key) : ''
    }))
  );
</script>

{#if preset.display === 'combobox'}
  <ComboSelect
    mode="single"
    variant="toolbar"
    searchable={false}
    options={comboOptions}
    valueField="id"
    labelField="label_key"
    isLabelTranslated={true}
    display="detailed"
    iconField="icon"
    secondaryField="_tip"
    placeholder={groupLabel}
    value={selected}
    onChange={(v) => {
      // Single-select contract — one option is always active.
      if (typeof v === 'string' && v) onSelect(v);
    }}
    aria-label={groupLabel}
  />
{:else}
  <ButtonGroup segmented aria-label={groupLabel}>
    {#each preset.options as option (option.id)}
      {@const active = selected === option.id}
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        class={cn(active && 'bg-foreground/10 text-foreground shadow-xs')}
        aria-pressed={active}
        aria-label={$t(option.label_key)}
        title={option.tooltip_key ? $t(option.tooltip_key) : $t(option.label_key)}
        onclick={() => onSelect(option.id)}
      >
        {#if option.icon}
          <DynamicIcon name={option.icon} class="size-4" />
        {:else}
          <span>{$t(option.label_key)}</span>
        {/if}
      </Button>
    {/each}
  </ButtonGroup>
{/if}
