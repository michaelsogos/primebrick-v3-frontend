<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Alert from '$lib/components/ui/alert';
  import { Badge } from '$lib/components/ui/badge';
  import * as Sheet from '$lib/components/ui/sheet';
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { appErrors, clearAppErrors } from '$lib/errors/app-errors';
  import { cn } from '$lib/utils';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import SheetHeader from '$lib/shell/sheets/SheetHeader.svelte';
  import { CircleAlert, TriangleAlert, ThumbsUp, Info, Trash2 } from 'lucide-svelte';
  import XIcon from '@lucide/svelte/icons/x';

  type ImpactLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

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

  function impactIcon(i: ImpactLevel) {
    switch (i) {
      case 'CRITICAL':
      case 'HIGH':
        return CircleAlert;
      case 'MEDIUM':
        return TriangleAlert;
      case 'LOW':
        return Info;
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
          {@const Icon = impactIcon(imp)}
          <Alert.Root variant={impactToAlertVariant(imp)} class="justify-between gap-2">
            <Icon class="shrink-0" strokeWidth={2} aria-hidden="true" />
            <div class="min-w-0 flex-1 space-y-1">
              {#if (e as any).scopeKey || e.scope}
                <div class="text-[11px] font-medium leading-tight text-inherit opacity-80">
                  {(e as any).scopeKey ? $t((e as any).scopeKey) : e.scope}
                </div>
              {/if}
              <Alert.Title class="text-sm">
                {(e as any).messageKey
                  ? $t((e as any).messageKey)
                  : ((e as any).message ?? e.message)}
              </Alert.Title>
              {#if (e as any).tags?.length}
                <div class="mt-1 flex flex-wrap gap-1">
                  {#each (e as any).tags as tag (tag.label)}
                    <Badge
                      variant="outline"
                      class={cn(
                        'h-auto border px-1.5 py-0.5 text-[10px] font-medium',
                        errorTagBadgeClass(tag.tone)
                      )}
                    >
                      {tag.label}
                    </Badge>
                  {/each}
                </div>
              {/if}
              {#if e.detail}
                <Alert.Description class="text-xs whitespace-pre-wrap">{e.detail}</Alert.Description>
              {/if}
            </div>
            <div class="shrink-0 text-[11px] text-inherit opacity-70">
              {formatUiDateTime(e.createdAt, $uiLang)}
            </div>
          </Alert.Root>
        {/each}
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

