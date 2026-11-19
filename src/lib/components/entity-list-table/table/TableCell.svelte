<script lang="ts" generics="TRow extends Record<string, unknown>">
  import { resolve } from '$app/paths';
  import { routesCensusFromModules } from '$lib/api';
  import { entityRefHref, reverseRefHref, subjectDecl, subjectFieldLabel, filteredEntityListHref } from '$lib/entity-list/entity-links';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import CellAffordance from './CellAffordance.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';
  import { t } from '$lib/i18n';
  import { formatListCellValue, toDisplayString, colorCssFromToken, extJsonStringify, FILTER_OPERATOR_KEY } from '@primebrick/ui';
  import { formatDatetimeCellDisplay } from '$lib/entity-list';
  import { Badge } from '@primebrick/ui';
  import { ScheduleSpecCell, DynamicIcon } from '@primebrick/ui';
  import { badgeClassesFromToken } from '@primebrick/ui';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { Snippet } from 'svelte';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { loadModuleTranslations } from '$lib/i18n/use-module-translations.svelte';
  import { CircleCheck } from '@primebrick/ui/vendor/lucide'
  import { CircleX } from '@primebrick/ui/vendor/lucide';
  import { ExternalLink } from '@primebrick/ui/vendor/lucide';
  import JsonCellViewer from './JsonCellViewer.svelte';
  import MapperCellViewer from './MapperCellViewer.svelte';
  import { Tooltip } from '@primebrick/ui';
  import { getAuditFieldValue } from '../utils/cell-formatting';
  import { getAuditColumnsContext, getActiveRolesContext, getMetaUidContext, getEntitiesNsContext, getTableEntityContext } from '../context';
  import { SparklineBars } from '@primebrick/ui';
  import { MetaAvatar } from '$lib/components/ui/avatar-preview';

  let {
    row,
    column,
    datetimeIanaModeByKey,
    sparklineData,
    cellSnippet
  }: {
    row: TRow;
    column: MetaColumn;
    datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
    sparklineData?: Record<string, { by_key: Record<string, unknown[]>; bucket_unit?: string }>;
    cellSnippet?: Snippet<[{ row: TRow; column: MetaColumn }]>;
  } = $props();

  const value = $derived(row[column.key]);
  /** DAL auto-join convention: `created_by`/`updated_by`/`deleted_by` (and
   *  any ref-ish column) ship a `<key>_name` sibling holding the resolved
   *  display name. Display paths always prefer it; href builders keep the
   *  raw value (uuid stays the link target). */
  const displayValue = $derived((row[`${column.key}_name`] as unknown) ?? value);
  /** Null-state label contract (`column.null_label`) — contextual
   *  translated text instead of `"-"` when the row matches `when`. */
  const nullLabel = $derived(
    value === null || value === undefined
      ? column.null_label &&
        (column.null_label.when === undefined ||
          (column.null_label.when.equals !== undefined
            ? row[column.null_label.when.field] === column.null_label.when.equals
            : column.null_label.when.not !== undefined
              ? row[column.null_label.when.field] !== column.null_label.when.not
              : true))
        ? column.null_label.label_key
        : undefined
      : undefined
  );

  /** Module route census — resolves `ref`/`reverse_ref` entity names to
   *  real declared routes (FE-owned URLs, never hardcoded in meta). */
  const routeCensus = $derived(routesCensusFromModules(shellNav.modules));

  /** Lazy `ref` resolution (ref contract in `@primebrick/core`): the
   *  target entity is `ref.entity` when declared statically, else the
   *  per-row value of `ref.entity_field`; the drill key is the row's
   *  `ref.key_field` when declared, else the cell value itself (the
   *  normal uuid-ref case). A missing `entity_field` value or a null
   *  declared `key_field` means the target cannot be addressed — the
   *  cell renders its label without a drill affordance. */
  const refEntity = $derived(
    column.type === 'ref' && column.ref
      ? (column.ref.entity ??
          (column.ref.entity_field ? toDisplayString(row[column.ref.entity_field]) : undefined))
      : undefined,
  );
  const refKey = $derived(
    column.type === 'ref' && column.ref
      ? column.ref.key_field
        ? row[column.ref.key_field]
        : value
      : value,
  );
  /** Ref-target entity → record panel: `service_registry` is RPC-served
   *  (`/api/v1/system/services/:code`, never entity-served), so lazy refs
   *  resolving to it open the service record sheet; every other entity
   *  drills through the canonical `entity.record`. */
  const REF_PANEL_FOR_ENTITY: Record<string, 'service.record' | 'entity.record'> = {
    service_registry: 'service.record',
  };
  const refPanel = $derived(refEntity ? (REF_PANEL_FOR_ENTITY[refEntity] ?? 'entity.record') : 'entity.record');
  /** `service_registry` ref targets — the census `label_key` through i18n
   *  wins over the registry `name` wire value (English-only; `label_key`
   *  is the single display-name source for every UI surface, same contract
   *  as VersionsPanel). Unresolved modules keep the served name. */
  const serviceRefModule = $derived(
    refEntity === 'service_registry'
      ? shellNav.modules.find((m) => m.id === toDisplayString(refKey))
      : undefined,
  );
  const serviceRefLabel = $derived.by(() => {
    const lk = serviceRefModule?.label_key;
    if (!lk) return undefined;
    const translated = $t(lk);
    return translated && translated !== lk ? translated : undefined;
  });
  const refDisplayValue = $derived(serviceRefLabel ?? displayValue);
  /** The dict owning `label_key` is route-loaded — a foreign-module list
   *  never fetched it; preload best-effort (per module+lang, deduped) so
   *  the ref renders translated instead of the English wire name. */
  $effect(() => {
    const m = serviceRefModule;
    if (m) void loadModuleTranslations(m.translations_module ?? m.id, $uiLang, { bestEffort: true });
  });
  const metaUid = getMetaUidContext();
  /** Table-entity + namespace contexts — resolved once at init (context is
   *  stable for the cell's lifetime); the `version` branch opens
   *  `entity.versionHistory` with the same payload row actions build. */
  const entityCtx = getTableEntityContext();
  const cellEntitiesNs = getEntitiesNsContext();

  /** `format:"json"` columns carrying a DST mapper document opt into the
   *  prose sheet viewer via `widget` — explicit opt-in beats the generic
   *  JSON inspector AND the conditions-array shape sniff. New mapper
   *  widgets on the same DST contract join this set. */
  const MAPPER_WIDGETS = new Set(['payload_map']);

  /** Record's `kind:"detail"` href — the same census derivation the row
   *  dblclick handler owns; the mapper cell's trailing CTA navigates
   *  `_blank` to it (absent decl → no CTA). */
  const mapperDetailHref = $derived.by(() => {
    if (!entityCtx) return null;
    const detail = routeCensus.find((r) => r.entity === entityCtx.entity && r.kind === 'detail');
    const v = row[entityCtx.uid];
    return detail && v != null ? detail.route.replace(/\[[a-zA-Z0-9_]+\]/, String(v)) : null;
  });
  /** Shared active-roles lookup (`options_source:"system.roles"` columns)
   *  — one lazy fetch per list, `idp_role` → label_key → `$t`. */
  const activeRoles = getActiveRolesContext();
  /** Role badge label — translated `label_key` when the role resolves,
   *  the raw `idp_role` code otherwise (unknown/inactive code or the
   *  fetch hasn't landed yet — the badge re-renders when it does). */
  const roleLabel = (code: unknown): string => {
    const raw = toDisplayString(code);
    const labelKey = activeRoles?.().get(raw)?.label_key;
    return labelKey ? $t(labelKey) : raw;
  };
  /** `column.color` is a TailwindColorToken (canonical: `colorCssFromToken`
   *  → inline style) — meta strings are invisible to the FE content scan,
   *  so class-based colors silently dead-render. Same mechanism as the
   *  create-form `subject_combo` `_icon_color`. */
  const iconStyle = $derived(column.color ? `color:${colorCssFromToken(column.color)}` : undefined);
  /** `format:"nats_subject"` display name — resolved from the module census
   *  (emits+callables `label_key`), same source as the create form. */
  const subjectLabel = $derived.by(() => {
    if (column.format !== 'nats_subject' || typeof value !== 'string' || !value) return undefined;
    const key = subjectDecl(shellNav.modules, value)?.label_key;
    return key ? $t(key) : undefined;
  });

  /** `type:"sparkline"` — resolve the per-row bucket series from the
   *  batch-loaded `sparklineData` map; series labels resolve `label_key`
   *  through i18n. */
  const sparklineSeries = $derived(
    (column.sparkline?.series ?? []).map((s) => ({
      field: s.field,
      color: s.color,
      label: s.label_key ? $t(s.label_key) : s.field
    }))
  );
  const sparklineBuckets = $derived(
    column.type === 'sparkline' && column.sparkline
      ? (sparklineData?.[column.key]?.by_key?.[toDisplayString(row[column.sparkline.row_key] ?? '')] as
          | { bucket_start: string; [k: string]: string | number }[]
          | undefined)
      : undefined
  );

  function isDatetimeIanaRecordMode(col: MetaColumn, modeByKey: Record<string, 'browser' | 'record'>): boolean {
    return col.type === 'datetime' && !!col.datetime_iana_toggle && (modeByKey[col.key] ?? 'browser') === 'record';
  }

  /** Module-list drill-down — the canonical destination for module-owned
   *  concepts (`nats_subject` subjects, `service_code` owners) until the
   *  planned capabilities/events page lands. */
  const MODULES_HREF = '/system/settings/modules';

  /** `format:"service_code"` — the code resolves against the module census
   *  to the owning service's entry (icon + translated name); unresolved
   *  (offline/unregistered service) renders the raw code. */
  const serviceModule = $derived(
    column.format === 'service_code' && typeof value === 'string' && value !== ''
      ? shellNav.modules.find((m) => m.id === value)
      : undefined,
  );

  type JsonCondition = { field: string; op?: string; value?: unknown };
  /** Trigger/filter `{field,op,value}` DSL vocabulary → canonical
   *  `system.entities.list.operators.*` key segments (the same keys the
   *  list FilterBar badges translate through — segments sourced from
   *  `FILTER_OPERATOR_KEY`, never invented glyphs). */
  const OP_I18N_KEY: Record<string, string> = {
    eq: FILTER_OPERATOR_KEY['='],
    neq: FILTER_OPERATOR_KEY['!='],
    gt: FILTER_OPERATOR_KEY['>'],
    gte: FILTER_OPERATOR_KEY['>='],
    lt: FILTER_OPERATOR_KEY['<'],
    lte: FILTER_OPERATOR_KEY['<='],
    contains: FILTER_OPERATOR_KEY.contains,
    exists: 'exists',
  };
  const opLabel = (op?: string) => {
    const key = OP_I18N_KEY[op ?? 'eq'];
    const translated = key ? $t(`system.entities.list.operators.${key}`) : '';
    return translated && !translated.includes('operators.') ? translated : (op ?? '=');
  };
  /** Entity-list link chrome for badge-wrapped links. */
  const CELL_LINK_CLASS = 'text-primary underline underline-offset-2 rounded-sm hover:bg-neutral-200/80 dark:hover:bg-neutral-700/80';
  /** Plain text CTAs in cells (filtered-list links, viewer CTAs): ghost
   *  anatomy — foreground text, ghost `accent` hover bg, underline ON
   *  hover only, standard underline offset. */
  const CELL_TEXT_LINK_CLASS = 'text-foreground underline-offset-2 rounded-sm px-1 py-0.5 hover:bg-accent hover:underline';

  /** `format:"json"` cell content: a `[{field, op, value}]` condition list
   *  renders as prose chips (job trigger `filter` contract); anything else
   *  falls back to truncated JSON text. */
  function jsonCellContent(raw: unknown): { kind: 'conditions'; conditions: JsonCondition[] } | { kind: 'text'; text: string } {
    if (Array.isArray(raw) && raw.length > 0 && raw.every((c) => c !== null && typeof c === 'object' && 'field' in c)) {
      return { kind: 'conditions', conditions: raw as JsonCondition[] };
    }
    const text = toDisplayString(raw);
    return { kind: 'text', text: text.length > 60 ? text.slice(0, 60) + '…' : text };
  }
