<script lang="ts">
  /**
   * BadgeValuePanel — right-sheet form for badge values (add & edit).
   *
   * Anatomy — fields stack full-width so labels/errors have room:
   *   CODICE
   *   COLOR (picker popover)
   *   ETICHETTA (i18n key combobox)
   *   live badge preview
   *
   * Add mode:  CTA = full-width primary button in the panel FOOT (standard
   *            panel pattern) — appends the value and resets the draft
   *            (the sheet stays open so multiple values can be added fast).
   * Edit mode: CTA = Trash — deletes the value and closes the sheet.
   *            Color/label edits commit live to the builder; a code rename
   *            commits on blur/Enter (the map key can't be renamed per
   *            keystroke).
   */
  import { t, dict } from '$lib/i18n';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import { Button } from '$lib/components/ui/button';
  import { TextInput } from '$lib/components/ui/input';
  import { PrimeField } from '$lib/components/ui/form';
  import ComboSelect from '$lib/components/ui/combo-select/combo-select.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import * as Popover from '$lib/components/ui/popover';
  import * as ColorPicker from '$lib/components/ui/color-picker';
  import { badgeClassesFromToken } from '$lib/colors/badge';
  import Eraser from '@lucide/svelte/icons/eraser';
  import Ban from '@lucide/svelte/icons/ban';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Plus from '@lucide/svelte/icons/plus';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';

  let {
    mode,
    value_key,
    config_key,
    builder,
  }: {
    mode: 'add' | 'edit';
    value_key: string | null;
    config_key: string;
    builder: ReturnType<typeof useTypeConfigBuilder>;
  } = $props();

  // The draft is intentionally a one-time snapshot of the incoming props —
  // the panel remounts on each open (keepMountedState defaults false), so
  // capturing the initial value here is correct, not a stale-read bug.
  // svelte-ignore state_referenced_locally
  let draftCode = $state(value_key ?? '');
  /** Color the panel was opened with — the eraser resets the draft to it.
   *  undefined = "no color selected" (the trigger shows a Ban icon). */
  // svelte-ignore state_referenced_locally
  const initialColor =
    (value_key ? builder.values?.[value_key]?.color : undefined) || undefined;
  // svelte-ignore state_referenced_locally
  let draftColor = $state<string | undefined>(initialColor);
  // svelte-ignore state_referenced_locally
  let draftLabelKey = $state(value_key ? (builder.values?.[value_key]?.label_key ?? '') : '');
  /** Original map key while editing — a rename removes the old key. */
  // svelte-ignore state_referenced_locally
  let editingKey = $state<string | null>(value_key);
  /** Color picker popover open state — closed when a system swatch is picked. */
  let colorPopoverOpen = $state(false);

  const allI18nKeys = $derived(Object.keys($dict as Record<string, string>));
  const labelKeyOptions = $derived(
    allI18nKeys
      .filter((k) => k.startsWith('system.settings.config.auth.'))
      .map((k) => ({ key: k })),
  );

  function labelKeySearchFor(rowValue: string) {
    const key = config_key.trim() || 'my_custom_setting';
    const suffix = rowValue.trim() ? `badge.${rowValue.trim()}` : 'badge.';
    return `system.settings.config.auth.${key}.${suffix}`;
  }

  /** Suggested label key shown as placeholder — also the committed value
   *  when the field is left empty (per badgeLabelKeyHelp: "a suggested key
   *  is pre-filled"). Only defined once a valid code exists. */
  const suggestedLabelKey = $derived(
    draftCode.trim() ? labelKeySearchFor(draftCode) : undefined,
  );

  /** Badge value codes across the codebase are TOKEN_SNAKE segments:
   *  letters/digits joined by single underscores (ACTIVE, NOT_COMPATIBLE,
   *  alpha_numeric, okta, "1", "true"). Case is uniform — all-lower OR
   *  all-upper, never mixed. */
  const BADGE_CODE_RE = /^([a-z0-9]+(_[a-z0-9]+)*|[A-Z0-9]+(_[A-Z0-9]+)*)$/;

  /** Input mask: space/hyphen become the underscore separator, anything
   *  outside [A-Za-z0-9_] is dropped, runs of "_" collapse to one. */
  function maskBadgeCode(raw: string) {
    return raw
      .replace(/[\s\-+.]+/g, '_')
      .replace(/[^A-Za-z0-9_]/g, '')
      .replace(/_{2,}/g, '_');
  }

  function onCodeInput(e: Event & { currentTarget: HTMLInputElement }) {
    const masked = maskBadgeCode(e.currentTarget.value);
    if (masked !== e.currentTarget.value) e.currentTarget.value = masked;
    draftCode = masked;
  }

  const draftCodeError = $derived.by(() => {
    const v = draftCode.trim();
    if (!v) return undefined;
    if (!BADGE_CODE_RE.test(v))
      return $t('system.settings.config.typeConfig.badgeCodeInvalid');
    if (builder.values?.[v] && v !== editingKey)
      return $t('system.settings.config.typeConfig.badgeCodeDuplicate');
    return undefined;
  });

  function addRow() {
    const v = draftCode.trim();
    if (!v || draftCodeError) return;
    builder.setBadgeValue(v, draftLabelKey.trim() || suggestedLabelKey, draftColor || undefined);
    closeSheet();
  }

  function commitEdit(
    color: string | undefined = draftColor,
    labelKey: string = draftLabelKey,
  ) {
    if (editingKey === null) return;
    const v = draftCode.trim();
    if (!v || draftCodeError) return;
    const cur = builder.values?.[v];
    // Empty field commits the suggested key (badgeLabelKeyHelp: "a suggested
    // key is pre-filled") — the label is never left unset.
    const lk = labelKey.trim() || suggestedLabelKey;
    const c = color || undefined;
    // Skip no-op writes: the commit effect reads draftCodeError which
    // depends on builder.values — writing identical values would retrigger
    // the effect forever (effect_update_depth_exceeded).
    if (v === editingKey && cur?.label_key === lk && cur?.color === c) return;
    builder.setBadgeValue(v, lk, c);
    if (v !== editingKey) {
      builder.removeBadgeValue(editingKey);
      editingKey = v;
    }
  }

  // Explicit commit in edit mode — multi-field forms write only on the
  // footer CTA (standard form-panel behavior, no live commits).
  function saveEdit() {
    commitEdit(draftColor, draftLabelKey);
    closeSheet();
  }

  function previewText(row: { value: string; label_key: string }) {
    if (row.label_key.trim()) {
      const translated = $t(row.label_key.trim());
      if (translated !== row.label_key.trim()) return translated;
    }
    return row.value;
  }
