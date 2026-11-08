<script lang="ts">
  /**
   * DictRow — one row of the dict archetype, the ConfigListRow anatomy:
   *
   *   left 6/12:  checkbox + 3-line identity
   *     L1: icon | display_name | tooltip-icon | TAGS — the dict `code` is
   *         a tag (never a field: keys are immutable after creation);
   *         version is NOT a tag.
   *     L2: description — rendered only when the meta carries a desc
   *         column (`description`/`description_key`), hidden otherwise.
   *     L3: version badge | last update | who — the audit line.
   *   center 4/12: the VALUE field — for dict entities `label_key`
   *     (TranslationKeyCell); the only editable input in the row.
   *   right 2/12: reorder chevrons → taint-undo → the single item CTA —
   *     delete (trash) or restore when deleted. The page itself is the
   *     editor, so no edit/preview/version-history entries; when a dict
   *     entity ever gains >1 item CTA, escalate to the actions menu.
   */
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Badge, Button, Checkbox, DynamicIcon, SelectableRow } from '@primebrick/ui';
  import FormFieldDispatcher from '$lib/entity-form/FormFieldDispatcher.svelte';
  import TranslationKeyCell from './TranslationKeyCell.svelte';
  import type { MetaColumn } from '@primebrick/ui';
  import {
    ChevronUp,
    ChevronDown,
    Info,
    RotateCcw,
    Trash2,
    Undo2,
  } from '@primebrick/ui/vendor/lucide';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';

  let {
    row,
    uid,
    entity,
    title_text,
    translation_key,
    display_field,
    editable_columns,
    columns_map,
    values,
    errors = {},
    tainted = false,
    selected = false,
    deleted = false,
    can_update = true,
    can_delete = false,
    can_restore = false,
    orderable = false,
    reorder_first = false,
    reorder_last = false,
    onchange,
    onrevert,
    ontoggle,
    ondelete,
    onrestore,
    onmoveup,
    onmovedown,
  }: {
    row: Record<string, unknown>;
    uid: string;
    entity: string;
    title_text: string;
    /** meta.translation_key — the label cell's rows vocabulary scope. */
    translation_key: string;
    /** meta.display_field — the row's VALUE column (label_key on dicts). */
    display_field?: string;
    editable_columns: MetaColumn[];
    columns_map?: ReadonlyMap<string, MetaColumn>;
    values: Record<string, unknown>;
    errors?: Record<string, string[]>;
    tainted?: boolean;
    selected?: boolean;
    deleted?: boolean;
    can_update?: boolean;
    can_delete?: boolean;
    can_restore?: boolean;
    orderable?: boolean;
    reorder_first?: boolean;
    reorder_last?: boolean;
    onchange: (key: string, value: unknown) => void;
    onrevert?: () => void;
    ontoggle?: (checked: boolean) => void;
    ondelete?: () => void;
    onrestore?: () => void;
    onmoveup?: () => void;
    onmovedown?: () => void;
  } = $props();

  const row_uid = $derived(String(row[uid] ?? ''));

  /** The VALUE column — display_field when it is editable, else label_key. */
  const valueColumn = $derived(
    editable_columns.find((c) => c.key === display_field) ??
      editable_columns.find((c) => c.key === 'label_key'),
  );

  /** L1 icon — a per-row `icon` column wins, else the dict-tag default. */
  const rowIcon = $derived(
    columns_map?.has('icon') && row['icon'] ? String(row['icon']) : 'tag',
  );

  /** L2 desc — only when the meta declares a desc column (hidden otherwise). */
  const descKey = $derived(
    columns_map?.has('description')
      ? 'description'
      : columns_map?.has('description_key')
        ? 'description_key'
        : undefined,
  );
  const desc = $derived.by(() => {
    if (!descKey) return '';
    const v = row[descKey];
    if (v === null || v === undefined || String(v).trim() === '') return '';
    const s = String(v);
    return descKey.endsWith('_key') ? $t(s) : s;
  });

  /** L1 tooltip — desc when present, else the raw label_key behind the
   *  translated display name. */
  const tooltip = $derived(desc || String(values[display_field ?? 'label_key'] ?? ''));

  const version = $derived(row['version'] as number | undefined);
  const updatedAt = $derived(
    row['updated_at'] ? formatUiDateTime(String(row['updated_at']), $uiLang) : '',
  );
  // Same fallback pattern as ConfigListRow: updated_by_name (join) → raw.
  const updatedByName = $derived(
    row['updated_by_name'] && String(row['updated_by_name']).trim()
      ? String(row['updated_by_name'])
      : row['updated_by'] && String(row['updated_by']).trim()
        ? String(row['updated_by'])
        : '',
  );

  function openVersionHistory() {
    openSheet('entity.versionHistory', { entity, rowUuid: row_uid });
  }
</script>

<SelectableRow
  id={row_uid}
  {selected}
  warning={tainted}
  on_toggle_select={(_id, checked) => ontoggle?.(checked)}
  class="grid grid-cols-12 items-center gap-4"
