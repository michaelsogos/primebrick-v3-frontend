<script lang="ts">
  import { t } from '$lib/i18n';
  import { JsonCodeBlock, JsonEditor } from '$lib/components/ui/json-code-block';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Eye from '@lucide/svelte/icons/eye';
  import type { useTypeConfigBuilder } from '$lib/config/type-config-builder.svelte';

  let { builder }: { builder: ReturnType<typeof useTypeConfigBuilder> } = $props();

  let previewOpen = $state(true);

  // The editor works on PRETTY JSON; the builder keeps the compact
  // storage serialization (type_config is emitted verbatim in advanced mode).
  // svelte-ignore state_referenced_locally — seed only; kept in sync by
  // toggleAdvanced on mode entry, never re-read upstream afterwards.
  let rawJsonInput = $state(
    builder.state.advancedMode ? prettyJson(builder.json) : ''
  );

  function prettyJson(json: string): string {
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json;
    }
  }

  function compactJson(json: string): string {
    try {
      return JSON.stringify(JSON.parse(json));
    } catch {
      return json;
    }
  }

  function setAdvanced(next: boolean) {
    builder.setAdvancedMode(next);
    // Seed from builder.json (preview's source) — includes auto-generated
    // error_label_key entries, so editor and preview show the same truth.
    if (next) rawJsonInput = prettyJson(builder.json);
  }

  const placeholderJson = '{"validation":{"required":true,"rules":{}}}';

  // Pretty-printed view of builder.json (compact storage format → indented preview).
  // Falls back to the raw string when the JSON can't be parsed.
  const previewJson = $derived.by(() => {
    try {
      return JSON.parse(builder.json);
    } catch {
      return builder.json;
    }
  });
</script>

<div class="space-y-1">
  <!-- Toolbar: preview collapse toggle + advanced raw-edit CTA -->
  <div class="flex items-center justify-between">
    <button
      type="button"
      class="text-xs text-muted-foreground hover:text-foreground"
      onclick={() => (previewOpen = !previewOpen)}
      data-testid="tcb-preview-toggle"
    >
      {previewOpen ? '▼' : '▶'} {$t('system.settings.config.typeConfig.jsonPreview')}
    </button>
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      onclick={() => setAdvanced(!builder.state.advancedMode)}
      title={$t('system.settings.config.typeConfig.advancedMode')}
      data-testid="tcb-advanced"
    >
      {#if builder.state.advancedMode}
        <Eye class="h-3.5 w-3.5" />
        Preview
      {:else}
        <Pencil class="h-3.5 w-3.5" />
        {$t('app.common.edit')}
      {/if}
    </button>
  </div>

  {#if previewOpen}
    {#if builder.state.advancedMode}
      <!-- Raw JSON editor (CodeMirror: lint, line numbers, bracket matching) -->
      <JsonEditor
        bind:value={rawJsonInput}
        onChange={(v) => builder.setRawJson(compactJson(v))}
        minRows={10}
        maxHeight="24rem"
        placeholder={placeholderJson}
        data-testid="tcb-raw-json"
      />
      {#if builder.state.rawJsonError}
        <p class="text-destructive text-xs" data-testid="tcb-raw-json-error">{builder.state.rawJsonError}</p>
      {/if}
    {:else}
      <!-- Read-only JSON preview -->
      <JsonCodeBlock
        code={previewJson}
        lineNumbers
        copyable
        minRows={10}
        maxHeight="24rem"
        data-testid="tcb-json-preview"
      />
    {/if}
  {/if}
</div>
