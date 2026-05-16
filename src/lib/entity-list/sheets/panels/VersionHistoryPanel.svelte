<script lang="ts">
  import { apiFetch } from "$lib/api";
  import { t } from "$lib/i18n";
  import { closeSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import SheetHeader from "$lib/shell/sheets/SheetHeader.svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import XIcon from "@lucide/svelte/icons/x";
  import { Hourglass, CircleX, Info, ChevronDown, CheckCircle, Trash2, RefreshCw, Pencil } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";
  import * as Timeline from "$lib/components/ui/timeline";

  interface $$Props {
    entity: string;
    rowUuid: string;
  }

  let {
    entity,
    rowUuid,
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
    if (actionLower === 'delete' || actionLower === 'soft_delete' || actionLower === 'hard_reset') {
      return 'bg-destructive text-destructive-foreground';
    } else if (actionLower === 'create' || actionLower === 'insert') {
      return 'bg-success text-success-foreground';
    } else if (actionLower === 'restore') {
      return 'bg-warning text-warning-foreground';
    } else if (actionLower === 'update') {
      return 'bg-info text-info-foreground';
    }
    return 'bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900';
  }

  function getAuditActionIcon(action: string) {
    const actionLower = action.toLowerCase();
    if (actionLower === 'delete' || actionLower === 'soft_delete' || actionLower === 'hard_reset') {
      return Trash2;
    } else if (actionLower === 'create' || actionLower === 'insert') {
      return CheckCircle;
    } else if (actionLower === 'restore') {
      return RefreshCw;
    } else if (actionLower === 'update') {
      return Pencil;
    }
    return Info;
  }

  function getAuditActionLabel(action: string): string {
    const actionLower = action.toLowerCase();
    if (actionLower === 'delete' || actionLower === 'soft_delete') {
      return $t('entities.customer.versionHistory.actionDelete');
    } else if (actionLower === 'hard_reset') {
      return $t('entities.customer.versionHistory.actionHardReset');
    } else if (actionLower === 'create' || actionLower === 'insert') {
      return $t('entities.customer.versionHistory.actionCreate');
    } else if (actionLower === 'restore') {
      return $t('entities.customer.versionHistory.actionRestore');
    } else if (actionLower === 'update') {
      return $t('entities.customer.versionHistory.actionUpdate');
    }
    return action;
  }

  function formatAuditDelta(delta: Record<string, any>): string[] {
    const descriptions: string[] = [];

    for (const [field, change] of Object.entries(delta)) {
      if (field === 'version') continue; // Skip version field

      const fieldLabel = $t(`entities.customer.versionHistory.field.${field}`) || field;
      const oldValue = change.from;
      const newValue = change.to;

      if (oldValue === null && newValue !== null) {
        descriptions.push(`${fieldLabel}: ${$t('entities.customer.versionHistory.set')} ${newValue}`);
      } else if (oldValue !== null && newValue === null) {
        descriptions.push(`${fieldLabel}: ${$t('entities.customer.versionHistory.cleared')}`);
      } else if (oldValue !== newValue) {
        descriptions.push(`${fieldLabel}: ${$t('entities.customer.versionHistory.changedFrom')} ${oldValue} ${$t('entities.customer.versionHistory.to')} ${newValue}`);
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
      <div class="space-y-6 p-4">
        {#each versionHistoryData as entry (entry.id)}
          {@const isFirst = entry === versionHistoryData[0]}
          {@const descriptions = entry.action === 'CREATE' ? [$t('entities.customer.versionHistory.recordCreated')]
            : entry.action === 'DELETE' ? [$t('entities.customer.versionHistory.recordDeleted')]
            : entry.action === 'RESTORE' ? [$t('entities.customer.versionHistory.recordRestored')]
            : formatAuditDelta(entry.delta)}

          <div class="flex gap-4">
            <div class="flex flex-col items-center">
              <div class={cn(
                "w-3 h-3 rounded-full border-2",
                isFirst ? "bg-sky-500 border-sky-500" : "bg-neutral-300 border-neutral-300 dark:bg-neutral-600 dark:border-neutral-600"
              )}></div>
              {#if entry !== versionHistoryData[versionHistoryData.length - 1]}
                <div class="w-0.5 flex-1 bg-neutral-200 dark:bg-neutral-700 my-2"></div>
              {/if}
            </div>
            <div class="flex-1 pb-4">
              <div class="text-sm text-muted-foreground mb-1">{entry.changed_at}</div>
              <div class="font-semibold text-foreground mb-2">{getAuditActionLabel(entry.action)}</div>
              <ul class="space-y-1 text-sm text-muted-foreground">
                {#each descriptions as desc}
                  <li>{desc}</li>
                {/each}
              </ul>
            </div>
          </div>
        {/each}

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
