<script lang="ts">
  import { Hourglass } from 'lucide-svelte';

  let {
    metaLoading,
    metaLoadingView,
    loadingText
  }: EntityListTableLoadingProps = $props();

  type EntityListTableLoadingProps = {
    metaLoading: boolean;
    metaLoadingView?: (() => void) | null;
    loadingText: string;
  };
</script>

{#if metaLoading}
  {#if metaLoadingView}
    {@render metaLoadingView()}
  {:else}
    <div class="grid h-full place-items-center p-3">
      <div class="relative flex flex-col items-center gap-2 text-center">
        <div class="pb-watermark-loading">
          <Hourglass class="size-20 text-info" />
        </div>
        <div class="text-sm font-medium text-muted-foreground">{loadingText}</div>
      </div>
    </div>
  {/if}
{/if}
