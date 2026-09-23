<script lang="ts">
  /**
   * AiModelOption — standard rendering of an ai_model row in pickers.
   *
   * Anatomy (shared with ai-model-selector dropdown items):
   *   [ModelIcon] name ............ [RankMeter rank]
   *
   * Use inside ComboSelect `itemSnippet`/`selectedSnippet` or any list row.
   */
  import ModelIcon from '$lib/components/ui/smart-regex-input/ModelIcon.svelte';
  import RankMeter from '$lib/components/ui/smart-regex-input/RankMeter.svelte';
  import type { AiModel } from '$lib/api-types';

  let { model }: { model: AiModel } = $props();
</script>

<div class="flex w-full items-center justify-between gap-2">
  <div class="flex min-w-0 items-center gap-2">
    <ModelIcon model_id={model.model_id} class="size-4 shrink-0" />
    <span class="truncate">{model.name}</span>
  </div>
  <RankMeter rank={model.rank} />
</div>
