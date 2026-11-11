<script lang="ts">
  /**
   * EntityRecordSheet — the `entity.record` host panel: the record view
   * opened by a `type:"ref"` cell's TEXT affordance.
   *
   * Resolution contract (uniform, no dedicated endpoints):
   *   uuid refs → the cell value IS the target uid → canonical
   *     `GET /entities/{entity}/{uuid}`;
   *   business-key refs (`ref.filter_field` ≠ uid) → the stored value
   *     identifies the target row through its `/list` filter →
   *     `rows[0][uid]` → same canonical GET.
   *
   * Layout: the target entity's census `page_props.form` placements
   * (order + col/row/row_span grid) when a form-bearing route exists,
   * else the fallback — every served `meta.columns` in declared order.
   *
   * Field rendering: `TableCell` — the canonical metadata-driven VALUE
   * renderer. This is a READ-ONLY display surface: no form widgets, no
   * dispatcher. Ref fields render the same link anatomy as the list
   * (text → a further `entity.record` sheet = drill-through; icon →
   * `_blank` filtered list), so nested references navigate the same panel.
   *
   * In-sheet links are `_blank`-only by contract.
   */
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { apiFetch, entityApiBase, routesCensusFromModules } from '$lib/api';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { fetchEntityMeta } from '$lib/entity-list';
  import { filteredEntityListHref } from '$lib/entity-list/entity-links';
  import { SheetPanelLayout, toDisplayString } from '@primebrick/ui';
  import EntityRecordSheetBody from './EntityRecordSheetBody.svelte';
  import { ExternalLink, IdCard } from '@primebrick/ui/vendor/lucide';
  import { LoadingBar } from '$lib/components/ui/loading-bar';
  import type { MetaColumn, EntityMeta } from '$lib/entity-list/types';
  import type { FormFieldPlacement } from '@primebrick/ui';

  let {
    entity,
    value,
    ref,
  }: {
    /** Target entity API name (from `column.ref.entity`). */
    entity: string;
    /** The cell's raw value — the target uid for uuid refs. */
    value: unknown;
    /** The column's ref contract — drives business-key resolution. */
    ref?: MetaColumn['ref'];
  } = $props();

  // Props are stable within a sheet mount — the host remounts the panel
  // per open, so plain captures are the honest contract.
  // svelte-ignore state_referenced_locally
  const basePath = entityApiBase(entity);
  const routeCensus = $derived(routesCensusFromModules(shellNav.modules));

  /** The entity's declared form layout — first form-bearing route in the
   *  census (detail preferred over create). Absent → fallback columns. */
  const formFields = $derived.by<FormFieldPlacement[] | undefined>(() => {
    const routes = routeCensus.filter(
      (r) => r.entity === entity && r.page_props?.form?.fields?.length,
    );
    const detail = routes.find((r) => r.kind === 'detail') ?? routes[0];
    return detail?.page_props?.form?.fields;
  });
  /** Two-column grid only when the declared layout actually uses col 2. */
  const formTwoCol = $derived((formFields ?? []).some((p) => (p.col ?? 1) > 1));

  let meta = $state<EntityMeta | null>(null);
  let record = $state<Record<string, unknown> | null>(null);
  let loading = $state(true);
  let notFound = $state(false);
  let failed = $state(false);

  const columnsMap = $derived.by<ReadonlyMap<string, MetaColumn>>(() => {
    const m = new Map<string, MetaColumn>();
    for (const c of meta?.columns ?? []) m.set(c.key, c);
    return m;
  });
  /** Form layout entries resolved to their column (drift-safe: a
   *  placement key absent from served meta is dropped, never invented). */
  const formPlacements = $derived.by(() => {
    if (!formFields) return [] as { col: MetaColumn; p: FormFieldPlacement }[];
    const out: { col: MetaColumn; p: FormFieldPlacement }[] = [];
    for (const p of formFields) {
      const col = columnsMap.get(p.key);
      if (col && !col.hidden) out.push({ col, p });
    }
    return out;
  });
  const titleText = $derived.by(() => {
    if (!meta) return entity;
    const disp = meta.display_field ? record?.[meta.display_field] : undefined;
    return disp !== undefined && disp !== null && disp !== ''
      ? toDisplayString(disp)
      : entity;
  });
  const listHref = $derived.by(() => {
    const uid = meta?.uid ?? 'uuid';
    const field = ref?.filter_field && ref.filter_field !== uid ? ref.filter_field : uid;
    const v = record?.[uid] ?? (field === uid ? value : undefined);
    if (v === undefined || v === null) return null;
    return filteredEntityListHref(routeCensus, entity, [
      { field, op: '=', value: String(v) },
    ]);
  });

  async function load(): Promise<void> {
    loading = true;
    failed = false;
    notFound = false;
    try {
      meta = await fetchEntityMeta(basePath);
      const uid = meta.uid ?? 'uuid';
      let uuid = String(value);
      const ff = ref?.filter_field;
      if (ff && ff !== uid) {
        const params = new URLSearchParams();
        params.set('filters[0][field]', ff);
        params.set('filters[0][op]', '=');
        params.set('filters[0][value]', String(value));
        params.set('limit', '1');
        const listRes = await apiFetch(`${basePath}/list?${params.toString()}`);
        if (!listRes.ok) {
          failed = true;
          return;
        }
        const listBody = (await listRes.json()) as { rows?: Record<string, unknown>[] };
        const hit = listBody.rows?.[0];
        if (!hit?.[uid]) {
          notFound = true;
          return;
        }
        uuid = String(hit[uid]);
      }
      const res = await apiFetch(`${basePath}/${uuid}`);
      if (res.status === 404) {
        notFound = true;
        return;
      }
      if (!res.ok) {
        failed = true;
        return;
      }
      record = (await res.json()) as Record<string, unknown>;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<SheetPanelLayout>
  {#snippet icon()}
    <IdCard class="size-4" />
  {/snippet}
  {#snippet title()}
    {titleText}
  {/snippet}
  {#snippet actions()}
    {#if listHref}
      <a
        href={listHref}
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        title={$t('app.common.open_in_new_tab')}
        aria-label={$t('app.common.open_in_new_tab')}
        data-testid="entity-record-sheet-list-cta"
      >
        <ExternalLink class="size-4" />
      </a>
    {/if}
  {/snippet}

  <div class="h-full overflow-auto p-4" data-testid="entity-record-sheet">
    {#if loading}
      <LoadingBar />
    {:else if notFound}
      <p class="text-sm text-muted-foreground">{$t('app.common.not_found')}</p>
    {:else if failed || !record}
      <p class="text-sm text-muted-foreground">{$t('app.common.load_error')}</p>
    {:else if record && meta}
      <EntityRecordSheetBody
        {meta}
        {record}
        {formPlacements}
        {formTwoCol}
      />
    {/if}
  </div>
</SheetPanelLayout>
