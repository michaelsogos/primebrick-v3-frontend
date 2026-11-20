<script lang="ts">
  /**
   * DictExtrasPanel — the `entity.dictExtras` sheet: every update-editable
   * column a dict row owns BEYOND the inline code+label anatomy lives here
   * (entity-identity-column-standard — extras stay off the row). Works on
   * saved rows and pending rows alike: `values`/`errors` arrive as live
   * getters (a snapshot goes stale while the sheet is open — the page
   * replaces the row map on every commit), `onchange` routes through the
   * row's own change channel so edits taint and ride the bulk save.
   *
   * `*_key` extras are translation keys by dict convention → the standard
   * `TranslationKeyCell` (key pick/create + languages CTA). Everything
   * else renders through `EntityFormField` in 'update' mode — the ONE
   * per-field anatomy every form surface shares (label + priority help +
   * dispatcher + immutable/calculated disable logic).
   */
  import { t } from '$lib/i18n';
  import { SheetPanelLayout } from '@primebrick/ui';
  import { SlidersHorizontal } from '@primebrick/ui/vendor/lucide';
  import DictFieldCell from './DictFieldCell.svelte';
  import TranslationKeyCell from './TranslationKeyCell.svelte';
  import EntityFormField from '$lib/entity-form/EntityFormField.svelte';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    values,
    errors,
    onchange,
    columns,
    columns_map,
    translation_key,
    pending_owner,
    title,
    readonly = false,
  }: {
    /** Live getter — re-reads the row's map after every commit (the page
     *  replaces the object on each `cellChange`; a snapshot goes stale). */
    values: () => Record<string, unknown>;
    /** Live getter — per-column inline errors (the same map the row shows). */
    errors: () => Record<string, string[]>;
    /** The row's own change channel — saved rows taint via `cellChange`,
     *  pendings write `d.values` directly. */
    onchange: (key: string, value: unknown) => void;
    /** The extras set — pre-filtered by the page (update-editable minus
     *  the inline value column and the order field). */
    columns: MetaColumn[];
    columns_map: ReadonlyMap<string, MetaColumn>;
    translation_key: string;
    pending_owner: string;
    /** Row title — header context line under the translated panel title. */
    title?: string;
    readonly?: boolean;
  } = $props();

  const baseId = $props.id();
</script>

<SheetPanelLayout contentClass="space-y-4 p-4">
  {#snippet icon()}
    <SlidersHorizontal class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.entities.dict.extras')}
  {/snippet}

  {#if title}
    <p class="text-sm text-muted-foreground">{title}</p>
  {/if}

  {#each columns as c (c.key)}
    {@const errs = errors()[c.key] ?? []}
    {#if c.key.endsWith('_key')}
      <!-- Label-family extras are translation keys by dict convention —
           the standard TranslationKeyCell (pick/create + languages CTA). -->
      <DictFieldCell column={c} errors={errs} required={c.nullable === false}>
        {#snippet control({ id })}
          <TranslationKeyCell
            column={c}
            value={String(values()[c.key] ?? '')}
            record={values()}
            {translation_key}
            {pending_owner}
            {id}
            {readonly}
            onchange={(v) => onchange(c.key, v)}
          />
        {/snippet}
      </DictFieldCell>
    {:else}
      <div class="min-w-0">
        <EntityFormField
          column={c}
          columns={columns_map}
          bind:value={
            () => values()[c.key],
            (v) => onchange(c.key, v)
          }
          record={values()}
          mode="update"
          {readonly}
          controlProps={{
            id: `${baseId}-${c.key}`,
            'aria-invalid': errs.length > 0 || undefined,
            'aria-describedby': errs.length ? `${baseId}-${c.key}-error` : undefined,
          }}
        />
        {#if errs.length}
          <p
            id="{baseId}-{c.key}-error"
            class="mt-1 text-xs font-medium text-destructive"
            data-testid="dict-cell-error"
          >
            {errs[0]}
          </p>
        {/if}
      </div>
    {/if}
  {/each}
</SheetPanelLayout>
