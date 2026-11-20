<script lang="ts">
  /**
   * DictDraftRow — the add-row surface, SAME anatomy as DictRow:
   *
   *   left 6/12:  the `code` input living in the TAG
   *               zone — the key is authored here (it becomes the row's
   *               tag once saved and is immutable from then on).
   *   center 4/12: the VALUE field (display_field → label_key cell).
   *   right 2/12: reserved — drafts carry no item CTAs today.
   *
   * No version/audit lines — the row is not persisted yet.
   */
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Check, X } from '@primebrick/ui/vendor/lucide';
  import FormFieldDispatcher from '$lib/entity-form/FormFieldDispatcher.svelte';
  import TranslationKeyCell from './TranslationKeyCell.svelte';
  import DictFieldCell from './DictFieldCell.svelte';
  import type { MetaColumn } from '@primebrick/ui';

  let {
    display_field,
    editable_columns,
    columns_map,
    translation_key,
    pending_owner,
    values = $bindable(),
    errors = {},
    readonly = false,
    sortable = false,
    confirm_disabled = true,
    onconfirm,
    ondiscard,
  }: {
    /** meta.display_field — the row's VALUE column (label_key on dicts). */
    display_field?: string;
    editable_columns: MetaColumn[];
    columns_map?: ReadonlyMap<string, MetaColumn>;
    /** meta.translation_key — the label cell's rows vocabulary scope. */
    translation_key: string;
    /** Pending-queue owner — translations queued here flush with THIS page's save. */
    pending_owner: string;
    values: Record<string, unknown>;
    /** Required-empty (and future rule) errors keyed by column — the
     *  save gate surfaces here, never silently. */
    errors?: Record<string, string[]>;
    readonly?: boolean;
    /** Rows render a leading drag grip when sortable — the composer keeps
     *  a same-size invisible spacer so its code input stays column-aligned. */
    sortable?: boolean;
    /** Composer-confirm gate — the composer-scoped required fields must
     *  all be filled before ✓ arms (task-1/D1: `code`+`label_key`, never
     *  extras the composer cannot render). */
    confirm_disabled?: boolean;
    /** ✓ confirm → pending[] (client-side only, zero server work). */
    onconfirm?: () => void;
    /** ✕ discard → the composer dies (client-side only). */
    ondiscard?: () => void;
  } = $props();

  const codeColumn = $derived(editable_columns.find((c) => c.key === 'code'));
  const valueColumn = $derived(
    editable_columns.find((c) => c.key === display_field) ??
      editable_columns.find((c) => c.key === 'label_key'),
  );
</script>

<div
  class="grid grid-cols-12 items-start gap-4 rounded-lg border bg-background p-3 border-l-[5px] border-l-info/40"
  data-testid="dict-draft-row"
>
  <!-- Left 6/12: code input in the tag zone — `w-2/3` of the column
       makes it exactly the center combobox's 4/12 width (the combobox
       keeps its canonical size; the code field adapts to it). The
       `border-l-info/40` accent is the immature leg of the "to be saved"
       pipeline (composer → pending → saved: info/40 → info → none). -->
  <div class="col-span-6 flex items-start gap-3 min-w-0">
    {#if sortable}
      <span class="-ml-1 mt-0.5 w-6 shrink-0" aria-hidden="true"></span>
    {/if}
    <div class="mt-1 size-4 shrink-0" aria-hidden="true"></div>
    {#if codeColumn}
      <div class="w-2/3 min-w-0" data-dict-cell="code">
        <DictFieldCell column={codeColumn} errors={errors['code']} required>
          {#snippet control({ id })}
            <FormFieldDispatcher
              column={codeColumn}
              bind:value={() => values['code'], (v) => { values['code'] = v; }}
              record={values}
              columns={columns_map}
              {readonly}
              controlProps={{
                id,
                'aria-invalid': (errors['code']?.length ?? 0) > 0 || undefined,
                'aria-describedby': errors['code']?.length ? `${id}-error` : undefined,
              }}
            />
          {/snippet}
        </DictFieldCell>
      </div>
    {/if}
  </div>

  <!-- Center 4/12: the VALUE field — canonical combobox width -->
  <div class="col-span-4 flex items-center justify-center" data-dict-cell={valueColumn?.key}>
    {#if valueColumn}
      <div class="w-full min-w-0">
        <DictFieldCell
          column={valueColumn}
          errors={errors[valueColumn.key]}
          suggestion_optional={valueColumn.key === 'label_key'}
        >
          {#snippet control({ id })}
            {#if valueColumn.key === 'label_key'}
              <TranslationKeyCell
                column={valueColumn}
                value={String(values[valueColumn.key] ?? '')}
                record={values}
                {translation_key}
                {pending_owner}
                {readonly}
                {id}
                onchange={(v) => { values[valueColumn.key] = v; }}
              />
            {:else}
              <FormFieldDispatcher
                column={valueColumn}
                bind:value={() => values[valueColumn.key], (v) => { values[valueColumn.key] = v; }}
                record={values}
                columns={columns_map}
                {readonly}
                controlProps={{
                  id,
                  'aria-invalid': (errors[valueColumn.key]?.length ?? 0) > 0 || undefined,
                  'aria-describedby': errors[valueColumn.key]?.length ? `${id}-error` : undefined,
                }}
              />
            {/if}
          {/snippet}
        </DictFieldCell>
      </div>
    {/if}
  </div>

  <!-- Right 2/12: composer CTAs — ✓ confirm (→pending) + ✕ discard.
       `items-start` + `pt-7` aligns the CTAs with the input row, not
       the label row, so an error line growing a cell never recenters
       them. -->
  <div class="col-span-2 flex items-center justify-end gap-1 pt-7">
    <Button
      variant="ghost"
      size="icon-sm"
      class="text-info hover:bg-info/10 hover:text-info"
      type="button"
      disabled={confirm_disabled || readonly}
      onclick={onconfirm}
      title={$t('app.common.confirm')}
      aria-label={$t('app.common.confirm')}
      data-testid="dict-draft-confirm"
    >
      <Check class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      type="button"
      disabled={readonly}
      onclick={ondiscard}
      title={$t('app.common.discard')}
      aria-label={$t('app.common.discard')}
      data-testid="dict-draft-discard"
    >
      <X class="size-4" />
    </Button>
  </div>
</div>
