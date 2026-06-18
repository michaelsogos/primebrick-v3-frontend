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
      <!-- Cloud icon (static) -->
      <Cloud class="size-20 text-info" />
      <!-- Refresh arrows (rotating) -->
      <RefreshCw class="absolute inset-0 m-auto size-8 text-info animate-spin opacity-70" />
    </div>
    <div class="text-sm font-medium text-muted-foreground">{displayText}</div>
  </div>
</div>
