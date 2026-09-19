<script lang="ts">
  /**
   * AiModelSelector — footer dropdown for switching the active AI model.
   *
   * Shows the model list from the BE `ai_models` entity with per-model
   * RankMeter and a sort sub-menu (rank, alphabetic, speed, quality, power).
   * Self-contained: owns its sort state; the parent only receives on_switch.
   *
   * Shared by all Smart* assistant panels (i18n_ns + testid_prefix props).
   */
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import { dropdownMenuItemWithSelectedClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import RankMeter from '$lib/components/ui/smart-regex-input/RankMeter.svelte';
  import ModelIcon from '$lib/components/ui/smart-regex-input/ModelIcon.svelte';
  import { summarizeTestScores, rankColor } from '$lib/ai/ai-model-test-scores';
  import type { AiModel } from '$lib/api-types';
  import { t } from '$lib/i18n';
  import BrainCircuit from '@lucide/svelte/icons/brain-circuit';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ArrowDownWideNarrow from '@lucide/svelte/icons/arrow-down-wide-narrow';

  type ModelSortKey = 'rank' | 'alphabetic' | 'speed' | 'quality' | 'power';

  let {
    models,
    current_model_id,
    loading = false,
    on_switch,
    i18n_ns,
    testid_prefix,
  }: {
    /** Enabled models from the BE catalog. */
    models: AiModel[];
    /** Currently active model_id (for selected-state + trigger display). */
    current_model_id: string | null;
    /** Disable items while a model load is in flight. */
    loading?: boolean;
    /** Called when the user picks a model. */
    on_switch: (model_id: string) => void;
    /** i18n namespace, e.g. 'app.smart.regex.ai'. */
    i18n_ns: string;
    /** data-testid prefix, e.g. 'smart-regex-ai'. */
    testid_prefix: string;
  } = $props();

  let modelSortBy = $state<ModelSortKey>('rank');

  const SORT_LABEL_KEYS = $derived.by<Record<ModelSortKey, string>>(() => ({
    rank: `${i18n_ns}.model_details.rank`,
    alphabetic: `${i18n_ns}.sort.alphabetic`,
    speed: `${i18n_ns}.model_details.speed`,
    quality: `${i18n_ns}.model_details.test_score`,
    power: `${i18n_ns}.model_details.power`,
  }));

  const modelScoreCache = new Map<string, ReturnType<typeof summarizeTestScores>>();
  function scoresFor(model: AiModel) {
    let s = modelScoreCache.get(model.model_id);
    if (!s) {
      s = summarizeTestScores(model.test_scores);
      modelScoreCache.set(model.model_id, s);
    }
    return s;
  }

  let sortedModels = $derived.by<AiModel[]>(() => {
    const list = [...models];
    switch (modelSortBy) {
      case 'alphabetic':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'speed':
        return list.sort((a, b) => (scoresFor(b).speed ?? -1) - (scoresFor(a).speed ?? -1));
      case 'quality':
        return list.sort((a, b) => (scoresFor(b).score ?? -1) - (scoresFor(a).score ?? -1));
      case 'power':
        return list.sort((a, b) => (b.power_level ?? -1) - (a.power_level ?? -1));
      case 'rank':
      default:
        return list.sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1));
    }
  });

  /** Value of the active sort metric for a model row (all metrics are 0-5). */
  function sortMetricValue(model: AiModel): number | null {
    switch (modelSortBy) {
      case 'speed':
        return scoresFor(model).speed;
      case 'quality':
        return scoresFor(model).score;
      case 'power':
        return model.power_level;
      default:
        return null;
    }
  }

  let currentModel = $derived(
    current_model_id ? models.find((m) => m.model_id === current_model_id) : undefined
  );
  let modelDisplayName = $derived(currentModel?.name ?? '');
  let currentRank = $derived(currentModel?.rank ?? null);
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="min-w-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
    data-testid="{testid_prefix}-model-trigger"
  >
    <BrainCircuit class="size-3.5 shrink-0" />
    <span class="truncate font-medium">{modelDisplayName || '—'}</span>
    {#if currentRank}
      <span
        class="size-2 shrink-0 rounded-full ring-1 ring-foreground/20"
        style="background: {rankColor(currentRank)};"
        data-testid="{testid_prefix}-power-circle"
      ></span>
    {/if}
    <ChevronDown class="size-3 shrink-0" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" class="min-w-[12rem]">
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger class="text-xs" data-testid="{testid_prefix}-sort-trigger">
        <ArrowDownWideNarrow class="size-3.5" />
        <span>{$t(`${i18n_ns}.sort.by`)}: {$t(SORT_LABEL_KEYS[modelSortBy])}</span>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent>
        <DropdownMenu.RadioGroup bind:value={modelSortBy}>
          {#each ['rank', 'alphabetic', 'speed', 'quality', 'power'] as key (key)}
            <DropdownMenu.RadioItem
              value={key}
              class="text-xs"
              data-testid="{testid_prefix}-sort-{key}"
              onSelect={(e) => {
                e.preventDefault();
                modelSortBy = key as ModelSortKey;
              }}
            >
              {$t(SORT_LABEL_KEYS[key as ModelSortKey])}
            </DropdownMenu.RadioItem>
          {/each}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
    <DropdownMenu.Separator />
    {#each sortedModels as model (model.model_id)}
      <DropdownMenu.Item
        onclick={() => on_switch(model.model_id)}
        disabled={loading}
        class={dropdownMenuItemWithSelectedClass(
          'flex items-center justify-between gap-2 text-xs',
          current_model_id === model.model_id
        )}
        data-testid="{testid_prefix}-model-{model.model_id}"
      >
        {@const metric = sortMetricValue(model)}
        <div class="flex items-center gap-2">
          <ModelIcon model_id={model.model_id} class="size-4 shrink-0" />
          <span>{model.name}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          {#if metric !== null}
            <RankMeter rank={metric} label={$t(SORT_LABEL_KEYS[modelSortBy])} />
            <RankMeter rank={model.rank} label={$t(SORT_LABEL_KEYS.rank)} score_below />
          {:else}
            <RankMeter rank={model.rank} />
          {/if}
        </div>
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
