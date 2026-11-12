<script lang="ts">
  /**
   * JsonViewerPanel — read-only JSON inspector for `format:"json"` cells
   * (VIEWER archetype). Opened by the cell's braces CTA via
   * `openSheet('entity.jsonViewer', { value })`. Two views, toggled from
   * the HEAD actions: an Explorer tree and the Raw preview
   * (`JsonCodeBlock`, same control the create form uses).
   */
  import { t } from '$lib/i18n';
  import { JsonCodeBlock, SheetPanelLayout, toDisplayString } from '@primebrick/ui';
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
  import { Braces, FileBraces } from '@primebrick/ui/vendor/lucide';

  let { value }: { value: unknown } = $props();
  let mode = $state<'explorer' | 'raw'>('explorer');
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
</script>

{#snippet node(v: unknown, key?: string, depth = 0)}
  {#if isObj(v)}
    <details open={depth < 2} class="pl-3">
      <summary class="cursor-pointer select-none text-xs">
        {#if key !== undefined}<span class="font-semibold">{key}</span><span class="text-muted-foreground">: </span>{/if}
        <span class="text-muted-foreground">{Array.isArray(v) ? `[${v.length}]` : '{…}'}</span>
      </summary>
      {#each Object.entries(v) as [k, child] (k)}
        {@render node(child, k, depth + 1)}
      {/each}
    </details>
  {:else}
    <div class="pl-3 text-xs">
      {#if key !== undefined}<span class="font-semibold">{key}</span><span class="text-muted-foreground">: </span>{/if}
      <span class="font-mono">{toDisplayString(v)}</span>
    </div>
  {/if}
{/snippet}

<SheetPanelLayout>
  {#snippet icon()}
    <Braces class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('app.common.view')}
  {/snippet}
  {#snippet actions()}
    <SheetHeaderAction
      title={mode === 'explorer' ? $t('app.common.raw') : $t('app.common.explorer')}
      onclick={() => (mode = mode === 'explorer' ? 'raw' : 'explorer')}
    >
      {#if mode === 'explorer'}
        <FileBraces class="size-4" />
      {:else}
        <Braces class="size-4" />
      {/if}
    </SheetHeaderAction>
  {/snippet}

  <div class="h-full overflow-auto p-3">
    {#if mode === 'explorer'}
      {@render node(value)}
    {:else}
      <JsonCodeBlock code={value} copyable />
    {/if}
  </div>
</SheetPanelLayout>
