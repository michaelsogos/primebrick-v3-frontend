<script lang="ts">
  import { apiFetch } from "$lib/api";
  import { t } from "$lib/i18n";
  import { closeSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import SheetHeader from "$lib/shell/sheets/SheetHeader.svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import XIcon from "@lucide/svelte/icons/x";
  import { Hourglass, CircleX, Info, ChevronDown, CheckCircle, Trash2, RefreshCw, Pencil } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
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
      const oldValue = change.old;
      const newValue = change.new;

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
  {$t('entities.customer.versionHistory.title')} - {rowUuid}
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="flex-1 overflow-y-auto p-4">
    {#if versionHistoryLoading && versionHistoryData.length === 0}
      <div class="flex items-center justify-center py-12">
        <div class="text-center">
          <Hourglass class="size-8 mx-auto mb-3 text-muted-foreground animate-spin" />
          <p class="text-muted-foreground">{$t('entities.customer.versionHistory.loading')}</p>
        </div>
      </div>
    {:else if versionHistoryError}
      <div class="flex items-center justify-center py-12">
        <div class="text-center">
          <CircleX class="size-8 mx-auto mb-3 text-destructive" />
          <p class="text-destructive">{versionHistoryError}</p>
        </div>
      </div>
    {:else if versionHistoryData.length === 0}
      <div class="flex items-center justify-center py-12">
        <div class="text-center">
          <Info class="size-8 mx-auto mb-3 text-muted-foreground" />
          <p class="text-muted-foreground">{$t('entities.customer.versionHistory.empty')}</p>
        </div>
      </div>
    {:else}
      <Timeline.Root class="relative">
        {#each versionHistoryData as entry (entry.id)}
          {@const colorClass = getAuditActionColorClass(entry.action)}
          {@const ActionIcon = getAuditActionIcon(entry.action)}
          {@const descriptions = entry.action === 'CREATE' ? [$t('entities.customer.versionHistory.recordCreated')]
            : entry.action === 'DELETE' ? [$t('entities.customer.versionHistory.recordDeleted')]
            : entry.action === 'RESTORE' ? [$t('entities.customer.versionHistory.recordRestored')]
            : formatAuditDelta(entry.delta)}

          <Timeline.Item class="mb-8">
            <Timeline.Separator class={colorClass}>
              <ActionIcon class="size-4" />
            </Timeline.Separator>
            <Timeline.Title class={colorClass}>
              {getAuditActionLabel(entry.action)} - {entry.changed_at}
            </Timeline.Title>
            <Timeline.Date class="text-muted-foreground">
              v{entry.version}
            </Timeline.Date>
            <Timeline.Content>
              <ul class="space-y-1 text-sm">
                {#each descriptions as desc}
                  <li class="text-muted-foreground">{desc}</li>
                {/each}
              </ul>
            </Timeline.Content>
          </Timeline.Item>
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
      </Timeline.Root>
    {/if}
  </div>
</div>
