<script lang="ts">
  /**
   * DictRow — one row of the dict archetype, the ConfigListRow anatomy:
   *
   *   left 6/12:  checkbox + 3-line identity
   *     L1: icon | display_name | tooltip-icon | TAGS — the dict `code` is
   *         a tag (never a field: keys are immutable after creation);
   *         version is NOT a tag.
   *     L2: description — convention-derived `<label_key>.description`,
   *         or an explicit `description[_key]` column; hidden otherwise.
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
    entities_ns,
    pending_owner,
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
    /** meta.entities_ns — forwarded to the version-history sheet. */
    entities_ns?: string;
    /** Pending-queue owner — translations queued here flush with THIS page's save. */
    pending_owner: string;
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

  /** L1 icon — rendered ONLY when the entity maps an `icon` column and the
   *  row carries a value; absent column/value → no icon (no default). */
  const rowIcon = $derived(
    columns_map?.has('icon') && row['icon'] ? String(row['icon']) : '',
  );

  /** The row's i18n stem — the VALUE column's live value (`label_key` on
   *  keyed dicts). Derived desc/tooltip keys are suffixes on this stem —
   *  the seeded composition convention (`…rows.<code>.description`,
   *  same as `entities.ai_model.qwen3_4b.description`). */
  const labelStem = $derived(String(values[display_field ?? 'label_key'] ?? ''));

  /** L2 desc — an explicit `description_key`/`description` column wins
   *  (non-keyed dicts, name_local family); else the derived
   *  `<stem>.description` key, rendered only when it resolves
   *  (missing translation → absent line, no invented content). */
  const desc = $derived.by(() => {
    if (columns_map?.has('description_key')) {
      const k = String(row['description_key'] ?? '').trim();
      if (!k) return '';
      const v = $t(k);
      return v === k ? '' : v;
    }
    if (columns_map?.has('description')) {
      return String(row['description'] ?? '').trim();
    }
    if (!labelStem) return '';
    const k = `${labelStem}.description`;
    const v = $t(k);
    return v === k ? '' : v;
  });

  /** L1 tooltip icon — explicit `tooltip_key`/`tooltip` column wins; else
   *  the derived `<stem>.tooltip` key; absent → no icon, no fallback to
   *  the desc text (that text already owns LINE 2). */
  const tooltip = $derived.by(() => {
    if (columns_map?.has('tooltip_key')) {
      const k = String(row['tooltip_key'] ?? '').trim();
      if (!k) return '';
      const v = $t(k);
      return v === k ? '' : v;
    }
    if (columns_map?.has('tooltip')) {
      return String(row['tooltip'] ?? '').trim();
    }
    if (!labelStem) return '';
    const k = `${labelStem}.tooltip`;
    const v = $t(k);
    return v === k ? '' : v;
  });

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
    openSheet('entity.versionHistory', { entity, entities_ns, rowUuid: row_uid });
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
        {#if rowIcon}
          <DynamicIcon name={rowIcon} class="size-4 shrink-0 text-muted-foreground" />
        {/if}
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
          <Badge variant="destructive" class="shrink-0 text-xs">{$t('app.common.deleted_record')}</Badge>
        {/if}
      </div>
      <!-- L2: desc — hidden when the meta carries no desc column -->
      {#if desc}
        <p class="text-sm text-muted-foreground">{desc}</p>
      {/if}
      <!-- L3: version badge | audit sentence — same anatomy as
           ConfigListRow: primary connectors, italic muted values, who
           only ever rides with when. -->
      {#if version || updatedAt}
        <div class="mt-0.5 flex items-center gap-2">
          {#if version}
            <button
              type="button"
              onclick={openVersionHistory}
              class="inline-flex"
              title={$t('system.entities.version_history.title')}
            >
              <Badge class="cursor-pointer border border-primary text-xs font-semibold hover:bg-primary/10" variant="outline">
                v{version}
              </Badge>
            </button>
          {/if}
          {#if updatedAt && updatedByName}
            <div class="flex items-center gap-x-2 whitespace-nowrap text-xs">
              <span class="text-primary">{$t('app.common.last_updated_prefix')}</span>
              <span class="italic text-muted-foreground">{updatedAt}</span>
              <span class="text-primary">{$t('app.common.last_updated_by_mid')}</span>
              <span class="italic text-muted-foreground">{updatedByName}</span>
            </div>
          {:else if updatedAt}
            <div class="flex items-center gap-x-2 whitespace-nowrap text-xs">
              <span class="text-primary">{$t('app.common.last_updated_prefix')}</span>
              <span class="italic text-muted-foreground">{updatedAt}</span>
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
            {pending_owner}
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
        title={$t('app.common.move_up')}
        data-testid="dict-row-move-up"
      >
        <ChevronUp class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={reorder_last || deleted}
        onclick={onmovedown}
        title={$t('app.common.move_down')}
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
        title={$t('app.common.revert_changes')}
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