</script>

{#if cellSnippet}
  {@render cellSnippet({ row, column })}
{:else if column.key === 'version' && value !== undefined && value !== null}
  <!-- The `version` column is a badge-affordance by construction — the
       canonical version-history badge drilling into the stacked sheet,
       same anatomy + payload as the sheet footer / row menu action. -->
  {#if entityCtx}
    <button
      type="button"
      class="inline-flex"
      title={$t('system.entities.version_history.title')}
      onclick={(e) => {
        e.stopPropagation();
        openSheet('entity.versionHistory', {
          entity: entityCtx.entity,
          translationKey: entityCtx.translationKey,
          entities_ns: cellEntitiesNs,
          rowUuid: String(row[entityCtx.uid]),
          columns: entityCtx.columns,
        });
      }}
      data-testid="version-cell-badge"
    >
      <Badge
        variant="outline"
        class="text-xs font-semibold border border-primary bg-white dark:bg-black cursor-pointer hover:bg-primary/10"
      >
        v{toDisplayString(value)}
      </Badge>
    </button>
  {:else}
    <span class="min-w-0 truncate">{toDisplayString(value)}</span>
  {/if}
{:else if column.type === 'boolean'}
  <div class="flex w-full justify-center">
    {#if value === true}
      <Tooltip.Root>
        <Tooltip.Trigger>
          <CircleCheck class="size-4 text-green-600 shrink-0" />
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{$t(column.tooltip ?? column.label_key)}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    {:else if value === false}
      <Tooltip.Root>
        <Tooltip.Trigger>
          <CircleX class="size-4 text-muted-foreground shrink-0" />
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{$t(column.tooltip ?? column.label_key)}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    {:else}
      <span class="min-w-0 truncate">-</span>
    {/if}
  </div>
{:else if column.type === 'sparkline' && column.sparkline}
  {#if sparklineBuckets === undefined}
    <!-- No stats row for this key (or the batch fetch hasn't landed) —
         the universal null contract, not an empty frame. -->
    <span class="min-w-0 truncate">-</span>
  {:else}
    <SparklineBars
      buckets={sparklineBuckets}
      bucketUnit={sparklineData?.[column.key]?.bucket_unit}
      series={sparklineSeries}
      bucketField={column.sparkline.bucket_field ?? 'bucket_start'}
      noRunsLabel={$t('system.entities.list.no_runs')}
    />
  {/if}
{:else if column.badge?.values && value}
  {@const badgeValue = value as string}
  {@const badgeColors = badgeClassesFromToken(column.badge.values[badgeValue]?.color ?? null)}
  <Badge
    class="shadow-none"
    style="background-color: {badgeColors.bgColor}; color: {badgeColors.textColor}; border-color: {badgeColors.borderColor};"
  >
    {column.badge.values[badgeValue]?.label_text ?? (column.badge.values[badgeValue]?.label_key ? $t(column.badge.values[badgeValue].label_key!) : String(badgeValue))}
  </Badge>
{:else if column.format === 'schedule_spec' && typeof value === 'string' && value !== ''}
  <ScheduleSpecCell {value} />
{:else if column.format === 'nats_subject' && value}
  <!-- Display name (translated census label_key) renders INSIDE the badge
       when the census resolves it; the raw subject path always lives in
       the tooltip. Without a census match the badge shows the path itself. -->
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <a
          {...props}
          href={resolve(MODULES_HREF)}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex max-w-full rounded-sm"
        >
          <Badge variant="secondary" class="gap-1 shadow-none">
            {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" style={iconStyle} />{/if}
            <span class={['truncate text-xs', !subjectLabel && 'font-mono text-[11px]']}>{subjectLabel ?? toDisplayString(value)}</span>
          </Badge>
        </a>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>
      <p class="font-mono text-xs">{toDisplayString(value)}</p>
    </Tooltip.Content>
  </Tooltip.Root>
{:else if column.format === 'service_code' && value}
  <!-- Module badge — the census carries the service's icon + translated
       name; the raw code stays in the tooltip. -->
  {#if serviceModule}
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <a
            {...props}
            href={resolve(MODULES_HREF)}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex max-w-full rounded-sm"
          >
            <Badge variant="secondary" class="gap-1 shadow-none">
              {#if serviceModule.icon}<DynamicIcon name={serviceModule.icon} size={12} class="shrink-0" />{/if}
              <span class="truncate text-xs">{serviceModule.label_key ? $t(serviceModule.label_key) : serviceModule.name}</span>
            </Badge>
          </a>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p class="font-mono text-xs">{toDisplayString(value)}</p>
      </Tooltip.Content>
    </Tooltip.Root>
  {:else}
    <span class="font-mono text-[11px]">{toDisplayString(value)}</span>
  {/if}
{:else if column.format === 'json' && value !== null && value !== undefined && value !== ''}
  {@const json = jsonCellContent(value)}
  {#if MAPPER_WIDGETS.has(column.widget ?? '')}
    <MapperCellViewer {value} {column} {row} detailHref={mapperDetailHref} />
  {:else if json.kind === 'conditions'}
    <div class="flex min-w-0 flex-wrap gap-1">
      {#each json.conditions as cond (cond.field)}
        <!-- Canonical black tooltip: the condition's own JSON fragment,
             pretty-printed. -->
        <Tooltip.Root>
          <Tooltip.Trigger>
            <Badge variant="secondary" class="gap-1.5 font-normal">
              <span class="text-xs font-bold text-foreground">{subjectFieldLabel(shellNav.modules, typeof row.event_subject === 'string' ? row.event_subject : undefined, cond.field)}</span>
              <span class="text-xs text-primary">{opLabel(cond.op)}</span>
              {#if cond.value !== undefined}<span class="text-xs italic text-muted-foreground">{toDisplayString(cond.value)}</span>{/if}
            </Badge>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <pre class="max-w-xs overflow-x-auto font-mono text-xs">{extJsonStringify(cond, 2)}</pre>
          </Tooltip.Content>
        </Tooltip.Root>
      {/each}
    </div>
  {:else}
    <!-- Generic JSONB fallback — specific renderers (condition chips above)
         win; everything else gets the standard viewer sheet. -->
    <JsonCellViewer {value} />
  {/if}
{:else if column.type === 'ref' && column.ref && value}
  {#if column.ref.presentation === 'badge'}
    <!-- Opt-in legacy anatomy — badge pill as a single `_blank` link. -->
    {@const href = entityRefHref(routeCensus, { ...column.ref, entity: refEntity ?? '' }, toDisplayString(refKey))}
    {#if href}
      <a
        href={resolve(href as '/')}
        target="_blank"
        rel="noopener noreferrer"
        class={['inline-flex max-w-full items-center gap-1', CELL_LINK_CLASS]}
      >
        <Badge variant="outline" class="gap-1 shadow-none">
          {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" style={iconStyle} />{/if}
          <span class="truncate font-mono text-[11px]">{toDisplayString(refDisplayValue)}</span>
        </Badge>
      </a>
    {:else}
      <span class="min-w-0 truncate font-mono text-[11px]">{toDisplayString(refDisplayValue)}</span>
    {/if}
  {:else if column.ref.route === 'none'}
    <span class="min-w-0 truncate">{toDisplayString(refDisplayValue)}</span>
  {:else}
    <!-- Default "link" anatomy: medium text (underline on hover) opens
         the record sheet; trailing ExternalLink → filtered /list _blank
         (the canonical module page for non-entity-served targets). -->
    {@const iconHref = refEntity === 'service_registry'
      ? resolve('/(app)/system/settings/modules/[code]', { code: toDisplayString(refKey) })
      : refEntity
        ? filteredEntityListHref(routeCensus, refEntity, [
            { field: column.ref.filter_field ?? metaUid, op: '=', value: toDisplayString(refKey) },
          ])
        : null}
    {#if refEntity && refKey !== undefined && refKey !== null && refKey !== ''}
      <CellAffordance
        text={toDisplayString(refDisplayValue)}
        ontextclick={() => {
          if (refPanel === 'service.record') {
            openSheet('service.record', { code: toDisplayString(refKey), context_row: row as Record<string, unknown> }, { stack: true });
          } else {
            openSheet('entity.record', { entity: refEntity, value: refKey, ref: column.ref }, { stack: true });
          }
        }}
        href={iconHref ?? undefined}
        icon_title={$t('app.common.open_in_new_tab')}
        test_id={`ref-cell-${column.key}`}
      >
        {#snippet icon()}
          <ExternalLink class="size-3.5" />
        {/snippet}
      </CellAffordance>
    {:else}
      <!-- Lazy-ref row whose entity/key fields came back empty — the
           target cannot be addressed, so the label renders plainly
           (same contract as `route:"none"`). -->
      <span class="min-w-0 truncate">{toDisplayString(refDisplayValue) || '-'}</span>
    {/if}
  {/if}
{:else if column.type === 'ref_count' && column.reverse_ref}
  {@const href = reverseRefHref(routeCensus, column.reverse_ref, metaUid, row)}
  {#if href}
    <!-- 1-N convention: a filtered-list link is rendered as a plain link,
         never a badge (badges are for N-1 detail navigation). The count is
         shown when the service decorated it; `ref` without a count stays
         a plain link too. -->
    <a
      href={resolve(href as '/')}
      target="_blank"
      rel="noopener noreferrer"
      class={['inline-flex items-center gap-1', CELL_TEXT_LINK_CLASS]}
    >
      {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" style={iconStyle} />{/if}
      <span class="truncate">{value !== undefined && value !== null ? `${toDisplayString(value)} ${$t(column.label_key)}` : $t(column.label_key)}</span>
    </a>
  {:else}
    <span class="min-w-0 truncate">{value !== undefined && value !== null ? toDisplayString(value) : '-'}</span>
  {/if}
{:else if nullLabel}
  <span class="min-w-0 truncate text-xs italic text-destructive">{$t(nullLabel)}</span>
{:else if column.type === 'datetime'}
  {@const mode = datetimeIanaModeByKey[column.key] ?? 'browser'}
  {@const parts = formatDatetimeCellDisplay(
    column,
    row,
    $uiLang,
    mode
  )}
  {#if isDatetimeIanaRecordMode(column, datetimeIanaModeByKey) && parts.iana}
    <div class="flex min-w-0 flex-col gap-1">
      <span class="min-w-0 truncate">{parts.text || '-'}</span>
      <Badge
        variant="outline"
        class="w-fit max-w-full shrink truncate border-amber-300/90 bg-amber-100 px-1.5 py-0 text-[10px] font-medium leading-tight text-amber-950 shadow-none dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >{parts.iana}</Badge>
    </div>
  {:else}
    <span class="min-w-0 truncate">{parts.text || '-'}</span>
  {/if}
{:else if column.type === 'avatar'}
  <!-- `type:"avatar"` — initials from the column's own value, color from
       the sibling `avatar.color_field` (same pattern as `uom.field`). -->
  {#if value !== undefined && value !== null && value !== ''}
    <MetaAvatar
      initials={toDisplayString(value)}
      color={column.avatar?.color_field ? (row[column.avatar.color_field] as string | undefined) : undefined}
      size="sm"
    />
  {:else}
    <span class="min-w-0 truncate">-</span>
  {/if}
{:else if column.options_source === 'system.roles' && Array.isArray(value)}
  <!-- `options_source:"system.roles"` — one `Badge secondary` per role
       code (icon + translated label via the active-roles resolver,
       icon/color authored on the column like every other badge branch).
       The badge is a drill affordance: click opens the `role_mapping`
       record in a stacked `entity.record` sheet — the business-key ref
       (`filter_field:"idp_role"`) resolves the code through `/list`.
       Tooltip keeps the raw `idp_role` code. -->
  {#if value.length > 0}
    <div class="flex min-w-0 flex-wrap gap-1" data-testid={`roles-cell-${column.key}`}>
      {#each value as code (code)}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="inline-flex max-w-full rounded-sm cursor-pointer"
                onclick={(e) => {
                  e.stopPropagation();
                  openSheet('entity.record', {
                    entity: 'role_mapping',
                    value: code,
                    ref: { entity: 'role_mapping', filter_field: 'idp_role' },
                  }, { stack: true });
                }}
              >
                <Badge variant="secondary" class="gap-1 shadow-none">
                  {#if column.icon}<DynamicIcon name={column.icon} size={12} class="shrink-0" style={iconStyle} />{/if}
                  <span class="truncate text-xs">{roleLabel(code)}</span>
                </Badge>
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p class="font-mono text-xs">{toDisplayString(code)}</p>
          </Tooltip.Content>
        </Tooltip.Root>
      {/each}
    </div>
  {:else}
    <span class="min-w-0 truncate">-</span>
  {/if}
{:else}
  <!-- Universal null contract: every value-less cell renders `-`
       (contextual `column.null_label` is the only declared override). -->
  <span class="min-w-0 truncate">{(displayValue !== value ? toDisplayString(displayValue) : getAuditFieldValue(row, column, $uiLang, formatListCellValue, getAuditColumnsContext())) || '-'}</span>
{/if}