>
  <!-- Left 6/12: checkbox + 3-line identity -->
  <div class="col-span-6 flex items-start gap-3 min-w-0">
    <Checkbox
      checked={selected}
      onCheckedChange={(c) => ontoggle?.(c === true)}
      class="mt-1"
      aria-label={$t('system.entities.list.keys.select')}
    />
    <div class="min-w-0">
      <!-- L1: icon | display_name | tooltip-icon | TAGS -->
      <div class="flex items-center gap-2">
        <DynamicIcon name={rowIcon} class="size-4 shrink-0 text-muted-foreground" />
        <p class="truncate font-medium {deleted ? 'line-through opacity-60' : ''}">{title_text}</p>
        {#if tooltip}
          <Info class="size-3.5 shrink-0 text-muted-foreground" title={tooltip} />
        {/if}
        <Badge
          variant="outline"
          class="shrink-0 border-muted-foreground/30 bg-muted/50 font-mono text-xs text-muted-foreground"
          title={String(row['code'] ?? '')}
        >
          {row['code']}
        </Badge>
        {#if deleted}
          <Badge variant="destructive" class="shrink-0 text-xs">{$t('app.common.deletedRecord')}</Badge>
        {/if}
      </div>
      <!-- L2: desc — hidden when the meta carries no desc column -->
      {#if desc}
        <p class="text-sm text-muted-foreground">{desc}</p>
      {/if}
      <!-- L3: version badge | last update | who -->
      {#if version || updatedAt || updatedByName}
        <div class="mt-0.5 flex items-center gap-2">
          {#if version}
            <button
              type="button"
              onclick={openVersionHistory}
              class="inline-flex"
              title={$t('system.entities.versionHistory.title')}
            >
              <Badge class="cursor-pointer border border-primary text-xs font-semibold hover:bg-primary/10" variant="outline">
                v{version}
              </Badge>
            </button>
          {/if}
          {#if updatedAt}
            <div class="flex items-center gap-x-2 whitespace-nowrap text-xs">
              <span class="text-muted-foreground">{$t('system.common.fields.updated_at')}</span>
              <span class="italic text-muted-foreground">{updatedAt}</span>
            </div>
          {/if}
          {#if updatedByName}
            <div class="flex items-center gap-x-2 whitespace-nowrap text-xs">
              <span class="text-muted-foreground">{$t('system.common.fields.updated_by')}</span>
              <span class="italic text-muted-foreground">{updatedByName}</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Center 4/12: the VALUE field -->
  <div class="col-span-4 flex items-center justify-center" data-dict-cell={valueColumn?.key}>
    {#if valueColumn}
      <div class="w-full min-w-0">
        {#if valueColumn.key === 'label_key'}
          <TranslationKeyCell
            column={valueColumn}
            value={String(values[valueColumn.key] ?? '')}
            record={values}
            {translation_key}
            readonly={!can_update || deleted}
            onchange={(v) => onchange(valueColumn.key, v)}
          />
        {:else}
          <FormFieldDispatcher
            column={valueColumn}
            bind:value={() => values[valueColumn.key], (v) => onchange(valueColumn.key, v)}
            record={values}
            columns={columns_map}
            readonly={!can_update || deleted}
          />
        {/if}
        {#if valueColumn && errors[valueColumn.key]?.length}
          <p class="mt-1 text-xs text-destructive">{errors[valueColumn.key][0]}</p>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Right 2/12: chevrons → taint-undo → single item CTA -->
  <div class="col-span-2 flex items-center justify-end gap-1">
    {#if orderable}
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={reorder_first || deleted}
        onclick={onmoveup}
        title={$t('system.entities.list.keys.moveUp')}
        data-testid="dict-row-move-up"
      >
        <ChevronUp class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={reorder_last || deleted}
        onclick={onmovedown}
        title={$t('system.entities.list.keys.moveDown')}
        data-testid="dict-row-move-down"
      >
        <ChevronDown class="size-4" />
      </Button>
    {/if}
    {#if tainted && onrevert}
      <Button
        variant="ghost"
        size="icon-sm"
        onclick={onrevert}
        title={$t('app.common.revertChanges')}
        data-testid="dict-row-revert"
      >
        <Undo2 class="size-4 text-warning" />
      </Button>
    {/if}
    {#if deleted}
      {#if can_restore}
        <Button
          variant="ghost"
          size="icon-sm"
          onclick={onrestore}
          title={$t('app.common.restore')}
          data-testid="dict-row-restore"
        >
          <RotateCcw class="size-4" />
        </Button>
      {/if}
    {:else if can_delete}
      <Button
        variant="ghost"
        size="icon-sm"
        onclick={ondelete}
        title={$t('app.common.delete')}
        data-testid="dict-row-delete"
      >
        <Trash2 class="size-4 text-destructive" />
      </Button>
    {/if}
  </div>
</SelectableRow>
