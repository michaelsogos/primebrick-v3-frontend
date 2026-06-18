<script lang="ts">
  import type { Snippet } from 'svelte';
  import AppPageScaffold from './AppPageScaffold.svelte';
  import AppPageBreadcrumb from './AppPageBreadcrumb.svelte';
  import type { AppBreadcrumbSegment } from '$lib/breadcrumb/types';

  let {
    segments,
    title,
    actions,
    children
  }: {
    segments: AppBreadcrumbSegment[];
    title?: Snippet;
    actions?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="flex items-end justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <AppPageBreadcrumb {segments} />
        {#if title}
          {@render title()}
        {/if}
      </div>

      {#if actions}
        <div class="flex shrink-0 items-center justify-end gap-2">
          {@render actions()}
        </div>
      {/if}
    </div>
  {/snippet}

  {#if children}
    {@render children()}
  {/if}
</AppPageScaffold>
