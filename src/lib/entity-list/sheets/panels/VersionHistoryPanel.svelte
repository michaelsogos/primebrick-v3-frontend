<script lang="ts">
  import { apiFetch } from "$lib/api";
  import { t, formatUiDateTime } from "$lib/i18n";
  import { uiLang } from "$lib/i18n/store.svelte";
  import { closeSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import SheetHeader from "$lib/shell/sheets/SheetHeader.svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import XIcon from "@lucide/svelte/icons/x";
  import { Hourglass, CircleX, Info, ChevronDown, CheckCircle, AlertCircle, AlertTriangle } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { badgeClassesFromToken } from "$lib/colors/badge";
  import { cn } from "$lib/utils";
  import * as Timeline from "$lib/components/ui/timeline";

  interface $$Props {
    entity: string;
    rowUuid: string;
    columns?: any[];
  }

  let {
    entity,
    rowUuid,
    columns = [],
  }: $$Props = $props();

  let versionHistoryData = $state<any[]>([]);
  let versionHistoryLoading = $state<boolean>(false);
  let versionHistoryError = $state<string | null>(null);
  let versionHistoryPage = $state<number>(1);
  let versionHistoryLimit = $state<number>(50);
  let versionHistoryTotal = $state<number>(0);
  let versionHistoryHasMore = $state<boolean>(false);

  async function loadVersionHistory() {
    versionHistoryLoading = true;
    versionHistoryError = null;
    versionHistoryPage = 1;
    versionHistoryData = [];

    try {
      const res = await apiFetch(`/api/v1/entities/${entity}/${rowUuid}/audit?page=${versionHistoryPage}&limit=${versionHistoryLimit}`);

      if (!res.ok) {
        throw new Error('Failed to load version history');
      }

      const data = await res.json();
      versionHistoryData = data.data || [];
      versionHistoryTotal = data.pagination?.total || 0;
      versionHistoryHasMore = data.pagination?.hasMore || false;
    } catch (e) {
      versionHistoryError = $t('entities.customer.versionHistory.error');
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
      const res = await apiFetch(`/api/v1/entities/${entity}/${rowUuid}/audit?page=${versionHistoryPage}&limit=${versionHistoryLimit}`);

      if (!res.ok) {
        throw new Error('Failed to load version history');
      }

      const data = await res.json();
      versionHistoryData = [...versionHistoryData, ...(data.data || [])];
      versionHistoryHasMore = data.pagination?.hasMore || false;
    } catch (e) {
      versionHistoryError = $t('entities.customer.versionHistory.error');
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
    } else if (actionLower === 'create' || actionLower === 'insert') {
      return 'text-emerald-600 dark:text-emerald-400';
    } else if (actionLower === 'restore') {
      return 'text-amber-600 dark:text-amber-400';
    } else if (actionLower === 'update') {
      return 'text-sky-600 dark:text-sky-400';
    }
    return 'text-foreground';
  }

  function getAuditActionIcon(action: string) {
    const actionLower = action.toLowerCase();
    if (actionLower === 'hard_delete') {
      return CircleX;
    } else if (actionLower === 'delete' || actionLower === 'soft_delete') {
      return AlertCircle;
    } else if (actionLower === 'create' || actionLower === 'insert') {
      return CheckCircle;
    } else if (actionLower === 'restore') {
      return AlertTriangle;
    } else if (actionLower === 'update') {
      return Info;
    }
    return Info;
  }

  function getAuditActionLabel(action: string): string {
    const key = `entities.customer.versionHistory.actions.${action.toUpperCase()}`;
    const translated = $t(key);
    return translated === key ? action : translated;
  }

  function formatAuditDelta(delta: Record<string, any>): Array<{
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
    oldBadgeLabelKey?: string
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
      oldBadgeLabelKey?: string
    }> = [];

    for (const [field, change] of Object.entries(delta)) {
      if (field === 'version') continue; // Skip version field

      const fieldLabel = $t(`entities.customer.versionHistory.field.${field}`) || field;
      const oldValue = change.from || change.old;
      const newValue = change.to || change.new;

      // Check if this is a badge field using column metadata
      const column = columns.find((c: any) => c.key === field);
      const isBadge = column?.type === 'badge' && column?.badge?.values;

      let badgeColor: string | undefined;
      let badgeLabelText: string | undefined;
      let badgeLabelKey: string | undefined;
      let oldBadgeColor: string | undefined;
      let oldBadgeLabelText: string | undefined;
      let oldBadgeLabelKey: string | undefined;

      if (isBadge) {
        if (newValue) {
          const newBadgeConfig = column.badge.values[newValue as string];
          badgeColor = newBadgeConfig?.color;
          badgeLabelText = newBadgeConfig?.labelText;
          badgeLabelKey = newBadgeConfig?.labelKey;
        }
        if (oldValue) {
          const oldBadgeConfig = column.badge.values[oldValue as string];
          oldBadgeColor = oldBadgeConfig?.color;
          oldBadgeLabelText = oldBadgeConfig?.labelText;
          oldBadgeLabelKey = oldBadgeConfig?.labelKey;
        }
      }

      if (oldValue === null && newValue !== null) {
        descriptions.push({
          field: fieldLabel,
          operator: $t('entities.customer.versionHistory.set'),
          newValue: String(newValue),
          isBadge,
          badgeColor,
          badgeLabelText,
          badgeLabelKey
        });
      } else if (oldValue !== null && newValue === null) {
        descriptions.push({
          field: fieldLabel,
          operator: $t('entities.customer.versionHistory.cleared'),
          isBadge
        });
      } else if (oldValue !== newValue) {
        descriptions.push({
          field: fieldLabel,
          operator: $t('entities.customer.versionHistory.changedFrom'),
          toOperator: $t('entities.customer.versionHistory.to'),
          oldValue: String(oldValue),
          newValue: String(newValue),
          isBadge,
          badgeColor,
          badgeLabelText,
          badgeLabelKey,
          oldBadgeColor,
          oldBadgeLabelText,
          oldBadgeLabelKey
        });
      }
    }

    return descriptions;
  }

  // Load data on mount
  $effect(() => {
    loadVersionHistory();
  });
