<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { shellNav, loadShellNav } from '$lib/shell/modules-shell.svelte';
  import { TriangleAlert, AlertCircle } from 'lucide-svelte';
</script>

{#if shellNav.unreachable}
  <div
    role="alert"
    class="flex shrink-0 items-center gap-2 border-b border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:px-4"
  >
    <TriangleAlert class="size-5 shrink-0 opacity-90" aria-hidden="true" />
    <span class="min-w-0 flex-1 font-medium leading-snug">{$t('shell.serverUnreachable')}</span>
    <Button type="button" variant="outline" size="sm" class="shrink-0 border-destructive/40" onclick={() => loadShellNav()}>
      {$t('shell.retry')}
    </Button>
  </div>
{:else if shellNav.error}
  <div
    role="alert"
    class="flex shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground sm:px-4"
  >
    <AlertCircle class="size-5 shrink-0 opacity-90" aria-hidden="true" />
    <span class="min-w-0 flex-1 font-medium leading-snug">{$t('shell.modulesLoadFailed')}</span>
    <Button type="button" variant="outline" size="sm" class="shrink-0" onclick={() => loadShellNav()}>
      {$t('shell.retry')}
    </Button>
  </div>
{/if}
