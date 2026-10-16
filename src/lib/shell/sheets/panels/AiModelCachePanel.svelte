<script lang="ts">
  /**
   * AiModelCachePanel — global-sheet panel with the full model-cache detail
   * view (censused + orphaned rows, storage breakdown, bulk actions).
   *
   * Reuses ModelCacheSection — the same component used on the AI settings
   * page — so the popover stays minimal while this sheet carries details.
   *
   * Opened via `openSheet('shell.aiModelCache', { active_model_id, model_ranks })`
   * from the model-cache popover in AI chat panels.
   */
  import { t } from '$lib/i18n';
  import { HardDrive } from '@lucide/svelte';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import ModelCacheSection from '$lib/components/ui/smart-regex-input/ModelCacheSection.svelte';

  let { active_model_id = null, model_ranks = {} }: {
    active_model_id?: string | null;
    model_ranks?: Record<string, number | null>;
    modal?: boolean;
  } = $props();
</script>

<SheetPanelLayout contentClass="p-4">
  {#snippet icon()}
    <HardDrive class="size-4" />
  {/snippet}

  {#snippet title()}
    {$t('app.smart.regex.ai.cache.title')}
  {/snippet}

  <div data-testid="ai-model-cache-sheet">
    <ModelCacheSection {active_model_id} {model_ranks} />
  </div>
</SheetPanelLayout>
