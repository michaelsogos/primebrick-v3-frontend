<script lang="ts">
  /**
   * RemotePageErrorPanel — in-content failure panel for remote page delivery.
   * Shared by `RemotePageMount` (chunk load failures) and route shims (route
   * declaration / census resolution failures). Always renders inside the
   * content area — the surrounding app shell is never replaced.
   */
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { CloudOff } from '@primebrick/ui/vendor/lucide';
  import { TriangleAlert } from '@primebrick/ui/vendor/lucide';
  import { RefreshCw } from '@primebrick/ui/vendor/lucide';
  import type { RemoteErrorKind } from './remote-loader';

  let {
    kind,
    status = null,
    detail = null,
    on_retry = undefined,
  }: {
    kind: RemoteErrorKind;
    status?: number | null;
    detail?: string | null;
    on_retry?: (() => void) | undefined;
  } = $props();
</script>

<div
  class="flex flex-1 flex-col items-center justify-center p-6"
  data-testid="remote-page-error"
  data-error-kind={kind}
>
  <div class="mx-4 flex max-w-lg flex-col items-center text-center">
    {#if kind === 'network'}
      <CloudOff class="size-10 text-muted-foreground/60" />
    {:else}
      <TriangleAlert class="size-10 text-muted-foreground/60" />
    {/if}
    <h2 class="mt-4 text-base font-normal" data-testid="remote-page-error-title">
      {$t('app.remote_page.error.title')}
    </h2>
    <p class="mt-2 text-sm text-muted-foreground" data-testid="remote-page-error-message">
      {$t(`app.remote_page.error.${kind}`)}
    </p>
    {#if detail}
      <p class="mt-3 font-mono text-xs text-muted-foreground/70" data-testid="remote-page-error-detail">
        {#if status != null}HTTP {status} — {/if}{detail}
      </p>
    {/if}
    {#if on_retry}
      <Button
        variant="outline"
        size="sm"
        class="mt-6"
        data-testid="remote-page-retry"
        onclick={on_retry}
      >
        <RefreshCw class="size-3.5" />
        {$t('app.remote_page.retry')}
      </Button>
    {/if}
  </div>
</div>