</script>

<SheetPanelLayout contentClass="p-4" footer={mode === 'add' ? addFooter : saveFooter}>
  {#snippet icon()}
    {#if mode === 'add'}
      <Plus class="size-4" />
    {:else}
      <Pencil class="size-4" />
    {/if}
  {/snippet}
  {#snippet title()}
    {$t(mode === 'add'
      ? 'system.settings.config.typeConfig.badgeAddTitle'
      : 'system.settings.config.typeConfig.badgeEditTitle')}
  {/snippet}

  <div class="flex flex-col gap-4">
    <!-- CODICE full width -->
      <PrimeField
        id="tcb-badge-sheet-code"
        label={$t('system.settings.config.typeConfig.badgeCode')}
        help={{ text: $t('system.settings.config.typeConfig.badgeCodeHelp'), priority: 'INFORMATION', title: $t('system.settings.config.typeConfig.badgeCode') }}
        error={draftCodeError}
      >
        {#snippet control({ id })}
          <TextInput
            {id}
            value={draftCode}
            oninput={onCodeInput}
            placeholder="active"
            class="text-xs"
            aria-invalid={draftCodeError ? 'true' : undefined}
            onkeydown={(e) => {
              if (mode === 'edit' && e.key === 'Enter') saveEdit();
            }}
            data-testid="tcb-badge-value"
          />
        {/snippet}
      </PrimeField>

    <!-- COLOR full width -->
    <PrimeField
        id="tcb-badge-sheet-color"
        label={$t('system.settings.config.typeConfig.badgeColor')}
        help={{ text: $t('system.settings.config.typeConfig.badgeColorHelp'), priority: 'INFORMATION', title: $t('system.settings.config.typeConfig.badgeColor') }}
      >
        {#snippet control({ id })}
          <Popover.Root bind:open={colorPopoverOpen}>
            <Popover.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  {id}
                  class="border-primary-gradient bg-background hover:brightness-105 flex h-9 w-full items-center gap-2 rounded-md px-3 text-xs cursor-pointer"
                  data-testid="tcb-badge-color"
                >
                  {#if draftColor}
                    <span
                      class="size-4 rounded-full border shadow-sm shrink-0"
                      style="background-color: {badgeClassesFromToken(draftColor).bgColor};"
                    ></span>
                    <span class="truncate font-mono">{draftColor}</span>
                  {:else}
                    <Ban class="size-4 shrink-0 text-muted-foreground" />
                    <span class="truncate text-muted-foreground/60">—</span>
                  {/if}
                  {#if draftColor !== initialColor}
                    <span
                      role="button"
                      tabindex="-1"
                      class="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      title={$t('app.common.reset')}
                      aria-label={$t('app.common.reset')}
                      onclick={(e) => { e.stopPropagation(); draftColor = initialColor; }}
                      onkeydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation(); e.preventDefault();
                          draftColor = initialColor;
                        }
                      }}
                      data-testid="tcb-badge-color-reset"
                    >
                      <Eraser class="h-3.5 w-3.5" />
                    </span>
                  {/if}
                </button>
              {/snippet}
            </Popover.Trigger>
            <!-- Popover.Content self-portals (ui/popover default) — escapes
                 the sheet's overflow-auto region so it can't shift layout. -->
            <Popover.Content class="z-[130] w-auto p-0">
              <ColorPicker.Root
                bind:value={draftColor}
                onselect={() => (colorPopoverOpen = false)}
              />
            </Popover.Content>
          </Popover.Root>
        {/snippet}
    </PrimeField>

    <!-- ETICHETTA full width -->
    <div class="min-w-0">
        <PrimeField
          id="tcb-badge-sheet-label"
          label={$t('system.settings.config.typeConfig.badgeLabelKey')}
          help={{ text: $t('system.settings.config.typeConfig.badgeLabelKeyHelp'), priority: 'INFORMATION', title: $t('system.settings.config.typeConfig.badgeLabelKey') }}
        >
          {#snippet control({ id })}
            <ComboSelect
              {id}
              mode="single"
              value={draftLabelKey}
              onChange={(v) => {
                draftLabelKey = Array.isArray(v) ? v[0] ?? '' : v;
              }}
              options={labelKeyOptions}
              valueField="key"
              labelField="key"
              isLabelTranslated={true}
              allowCreate={true}
              defaultSearch={labelKeySearchFor(draftCode)}
              placeholder={labelKeySearchFor(draftCode)}
              searchPlaceholder={$t('system.settings.config.typeConfig.badgeLabelKey')}
              display="detailed"
              truncateFrom="start"
              data-testid="tcb-badge-label"
            />
          {/snippet}
        </PrimeField>
    </div>

    <!-- Live preview -->
    {#if draftCode.trim()}
      {@const c = badgeClassesFromToken(draftColor || null)}
      <div class="flex items-center justify-center">
        <Badge
          class="shadow-none max-w-48 truncate-start"
          style="background-color:{c.bgColor};color:{c.textColor};border-color:{c.borderColor};"
        >
          {previewText({ value: draftCode, label_key: draftLabelKey || suggestedLabelKey || '' })}
        </Badge>
      </div>
    {/if}
  </div>

</SheetPanelLayout>

{#snippet addFooter()}
  <div class="p-3">
    <Button
      type="button"
      class="w-full"
      onclick={addRow}
      disabled={!draftCode.trim() || !!draftCodeError}
      data-testid="tcb-badge-add"
    >
      <Plus class="h-4 w-4" />
      {$t('system.settings.config.typeConfig.addValue')}
    </Button>
  </div>
{/snippet}

{#snippet saveFooter()}
  <div class="p-3">
    <Button
      type="button"
      class="w-full"
      onclick={saveEdit}
      disabled={!draftCode.trim() || !!draftCodeError}
      data-testid="tcb-badge-save"
    >
      {$t('app.common.save')}
    </Button>
  </div>
{/snippet}
