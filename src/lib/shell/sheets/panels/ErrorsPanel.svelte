<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as EventCard from '$lib/components/ui/event-card';
  import * as Sheet from '$lib/components/ui/sheet';
  import BorderedDialog from '$lib/components/ui/dialog-bordered.svelte';
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { appErrors, clearAppErrors } from '$lib/errors/app-errors';
  import { cn } from '$lib/utils';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { ThumbsUp, Trash2, Eye } from 'lucide-svelte';
  import XIcon from '@lucide/svelte/icons/x';

  type ImpactLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  let errorDetailsDialogOpen = $state(false);
  let selectedErrorDetails = $state<Record<string, any> | null>(null);
  let selectedErrorColor = $state<'critical' | 'error' | 'warning' | 'info'>('info');

  function openErrorDetails(e: Record<string, any>, color: 'critical' | 'error' | 'warning' | 'info') {
    selectedErrorDetails = e;
    selectedErrorColor = color;
    errorDetailsDialogOpen = true;
  }

  function closeErrorDetails() {
    errorDetailsDialogOpen = false;
    selectedErrorDetails = null;
  }

  function hasExtraFields(e: Record<string, any>): boolean {
    const baseFields = ['id', 'impact', 'message', 'messageKey', 'scope', 'scopeKey', 'tags', 'instance', 'internalCode', 'internal_code', 'detail', 'createdAt', 'toast', 'type', 'title', 'status', 'severity'];
    const extraKeys = Object.keys(e).filter(key => !baseFields.includes(key));
    return extraKeys.length > 0;
  }

  function errorTagBadgeClass(tone: string | undefined) {
    switch (tone) {
      case 'danger':
        return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
      case 'warning':
        return 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200';
      case 'info':
        return 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300';
      case 'success':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      default:
        return 'border-border/60 bg-muted/30 text-muted-foreground';
    }
  }

  function impactToAlertVariant(
    i: ImpactLevel
  ): 'impactCritical' | 'impactHigh' | 'impactMedium' | 'impactLow' {
    switch (i) {
      case 'CRITICAL':
        return 'impactCritical';
      case 'HIGH':
        return 'impactHigh';
      case 'MEDIUM':
        return 'impactMedium';
      case 'LOW':
        return 'impactLow';
    }
  }

  function impactToEventColor(i: ImpactLevel): 'critical' | 'error' | 'warning' | 'info' {
    switch (i) {
      case 'CRITICAL':
        return 'critical';
      case 'HIGH':
        return 'error';
      case 'MEDIUM':
        return 'warning';
      case 'LOW':
        return 'info';
    }
  }
</script>

{#snippet headerTitle()}
  {$t('shell.errors.title')}
{/snippet}

{#snippet headerActions()}
  <Button
    variant="ghost"
    size="icon"
    class="h-8 w-8"
    disabled={$appErrors.length === 0}
    onclick={() => clearAppErrors()}
    aria-label={$t('shell.errors.clear')}
    title={$t('shell.errors.clear')}
  >
    <Trash2 class="size-4" />
  </Button>

  <Sheet.Close
    class="ring-offset-background focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
    title={$t('shell.errors.close')}
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}

<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />

  <div class="min-h-0 flex-1 overflow-auto p-2">
    {#if $appErrors.length === 0}
      <div class="grid h-full place-items-center p-3">
        <div class="relative flex flex-col items-center gap-2 text-center">
          <div class="pb-watermark-empty">
            <ThumbsUp class="size-20 text-info" />
          </div>
          <div class="text-sm font-medium text-muted-foreground">{$t('shell.errors.empty')}</div>
        </div>
      </div>
    {:else}
      <div class="space-y-2">
        {#each $appErrors as e (e.id)}
          {@const imp = ((e as any).impact ?? 'MEDIUM') as ImpactLevel}
          {@const eventColor = impactToEventColor(imp)}
          {@const labelKey =
            imp === 'CRITICAL'
              ? 'impact.criticalError'
              : imp === 'HIGH'
                ? 'impact.error'
                : imp === 'MEDIUM'
                  ? 'impact.warning'
                  : 'impact.information'}

          <EventCard.Root eventColor={eventColor}>
            <EventCard.Label eventColor={eventColor}>{$t(labelKey)}</EventCard.Label>

            {#if (e as any).scopeKey || e.scope}
              <EventCard.Title class="truncate">
                {(e as any).scopeKey ? $t((e as any).scopeKey) : e.scope}
              </EventCard.Title>
            {/if}

            <EventCard.Message>
              {(e as any).messageKey
                ? $t((e as any).messageKey)
                : ((e as any).message ?? e.message)}
            </EventCard.Message>

            {#if (e as any).tags?.length}
              <div class="mt-1 flex flex-wrap gap-1">
                {#each (e as any).tags as tag (tag.label)}
                  <Badge
                    variant="outline"
                    class={cn('h-auto border px-1.5 py-0.5 text-[10px] font-medium', errorTagBadgeClass(tag.tone))}
                  >
                    {tag.label}
                  </Badge>
                {/each}
              </div>
            {/if}

            {#if (e as any).instance || (e as any).internalCode}
              <div class="mt-1 flex flex-wrap gap-1">
                {#if (e as any).internalCode}
                  <Badge
                    variant="outline"
                    class="h-auto border px-1.5 py-0.5 text-[10px] font-medium"
                  >
                    {(e as any).internalCode}
                  </Badge>
                {/if}
                {#if (e as any).instance}
                  <Badge
                    variant="outline"
                    class="h-auto border px-1.5 py-0.5 text-[10px] font-medium"
                  >
                    {(e as any).instance}
                  </Badge>
                {/if}
              </div>
            {/if}

            {#if e.detail}
              <EventCard.Message class="text-xs">{e.detail}</EventCard.Message>
            {/if}

            <div class="mt-2 flex items-center justify-between gap-2">
              <EventCard.Time>{formatUiDateTime(e.createdAt, $uiLang)}</EventCard.Time>
              {#if hasExtraFields(e)}
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onclick={() => openErrorDetails(e, eventColor)}
                >
                  <Eye class="mr-1 size-3" />
                  {$t('shell.errors.viewDetails')}
                </Button>
              {/if}
            </div>
          </EventCard.Root>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Error details fullscreen dialog -->
<BorderedDialog bind:open={errorDetailsDialogOpen} color="destructive" class="!w-[95vw] !max-w-none !max-h-none !p-0 flex flex-col">
  <div class="flex flex-col h-full">
    <div class="p-4 pb-2">
      <h2 class="text-lg font-semibold">{$t('shell.errors.errorDetails')}</h2>
    </div>

    {#if selectedErrorDetails}
      <div class="flex-1 overflow-auto p-4 pt-0">
        <pre class="text-xs bg-muted p-4 rounded-lg overflow-auto">{JSON.stringify(selectedErrorDetails, null, 2)}</pre>
      </div>
    {/if}

    <div class="p-4 pt-2 flex justify-end gap-2">
      <Button variant="secondary" onclick={closeErrorDetails}>{$t('common.close')}</Button>
    </div>
  </div>
</BorderedDialog>

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