</script>

{#snippet headerActions()}
  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t("common.done")}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}

{#snippet headerTitle()}
  {$t('entities.customer.versionHistory.title')}
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="min-h-0 flex-1 overflow-auto p-2">
    {#if versionHistoryLoading && versionHistoryData.length === 0}
      <div class="grid h-full place-items-center p-3">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-empty">
            <Hourglass class="size-20 text-info animate-spin" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{$t('entities.customer.versionHistory.loading')}</div>
        </div>
      </div>
    {:else if versionHistoryError}
      <div class="grid h-full place-items-center p-3">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-empty">
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
          <div class="text-sm font-medium text-muted-foreground">{$t('entities.customer.versionHistory.empty')}</div>
        </div>
      </div>
    {:else}
      <div class="p-4">
        <Timeline.Root>
          {#each versionHistoryData as entry (entry.id)}
            {@const colorClass = getAuditActionColorClass(entry.action)}
            {@const ActionIcon = getAuditActionIcon(entry.action)}
            {@const isUpdate = entry.action === 'UPDATE' || entry.action === 'CREATE' || entry.action === 'INSERT' || entry.action === 'SOFT_DELETE' || entry.action === 'DELETE' || entry.action === 'RESTORE'}
            {@const descriptions = entry.action === 'HARD_DELETE' ? [$t('entities.customer.versionHistory.recordHardDeleted')]
              : formatAuditDelta(entry.delta)}

            <Timeline.Item>
              <Timeline.Separator>
                <ActionIcon class={cn("size-4", colorClass)} />
              </Timeline.Separator>
              <Timeline.Content>
                <div class="flex items-center gap-2">
                  <Badge class={cn("text-xs font-semibold", colorClass)} variant="outline">
                    v{entry.version}
                  </Badge>
                  <Timeline.Date>{formatUiDateTime(entry.changed_at, $uiLang)}</Timeline.Date>
                </div>
                <Timeline.Title class={colorClass}>
                  {getAuditActionLabel(entry.action)} {#if entry.changed_by}({entry.changed_by}){/if}
                </Timeline.Title>
                <div class="mt-1">
                  {#if isUpdate}
                    <div class="space-y-2">
                      {#each descriptions as desc}
                        {@const delta = desc as {field: string, operator: string, toOperator?: string, oldValue?: string, newValue?: string, isBadge?: boolean, badgeColor?: string, badgeLabelText?: string, badgeLabelKey?: string, oldBadgeColor?: string, oldBadgeLabelText?: string, oldBadgeLabelKey?: string}}
                        <div class="flex items-center gap-2 p-2 bg-muted/30 rounded-md border">
                          <div class="flex-1 min-w-0">
                            <div class="text-xs flex flex-wrap items-center gap-1">
                              <span class="font-bold text-foreground">{delta.field}</span>
                              <span class="text-primary">{delta.operator}</span>
                              {#if delta.oldValue !== undefined}
                                {#if delta.isBadge && delta.oldBadgeColor}
                                  {@const oldBadgeColors = badgeClassesFromToken(delta.oldBadgeColor)}
                                  <Badge
                                    class="shadow-none text-xs"
                                    style="background-color: {oldBadgeColors.bgColor}; color: {oldBadgeColors.textColor}; border-color: {oldBadgeColors.borderColor};"
                                  >
                                    {delta.oldBadgeLabelText || $t(delta.oldBadgeLabelKey || `entities.customer.status.${delta.oldValue}`)}
                                  </Badge>
                                {:else}
                                  <span class="italic text-muted-foreground">{delta.oldValue}</span>
                                {/if}
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
                                    {delta.badgeLabelText || $t(delta.badgeLabelKey || `entities.customer.status.${delta.newValue}`)}
                                  </Badge>
                                {:else}
                                  <span class="italic text-muted-foreground">{delta.newValue}</span>
                                {/if}
                              {/if}
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <ul class="space-y-1 text-sm text-muted-foreground">
                      {#each descriptions as desc}
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
              {$t('entities.customer.versionHistory.viewMore')}
            </Button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes pb-watermark-pulse {
    0%,
    100% {
      opacity: 0.12;
      transform: translateY(0) scale(1);
    }
    50% {
      opacity: 0.22;
      transform: translateY(-6px) scale(1.06);
    }
  }

  .pb-watermark-empty {
    transform-origin: center;
    animation: pb-watermark-pulse 2.6s ease-in-out infinite;
  }
</style>
