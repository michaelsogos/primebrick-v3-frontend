<script lang="ts">
  import { t } from '$lib/i18n';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Switch } from '$lib/components/ui/switch';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';

  let { builder }: { builder: ReturnType<typeof useTypeConfigBuilder> } = $props();

  let previewOpen = $state(true);

  // Local editable copy of rawJson (builder.state is readonly)
  let rawJsonInput = $state('');
  $effect(() => {
    rawJsonInput = builder.state.rawJson;
  });

  const placeholderJson = '{"validation":{"required":true,"rules":{}}}';
</script>

<div class="space-y-3 border-t pt-4">
  <!-- Advanced mode toggle — unified switch pattern -->
  <div class="space-y-2">
    <div class="flex items-center gap-3">
      <Switch
        id="tcb-advanced"
        checked={builder.state.advancedMode}
        onCheckedChange={(checked) => builder.setAdvancedMode(checked)}
        data-testid="tcb-advanced"
      />
      <span class="text-sm font-medium leading-none">
        {$t('config.typeConfig.advancedMode')}
      </span>
    </div>
    <p class="text-xs text-muted-foreground">{$t('config.typeConfig.advancedModeHelp')}</p>
  </div>

  {#if builder.state.advancedMode}
    <!-- Raw JSON editor -->
    <div class="space-y-1">
      <Textarea
        bind:value={rawJsonInput}
        oninput={() => builder.setRawJson(rawJsonInput)}
        rows={8}
        class="font-mono text-xs"
        placeholder={placeholderJson}
        data-testid="tcb-raw-json"
      />
      {#if builder.state.rawJsonError}
        <p class="text-destructive text-xs" data-testid="tcb-raw-json-error">{builder.state.rawJsonError}</p>
      {/if}
    </div>
  {:else}
    <!-- Read-only JSON preview -->
    <div class="space-y-1">
      <button
        type="button"
        class="text-xs text-muted-foreground hover:text-foreground"
        onclick={() => (previewOpen = !previewOpen)}
        data-testid="tcb-preview-toggle"
      >
        {previewOpen ? '▼' : '▶'} {$t('config.typeConfig.jsonPreview')}
      </button>
      {#if previewOpen}
        <pre class="rounded-md bg-muted p-3 text-xs font-mono overflow-auto max-h-48" data-testid="tcb-json-preview">{builder.json}</pre>
      {/if}
    </div>
  {/if}
</div>
