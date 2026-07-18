<script lang="ts">
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import Cloud from '@lucide/svelte/icons/cloud';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  
  let {
    entityName,
    loadingText
  }: MetadataLoadingProps = $props();
  
  type MetadataLoadingProps = {
    entityName?: string;
    loadingText?: string;
  };
  
  const displayText = $derived(
    loadingText || (entityName ? get(t)('metadata.loading.entity', { entity: entityName }) : get(t)('metadata.loading.default'))
  );
</script>

<div class="grid h-full place-items-center p-3">
  <div class="relative flex flex-col items-center gap-2 text-center">
    <div class="relative">
      <!-- Cloud icon (static, opacity fade) -->
      <div class="pb-watermark-fade">
        <Cloud class="size-20 text-info" />
      </div>
      <!-- Refresh arrows (rotating) -->
      <div class="absolute inset-0 m-auto flex size-6 -translate-x-0.5 translate-y-1 items-center justify-center">
        <RefreshCw class="size-6 text-info animate-spin opacity-70" />
      </div>
    </div>
    <div class="text-sm font-medium text-muted-foreground">{displayText}</div>
  </div>
</div>
