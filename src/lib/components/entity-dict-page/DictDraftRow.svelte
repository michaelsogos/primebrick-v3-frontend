<script lang="ts">
  /**
   * DictDraftRow — the add-row surface, SAME anatomy as DictRow:
   *
   *   left 6/12:  `New` badge + icon + the `code` input living in the TAG
   *               zone — the key is authored here (it becomes the row's
   *               tag once saved and is immutable from then on).
   *   center 4/12: the VALUE field (display_field → label_key cell).
   *   right 2/12: reserved — drafts carry no item CTAs today.
   *
   * No version/audit lines — the row is not persisted yet.
   */
  import { t } from '$lib/i18n';
  import { Badge } from '@primebrick/ui';
  import FormFieldDispatcher from '$lib/entity-form/FormFieldDispatcher.svelte';
  import TranslationKeyCell from './TranslationKeyCell.svelte';
  import type { MetaColumn } from '@primebrick/ui';

  let {
    display_field,
    editable_columns,
    columns_map,
    translation_key,
    values = $bindable(),
    errors = {},
    readonly = false,
  }: {
    /** meta.display_field — the row's VALUE column (label_key on dicts). */
    display_field?: string;
    editable_columns: MetaColumn[];
    columns_map?: ReadonlyMap<string, MetaColumn>;
    /** meta.translation_key — the label cell's rows vocabulary scope. */
    translation_key: string;
    values: Record<string, unknown>;
    /** Required-empty (and future rule) errors keyed by column — the
     *  save gate surfaces here, never silently. */
    errors?: Record<string, string[]>;
    readonly?: boolean;
  } = $props();

  const codeColumn = $derived(editable_columns.find((c) => c.key === 'code'));
  const valueColumn = $derived(
    editable_columns.find((c) => c.key === display_field) ??
      editable_columns.find((c) => c.key === 'label_key'),
  );
</script>

<div
  class="grid grid-cols-12 items-center gap-4 rounded-lg border bg-background p-3 border-l-[5px] border-l-primary/50"
  data-testid="dict-draft-row"
>
  <!-- Left 6/12: New badge + code input in the tag zone -->
  <div class="col-span-6 flex items-start gap-3 min-w-0">
    <div class="mt-1 size-4 shrink-0" aria-hidden="true"></div>
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="shrink-0 border-primary/40 bg-primary/10 text-xs">
          {$t('app.common.new')}
        </Badge>
        {#if codeColumn}
          <div class="w-48 min-w-0" data-dict-cell="code">
            <FormFieldDispatcher
              column={codeColumn}
              bind:value={() => values['code'], (v) => { values['code'] = v; }}
              record={values}
              columns={columns_map}
              {readonly}
            />
            {#if errors['code']?.length}
              <p class="mt-1 text-xs text-destructive">{errors['code'][0]}</p>
            {/if}
          </div>
        {/if}
      </div>
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
            {readonly}
            onchange={(v) => { values[valueColumn.key] = v; }}
          />
        {:else}
          <FormFieldDispatcher
            column={valueColumn}
            bind:value={() => values[valueColumn.key], (v) => { values[valueColumn.key] = v; }}
            record={values}
            columns={columns_map}
            {readonly}
          />
        {/if}
        {#if errors[valueColumn.key]?.length}
          <p class="mt-1 text-xs text-destructive">{errors[valueColumn.key][0]}</p>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Right 2/12: reserved — no item CTAs on drafts -->
  <div class="col-span-2"></div>
</div>
