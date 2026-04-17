<script lang="ts">
  import { appToasts } from '$lib/errors/app-errors';
  import { t } from '$lib/i18n';

  type Toast = {
    id: string;
    impact?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    messageKey?: string;
    message?: string;
    scopeKey?: string;
    scope?: string;
    createdAt: number;
  };

  function impactBorderClass(i: Toast['impact']): string {
    switch (i) {
      case 'CRITICAL':
        return 'border-red-500/30';
      case 'HIGH':
        return 'border-amber-500/30';
      case 'MEDIUM':
        return 'border-sky-500/25';
      case 'LOW':
        return 'border-emerald-500/25';
      default:
        return 'border-border';
    }
  }

  const fmt = $derived((toast: Toast) => {
    return {
      scope: toast.scopeKey ? $t(toast.scopeKey) : toast.scope,
      message: toast.messageKey ? $t(toast.messageKey) : toast.message ?? ''
    };
  });
</script>

<div class="pointer-events-none fixed bottom-4 right-4 z-[70] flex max-w-sm flex-col gap-2">
  {#each ($appToasts as unknown as Toast[]) as t (t.id)}
    <div class={`pointer-events-auto rounded-md border bg-background/95 p-3 shadow-lg backdrop-blur ${impactBorderClass(t.impact)}`}>
      {#if t.scopeKey || t.scope}
        <div class="text-[11px] font-medium text-muted-foreground">{fmt(t).scope}</div>
      {/if}
      <div class="text-sm font-medium text-foreground">{fmt(t).message}</div>
    </div>
  {/each}
</div>

