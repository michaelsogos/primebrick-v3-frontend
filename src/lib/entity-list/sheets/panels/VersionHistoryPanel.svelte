<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { apiFetch, entityApiBase, ApiUnreachableError } from "$lib/api";
  import { shellNav } from "$lib/shell/modules-shell.svelte";
  import { extJsonParse } from "$lib/api-ext";
  import { t, formatUiDateTime, formatUiDate } from "$lib/i18n";
  import { uiLang } from "$lib/i18n/store.svelte";
  import { loadModuleTranslations } from "$lib/i18n/use-module-translations.svelte";
  import { SheetPanelLayout, toDisplayString, isEntityOpEnabled } from '@primebrick/ui';
  import { fetchEntityMeta } from '$lib/entity-list';
  import { History } from '@primebrick/ui/vendor/lucide';
  import { Grid3x3Off } from '@primebrick/ui/vendor/lucide';
  import { Hourglass } from '@primebrick/ui/vendor/lucide'
  import { CircleX } from '@primebrick/ui/vendor/lucide'
  import { Info } from '@primebrick/ui/vendor/lucide'
  import { ChevronDown } from '@primebrick/ui/vendor/lucide'
  import { CircleCheckBig } from '@primebrick/ui/vendor/lucide'
  import { AlertCircle } from '@primebrick/ui/vendor/lucide'
  import { TriangleAlert } from '@primebrick/ui/vendor/lucide';
  import { Copy } from '@primebrick/ui/vendor/lucide';
  import { Button } from '@primebrick/ui';
  import { Badge } from '@primebrick/ui';
  import { badgeClassesFromToken } from '@primebrick/ui';
  import { cn } from "$lib/utils";
  import { openSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import * as Timeline from "$lib/components/ui/timeline";
  import { Tooltip } from '@primebrick/ui';
  import { JsonCodeBlock } from '@primebrick/ui';
  import type { MetaColumn } from '$lib/entity-list/types';
  import { tryParseJsonObject } from '$lib/utils/json-object';
  import { auditActionKey, changedBySheetTarget } from '../version-history-title';

  interface Props {
    entity: string;
    translationKey?: string;
    /** Entity-label i18n namespace (`meta.entities_ns`) — `system` for BE-owned entities. */
    entities_ns?: string;
    rowUuid: string;
    columns?: MetaColumn[];
    /** Owning service — required for builtin entities (census map is
     *  last-wins ambiguous; route context threads through or audit
     *  reads the wrong schema). */
    service?: string;
  }

  /** One field's old/new pair inside an audit `delta` object. */
  type AuditDeltaChange = {
    old?: unknown;
    new?: unknown;
    from?: unknown;
    to?: unknown;
    old_display_name?: string;
    new_display_name?: string;
  };

  type VersionHistoryEntry = {
    uuid: string;
    action: string;
    version: bigint;
    changed_at: string;
    changed_by: string | null;
    changed_by_name: string | null;
    delta: Record<string, AuditDeltaChange>;
  };

  let {
    entity,
    translationKey,
    entities_ns = 'system',
    rowUuid,
    columns = [],
    service,
  }: Props = $props();

  // translationKey is snake_case singular (e.g. "user_profile") for i18n keys.
  // Falls back to entity (snake_case plural) when not provided — back-compat.
  // $derived: keep reactive link to props (avoids state_referenced_locally).
  const i18nEntity = $derived(translationKey ?? entity);

  /** The entity's owning service display name — census `entities`
   *  declaration; `undefined` when the owner isn't censused (the hero
   *  falls back to the generic message). */
  const ownerServiceName = $derived.by(() => {
    const mod = shellNav.modules.find((m) => m.entities?.includes(entity));
    if (!mod) return undefined;
    if (mod.label_key) {
      const resolved = $t(mod.label_key);
      if (resolved && resolved !== mod.label_key) return resolved;
    }
    return mod.name || undefined;
  });
  /** Translated entity singular — same `<ns>.entities.<tk>.singular`
   *  contract the record surface uses; raw key fallback keeps the
   *  message readable when a dict entry is missing. */
  const entitySingular = $derived.by(() => {
    const resolved = $t(`${entities_ns}.entities.${i18nEntity}.singular`);
    return resolved && !resolved.includes('.singular') ? resolved : i18nEntity;
  });
  /** The audit fetch failed because the OWNING SERVICE can't be reached
   *  (proxy 502/503-scoped or network failure) — the watermark names the
   *  service instead of the generic error. */
  const ownerUnreachableMessage = $derived(
    ownerServiceName
      ? $t('app.service.entity_owner_unreachable', { service: ownerServiceName, entity: entitySingular })
      : $t('app.service.entity_owner_unreachable_generic'),
  );

  let versionHistoryData = $state<VersionHistoryEntry[]>([]);
  /** `read.audit` capability from served meta — `null` while resolving.
   *  The meta cache is warm (the record sheet fetched it before opening
   *  this panel), so resolution costs no request; on miss it is ONE
   *  `GET /meta` on a real endpoint instead of a doomed `GET /audit`. */
  let auditEnabled = $state<boolean | null>(null);
  let versionHistoryLoading = $state<boolean>(false);
  let versionHistoryError = $state<string | null>(null);
  let versionHistoryPage = $state<number>(1);
  let versionHistoryLimit = $state<number>(50);
  let versionHistoryHasMore = $state<boolean>(false);
  let expandedEntries = new SvelteSet<string>();


  function toggleEntryExpanded(entryId: string) {
    if (expandedEntries.has(entryId)) {
      expandedEntries.delete(entryId);
    } else {
      expandedEntries.add(entryId);
    }
  }

  async function loadVersionHistory() {
    versionHistoryLoading = true;
    versionHistoryError = null;
    versionHistoryPage = 1;
    versionHistoryData = [];

    try {
      const res = await apiFetch(`${entityApiBase(entity, service)}/${rowUuid}/audit?page=${versionHistoryPage}&limit=${versionHistoryLimit}`);

      if (!res.ok) {
        throw new Error('Failed to load version history');
      }

      const data = extJsonParse<{ data: VersionHistoryEntry[]; pagination: { total: bigint; hasMore: boolean } }>(await res.text());
      versionHistoryData = data.data || [];
      versionHistoryHasMore = data.pagination?.hasMore || false;
    } catch (e) {
      versionHistoryError =
        e instanceof ApiUnreachableError
          ? ownerUnreachableMessage
          : $t('system.entities.version_history.error');
      console.error('Failed to load version history:', e);
    } finally {
      versionHistoryLoading = false;
    }
  }

  async function loadMoreVersionHistory() {
    if (versionHistoryLoading || !versionHistoryHasMore) return;

    versionHistoryLoading = true;
    versionHistoryPage += 1;

    try {
      const res = await apiFetch(`${entityApiBase(entity, service)}/${rowUuid}/audit?page=${versionHistoryPage}&limit=${versionHistoryLimit}`);

      if (!res.ok) {
        throw new Error('Failed to load version history');
      }

      const data = extJsonParse<{ data: VersionHistoryEntry[]; pagination: { hasMore: boolean } }>(await res.text());
      versionHistoryData = [...versionHistoryData, ...(data.data || [])];
      versionHistoryHasMore = data.pagination?.hasMore || false;
    } catch (e) {
      versionHistoryError =
        e instanceof ApiUnreachableError
          ? ownerUnreachableMessage
          : $t('system.entities.version_history.error');
      console.error('Failed to load version history:', e);
    } finally {
      versionHistoryLoading = false;
    }
  }

  function getAuditActionColorClass(action: string): string {
    const actionLower = action.toLowerCase();
    if (actionLower === 'hard_delete') {
      return 'text-red-700 dark:text-red-300';
    } else if (actionLower === 'delete' || actionLower === 'soft_delete') {
      return 'text-red-600 dark:text-red-400';
    } else if (actionLower === 'clone') {
      return 'text-violet-600 dark:text-violet-400';
    } else if (actionLower === 'create' || actionLower === 'insert') {
      return 'text-emerald-600 dark:text-emerald-400';
    } else if (actionLower === 'restore') {
      return 'text-amber-600 dark:text-amber-400';
    } else if (actionLower === 'update') {
      return 'text-sky-600 dark:text-sky-400';
    }
    return 'text-foreground';
  }

  function getAuditActionBorderClass(action: string): string {
    const actionLower = action.toLowerCase();
    if (actionLower === 'hard_delete') {
      return 'border-red-700 dark:border-red-300';
    } else if (actionLower === 'delete' || actionLower === 'soft_delete') {
      return 'border-red-600 dark:border-red-400';
    } else if (actionLower === 'clone') {
      return 'border-violet-600 dark:border-violet-400';
    } else if (actionLower === 'create' || actionLower === 'insert') {
      return 'border-emerald-600 dark:border-emerald-400';
    } else if (actionLower === 'restore') {
      return 'border-amber-600 dark:border-amber-400';
    } else if (actionLower === 'update') {
      return 'border-sky-600 dark:border-sky-400';
    }
    return 'border-foreground';
  }

  function getAuditActionIcon(action: string) {
    const actionLower = action.toLowerCase();
    if (actionLower === 'hard_delete') {
      return CircleX;
    } else if (actionLower === 'delete' || actionLower === 'soft_delete') {
      return AlertCircle;
    } else if (actionLower === 'clone') {
      return Copy;
    } else if (actionLower === 'create' || actionLower === 'insert') {
      return CircleCheckBig;
    } else if (actionLower === 'restore') {
      return TriangleAlert;
    } else if (actionLower === 'update') {
      return Info;
    }
    return Info;
  }

  /** `system:<code>` writers — the census `label_key` through i18n wins
   *  over the registry `name` wire value (English-only; same contract as
   *  the ELT ref cell and VersionsPanel). The owning dict is route-loaded
   *  so a foreign-module page never fetched it — preload best-effort
   *  (per module+lang, deduped); unresolved codes keep the served name. */
  $effect(() => {
    for (const e of versionHistoryData) {
      const actor = e.changed_by ?? '';
      if (!actor.startsWith('system:')) continue;
      const code = actor.slice('system:'.length);
      const m = shellNav.modules.find((x) => x.id === code);
      if (m) void loadModuleTranslations(m.translations_module ?? m.id, $uiLang, { bestEffort: true });
    }
  });

  function getChangedByDisplay(entry: VersionHistoryEntry): string {
    const actor = entry.changed_by ?? '';
    if (actor.startsWith('system:')) {
      const mod = shellNav.modules.find((m) => m.id === actor.slice('system:'.length));
      const lk = mod?.label_key;
      const translated = lk ? $t(lk) : '';
      if (translated && translated !== lk) return translated;
    }
    // If display_name is available from the join, use it
    if (entry.changed_by_name) {
      return entry.changed_by_name;
    }
    // Last resort: fallback to UUID
    return actor;
  }

  /** Translated action label — `auditActionKey` owns the key contract
   *  (generic block, lowercase); unresolved keys fall back to the raw
   *  wire action so a missing translation never hides the entry. */
  function getAuditActionLabel(action: string): string {
    const key = auditActionKey(action);
    const translated = $t(key);
    return translated === key ? action : translated;
  }

  /** Drill into the writer behind an audit row — `changedBySheetTarget`
   *  owns the routing; error states are owned by the target sheets. */
  function openChangedByRecord(entry: VersionHistoryEntry) {
    const target = changedBySheetTarget(entry.changed_by ?? '');
    openSheet(target.panel, target.props, { stack: true });
  }

  function formatAuditDelta(delta: Record<string, AuditDeltaChange>, action: string): Array<{
    field: string,
    operator: string,
    toOperator?: string,
    oldValue?: string,
    newValue?: string,
    isBadge?: boolean,
    badgeColor?: string,
    badgeLabelText?: string,
    badgeLabelKey?: string,
    oldBadgeColor?: string,
    oldBadgeLabelText?: string,
    oldBadgeLabelKey?: string,
    isColor?: boolean,
    colorValue?: string,
    oldColorValue?: string,
    isJson?: boolean,
    jsonValue?: unknown,
    oldJsonValue?: unknown
  }> {
    const descriptions: Array<{
      field: string,
      operator: string,
      toOperator?: string,
      oldValue?: string,
      newValue?: string,
      isBadge?: boolean,
      badgeColor?: string,
      badgeLabelText?: string,
      badgeLabelKey?: string,
      oldBadgeColor?: string,
      oldBadgeLabelText?: string,
      oldBadgeLabelKey?: string,
      isColor?: boolean,
      colorValue?: string,
      oldColorValue?: string,
      isJson?: boolean,
      jsonValue?: unknown,
      oldJsonValue?: unknown
    }> = [];

    for (const [field, change] of Object.entries(delta)) {
      if (field === 'version') continue; // Skip version field

      let fieldLabel = $t(`system.entities.version_history.field.${field}`);
      if (fieldLabel === `system.entities.version_history.field.${field}`) {
        // Fallback to entity-specific fields translation if versionHistory field doesn't exist
        fieldLabel = $t(`${entities_ns}.entities.${i18nEntity}.fields.${field}`) || field;
      }
      // Use display_name for audit fields if available, otherwise use raw value
      const oldValue = change.old_display_name || change.from || change.old;
      const newValue = change.new_display_name || change.to || change.new;

      // Check if this is a badge or color field using column metadata
      const column = columns.find((c) => c.key === field);
      const badgeValues = column?.type === 'badge' && column.badge ? column.badge.values : undefined;
      const isBadge = !!badgeValues;
      const isColor = column?.type === 'color';

      // Detect JSONB/JSON fields: column type is 'json'/'jsonb', or the value
      // is a string that parses as a JSON object (not a scalar or array-only).
      // Arrays are handled by the existing formatValue (emptyList / String).

      const parsedNewJson = tryParseJsonObject(newValue);
      const parsedOldJson = tryParseJsonObject(oldValue);
      // Detect JSONB/JSON values: if either old or new parses as a JSON object,
      // render with JsonTableViewer. This covers INSERT (old=null, new=object)
      // and UPDATE (both present, one may be null if cleared).
      const isJson = parsedNewJson !== undefined || parsedOldJson !== undefined;

      // Format value based on column type (date/datetime)
      // Falls back to field name detection for audit fields (created_at, updated_at, etc.)
      // which don't have column metadata in the entity columns array.
      const isDateField = column?.type === 'date' || (!column && /_at$/.test(field));
      const isDateTimeField = column?.type === 'datetime' || (!column && /(_at|changed_at|last_synced_at)$/.test(field));
      function formatValue(value: unknown): string {
        if (value === null || value === undefined) return $t('system.entities.version_history.null');
        if (Array.isArray(value) && value.length === 0) return $t('system.entities.version_history.empty_list');
        if (value === '') return $t('system.entities.version_history.null');
        if (column?.type === 'date' || isDateField) {
          return formatUiDate(value as string | number | Date, $uiLang);
        }
        if (column?.type === 'datetime' || isDateTimeField) {
          return formatUiDateTime(value as string | number | Date, $uiLang);
        }
        return toDisplayString(value);
      }

      let badgeColor: string | undefined;
      let badgeLabelText: string | undefined;
      let badgeLabelKey: string | undefined;
      let oldBadgeColor: string | undefined;
      let oldBadgeLabelText: string | undefined;
      let oldBadgeLabelKey: string | undefined;
      let colorValue: string | undefined;
      let oldColorValue: string | undefined;

      if (isBadge) {
        if (newValue) {
          const newBadgeConfig = badgeValues?.[newValue as string];
          badgeColor = newBadgeConfig?.color;
          badgeLabelText = newBadgeConfig?.label_text;
          badgeLabelKey = newBadgeConfig?.label_key;
        }
        if (oldValue) {
          const oldBadgeConfig = badgeValues?.[oldValue as string];
          oldBadgeColor = oldBadgeConfig?.color;
          oldBadgeLabelText = oldBadgeConfig?.label_text;
          oldBadgeLabelKey = oldBadgeConfig?.label_key;
        }
      } else if (isColor) {
        if (newValue) {
          colorValue = newValue as string;
        }
        if (oldValue) {
          oldColorValue = oldValue as string;
        }
      }

      const isCreateOrInsert = action === 'CREATE' || action === 'INSERT' || action === 'CLONE';

      if (oldValue == null && newValue != null) {
        descriptions.push({
          field: fieldLabel,
          operator: isCreateOrInsert ? $t('system.entities.version_history.set') : $t('system.entities.version_history.changed_from'),
          toOperator: isCreateOrInsert ? undefined : $t('system.entities.version_history.to'),
          oldValue: isCreateOrInsert ? undefined : $t('system.entities.version_history.null'),
          newValue: isJson ? undefined : formatValue(newValue),
          isBadge,
          badgeColor,
          badgeLabelText,
          badgeLabelKey,
          isColor,
          colorValue,
          isJson,
          jsonValue: isJson ? parsedNewJson : undefined
        });
      } else if (oldValue != null && newValue == null) {
        descriptions.push({
          field: fieldLabel,
          operator: $t('system.entities.version_history.changed_from'),
          toOperator: $t('system.entities.version_history.to'),
          oldValue: isJson ? undefined : formatValue(oldValue),
          newValue: $t('system.entities.version_history.null'),
          isBadge,
          badgeColor,
          badgeLabelText,
          badgeLabelKey,
          oldBadgeColor,
          oldBadgeLabelText,
          oldBadgeLabelKey,
          isColor,
          oldColorValue,
          isJson,
          oldJsonValue: isJson ? parsedOldJson : undefined
        });
      } else if (oldValue != newValue) {
        descriptions.push({
          field: fieldLabel,
          operator: $t('system.entities.version_history.changed_from'),
          toOperator: $t('system.entities.version_history.to'),
          oldValue: isJson ? undefined : formatValue(oldValue),
          newValue: isJson ? undefined : formatValue(newValue),
          isBadge,
          badgeColor,
          badgeLabelText,
          badgeLabelKey,
          oldBadgeColor,
          oldBadgeLabelText,
          oldBadgeLabelKey,
          isColor,
          colorValue,
          oldColorValue,
          isJson,
          jsonValue: isJson ? parsedNewJson : undefined,
          oldJsonValue: isJson ? parsedOldJson : undefined
        });
      } else {
        // Unchanged value but field is in delta (e.g. updated_by forced for audit trail) — show plain value
        descriptions.push({
          field: fieldLabel,
          operator: $t('system.entities.version_history.unchanged'),
          newValue: newValue == null ? $t('system.entities.version_history.null') : (isJson ? undefined : formatValue(newValue)),
          isBadge,
          badgeColor,
          badgeLabelText,
          badgeLabelKey,
          isColor,
          colorValue,
          isJson,
          jsonValue: isJson ? parsedNewJson : undefined
        });
      }
    }

    return descriptions;
  }

  // Capability gate before any network: `read.audit` enabled:false in the
  // served actions means the entity exposes NO audit route — render the
  // disabled watermark instead of issuing a doomed GET. Meta fetch failure
  // falls through to `loadVersionHistory()` so the real error watermark
  // (unreachable-service path included) still surfaces.
  $effect(() => {
    fetchEntityMeta(entityApiBase(entity, service))
      .then((meta) => {
        auditEnabled = isEntityOpEnabled(meta.actions, 'read.audit');
        if (auditEnabled) void loadVersionHistory();
      })
      .catch(() => {
        auditEnabled = true;
        void loadVersionHistory();
      });
  });

</script>

<SheetPanelLayout>
  {#snippet icon()}
    <History class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.entities.version_history.title')}
  {/snippet}
    {#if auditEnabled === false}
      <div class="grid h-full place-items-center p-3" data-testid="version-history-disabled">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-disabled">
            <Grid3x3Off class="size-20 text-muted-foreground" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{$t('app.common.version_history_disabled')}</div>
        </div>
      </div>
    {:else if auditEnabled === null || (versionHistoryLoading && versionHistoryData.length === 0)}
      <div class="grid h-full place-items-center p-3">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-loading">
            <Hourglass class="size-20 text-info" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{$t('system.entities.version_history.loading')}</div>
        </div>
      </div>
    {:else if versionHistoryError}
      <div class="grid h-full place-items-center p-3" data-testid="version-history-error">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-error">
            <CircleX class="size-20 text-destructive" />
          </div>
          <div class="text-sm font-medium text-destructive">{versionHistoryError}</div>
        </div>
      </div>
    {:else if versionHistoryData.length === 0}
      <div class="grid h-full place-items-center p-3">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-empty">
            <Info class="size-20 text-info" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{$t('system.entities.version_history.empty')}</div>
        </div>
      </div>
    {:else}
      <div class="p-4">
        <Timeline.Root>
          {#each versionHistoryData as entry (entry.uuid)}
            {@const colorClass = getAuditActionColorClass(entry.action)}
            {@const borderClass = getAuditActionBorderClass(entry.action)}
            {@const ActionIcon = getAuditActionIcon(entry.action)}
            {@const isUpdate = entry.action === 'UPDATE' || entry.action === 'CREATE' || entry.action === 'INSERT' || entry.action === 'SOFT_DELETE' || entry.action === 'DELETE' || entry.action === 'RESTORE' || entry.action === 'CLONE'}
            {@const descriptions = entry.action === 'HARD_DELETE' ? [$t('system.entities.version_history.record_hard_deleted')]
              : formatAuditDelta(entry.delta, entry.action)}

            <Timeline.Item>
              <Timeline.Separator>
                <ActionIcon class={cn("size-4", colorClass)} />
              </Timeline.Separator>
              <Timeline.Content>
                <div class="flex items-center gap-2">
                  <Badge class={cn("text-xs font-semibold border", borderClass)} variant="outline">
                    v{entry.version}
                  </Badge>
                  <Timeline.Date>{formatUiDateTime(entry.changed_at, $uiLang)}</Timeline.Date>
                </div>
                <Timeline.Title>
                  <!-- Prose contract: "{action} {by} {actor}" — only the
                       action carries the semaphoric color; the connector
                       and the actor link stay neutral. -->
                  <span class={colorClass}>{getAuditActionLabel(entry.action)}</span>
                  {#if entry.changed_by}
                    &nbsp;<span class="font-normal text-foreground">{$t('system.entities.version_history.by')}</span>&nbsp;
                    <button
                      type="button"
                      class="font-normal text-foreground underline-offset-2 rounded-sm px-0.5 hover:bg-accent hover:underline cursor-pointer"
                      onclick={() => openChangedByRecord(entry)}
                      data-testid={`version-history-actor-${entry.uuid}`}
                    >{getChangedByDisplay(entry)}</button>
                  {/if}
                </Timeline.Title>
                {#if isUpdate}
                  <div class="mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onclick={() => toggleEntryExpanded(entry.uuid)}
                    >
                      <ChevronDown class={cn("size-4 transition-transform", expandedEntries.has(entry.uuid) && "rotate-180")} />
                      <span class="ml-1">{expandedEntries.has(entry.uuid) ? $t('system.entities.version_history.hide_details') : $t('system.entities.version_history.show_details')}</span>
                    </Button>
                  </div>
                {/if}
                <div class="mt-1">
                  {#if isUpdate}
                    {#if expandedEntries.has(entry.uuid)}
                      <div class="space-y-2">
                        {#each descriptions as desc (desc)}
                          {@const delta = desc as {field: string, operator: string, toOperator?: string, oldValue?: string, newValue?: string, isBadge?: boolean, badgeColor?: string, badgeLabelText?: string, badgeLabelKey?: string, oldBadgeColor?: string, oldBadgeLabelText?: string, oldBadgeLabelKey?: string, isColor?: boolean, colorValue?: string, oldColorValue?: string, isJson?: boolean, jsonValue?: unknown, oldJsonValue?: unknown}}
                          <div class="p-2 bg-muted/30 rounded-md border">
                            <div class="text-xs flex flex-wrap items-center gap-1">
                              <span class="font-bold text-foreground">{delta.field}</span>
                              {#if delta.operator}
                                <span class="text-primary">{delta.operator}</span>
                              {/if}
                              {#if delta.oldValue !== undefined}
                                {#if delta.isBadge && delta.oldBadgeColor}
                                  {@const oldBadgeColors = badgeClassesFromToken(delta.oldBadgeColor)}
                                  <Badge
                                    class="shadow-none text-xs"
                                    style="background-color: {oldBadgeColors.bgColor}; color: {oldBadgeColors.textColor}; border-color: {oldBadgeColors.borderColor};"
                                  >
                                    {delta.oldBadgeLabelText || (delta.oldBadgeLabelKey ? $t(delta.oldBadgeLabelKey) : toDisplayString(delta.oldValue))}
                                  </Badge>
                                {:else if delta.isColor && delta.oldColorValue}
                                  <Tooltip.Root>
                                    <Tooltip.Trigger>
                                      <div
                                        class="w-5 h-5 rounded-full border shadow-sm inline-block"
                                        style="background-color: {delta.oldColorValue};"
                                      ></div>
                                    </Tooltip.Trigger>
                                    <Tooltip.Content>
                                      <p>{delta.oldColorValue}</p>
                                    </Tooltip.Content>
                                  </Tooltip.Root>
                                {:else}
                                  <span class="italic text-muted-foreground">{delta.oldValue}</span>
                                {/if}
                              {/if}
                              {#if delta.isJson && delta.oldJsonValue !== undefined}
                                <JsonCodeBlock
                                  code={delta.oldJsonValue}
                                  maxHeight="15rem"
                                  class="w-full mt-1"
                                />
                              {/if}
                              {#if delta.toOperator}
                                <span class="text-primary">{delta.toOperator}</span>
                              {/if}
                              {#if delta.newValue !== undefined}
                                {#if delta.isBadge && delta.badgeColor}
                                  {@const newBadgeColors = badgeClassesFromToken(delta.badgeColor)}
                                  <Badge
                                    class="shadow-none text-xs"
                                    style="background-color: {newBadgeColors.bgColor}; color: {newBadgeColors.textColor}; border-color: {newBadgeColors.borderColor};"
                                  >
                                    {delta.badgeLabelText || (delta.badgeLabelKey ? $t(delta.badgeLabelKey) : toDisplayString(delta.newValue))}
                                  </Badge>
                                {:else if delta.isColor && delta.colorValue}
                                  <Tooltip.Root>
                                    <Tooltip.Trigger>
                                      <div
                                        class="w-5 h-5 rounded-full border shadow-sm inline-block"
                                        style="background-color: {delta.colorValue};"
                                      ></div>
                                    </Tooltip.Trigger>
                                    <Tooltip.Content>
                                      <p>{delta.colorValue}</p>
                                    </Tooltip.Content>
                                  </Tooltip.Root>
                                {:else}
                                  <span class="italic text-muted-foreground">{delta.newValue}</span>
                                {/if}
                              {/if}
                              {#if delta.isJson && delta.jsonValue !== undefined}
                                <JsonCodeBlock
                                  code={delta.jsonValue}
                                  maxHeight="15rem"
                                  class="w-full mt-1"
                                />
                              {/if}
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {:else}
                    <ul class="space-y-1 text-sm text-muted-foreground">
                      {#each descriptions as desc, i (i)}
                        {@const text = desc as string}
                        <li>{text}</li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              </Timeline.Content>
            </Timeline.Item>
          {/each}
        </Timeline.Root>

        {#if versionHistoryHasMore}
          <div class="flex justify-center mt-6">
            <Button
              variant="ghost"
              size="sm"
              onclick={loadMoreVersionHistory}
              disabled={versionHistoryLoading}
            >
              {#if versionHistoryLoading}
                <Hourglass class="size-4 mr-2 animate-spin" />
              {:else}
                <ChevronDown class="size-4 mr-2" />
              {/if}
              {$t('system.entities.version_history.view_more')}
            </Button>
          </div>
        {/if}
      </div>
    {/if}
</SheetPanelLayout>

