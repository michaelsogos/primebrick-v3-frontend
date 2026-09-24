<script lang="ts">
  /**
   * AiModelTestReport — ScoreGauge trigger + minimal popover with the test
   * score summary; a "details" CTA opens the global right-side sheet
   * (`shell.aiModelTestReport` panel) with the full per-case report.
   *
   * Used on the AI settings page — extracted so the popover stays readable.
   */
  import * as Popover from '$lib/components/ui/popover/index.js';
  import { buttonVariants } from '$lib/components/ui/button/index.js';
  import { cn } from '$lib/utils.js';
  import ScoreGauge, { gaugeColor } from '$lib/components/ui/smart-regex-input/ScoreGauge.svelte';
  import { summarizeTestScores, testCaseLabel, turnSpeedScore } from '$lib/ai/ai-model-test-scores';
  import type { AiModel } from '$lib/api-types';
  import type { Component } from 'svelte';
  import { t } from '$lib/i18n';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import Award from '@lucide/svelte/icons/award';
  import CircleGauge from '@lucide/svelte/icons/circle-gauge';
  import FlaskConical from '@lucide/svelte/icons/flask-conical';
  import Gauge from '@lucide/svelte/icons/gauge';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';

  let { model }: { model: AiModel } = $props();

  let tsSummary = $derived(summarizeTestScores(model.test_scores));

  /** Aggregate passed turns (score ≥4) across all cases. */
  let passedTurns = $derived.by(() => {
    let passed = 0;
    let total = 0;
    for (const c of tsSummary.cases) {
      for (const turn of c.turns) {
        if (typeof turn.score !== 'number') continue;
        total += 1;
        if (turn.score >= 4) passed += 1;
      }
    }
    return total ? { passed, total, text: `${passed}/${total}` } : null;
  });

  function openDetails() {
    openSheet('shell.aiModelTestReport', { model });
  }
</script>

{#snippet metric(Icon: Component<{ class?: string }>, label: string, value: string, color: string | undefined)}
  <span class="group/metric relative flex items-center gap-1">
    <Icon class="size-3" /><b style={color ? `color:${color}` : undefined}>{value}</b>
    <span
      class="pointer-events-none absolute top-full left-1/2 z-50 mt-1 -translate-x-1/2 rounded-md border border-border/60 bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background opacity-0 shadow-md transition-opacity group-hover/metric:opacity-100"
    >
      {label}
    </span>
  </span>
{/snippet}

<Popover.Root>
  <Popover.Trigger
    class="inline-flex"
    title={$t('system.entities.ai_model.fields.test_scores')}
    data-testid={`ai-model-test-scores-cta-${model.model_id}`}
  >
    <ScoreGauge value={tsSummary.score} label={$t('system.entities.ai_model.fields.test_scores')} />
  </Popover.Trigger>
  <Popover.Content align="start" class="w-72 p-0 overflow-visible">
    <div class="space-y-2 p-2" data-testid={`ai-model-test-scores-dropdown-${model.model_id}`}>
      <div class="flex items-center justify-between border-b border-border/40 pb-1">
        <span class="text-xs font-semibold">{$t('system.entities.ai_model.fields.test_scores')}</span>
        <span class="text-sm font-bold" style="color:{tsSummary.score !== null ? gaugeColor(tsSummary.score, 5) : undefined}">{tsSummary.score?.toFixed(1) ?? '—'}</span>
      </div>
      {#if tsSummary.quality !== null || tsSummary.speed !== null || passedTurns || tsSummary.avg_response_s !== null}
        <div class="flex items-center gap-3 text-[10px] text-muted-foreground">
          {#if tsSummary.quality !== null}
            {@render metric(Award, $t('system.entities.ai_model.test_report.quality'), tsSummary.quality.toFixed(1), gaugeColor(tsSummary.quality, 5))}
          {/if}
          {#if tsSummary.speed !== null}
            {@render metric(Gauge, $t('system.entities.ai_model.fields.speed'), tsSummary.speed.toFixed(1), gaugeColor(tsSummary.speed, 5))}
          {/if}
          {#if passedTurns}
            {@render metric(FlaskConical, $t('system.entities.ai_model.test_report.passed'), passedTurns.text, gaugeColor((passedTurns.passed / passedTurns.total) * 5, 5))}
          {/if}
          {#if tsSummary.avg_response_s !== null}
            {@render metric(CircleGauge, $t('system.entities.ai_model.speed.avg_response'), `${tsSummary.avg_response_s.toFixed(1)}s`, gaugeColor(turnSpeedScore(tsSummary.avg_response_s), 5))}
          {/if}
        </div>
      {/if}
      {#each tsSummary.cases as testCase (testCase.key)}
        <div class="flex items-center justify-between py-0.5 text-xs font-medium">
          <span class="capitalize">{testCaseLabel(testCase.key)}{#if testCase.method} <span class="font-normal text-muted-foreground">({testCase.method})</span>{/if}</span>
          <span class="font-bold" style="color:{testCase.score !== null ? gaugeColor(testCase.score, 5) : undefined}">{testCase.score !== null ? testCase.score.toFixed(1) : '—'}</span>
        </div>
      {/each}
      <Popover.Close
        class={cn(buttonVariants({ variant: 'outline', size: 'xs', tone: 'primary' }), 'w-full')}
        onclick={openDetails}
        data-testid={`ai-model-test-details-cta-${model.model_id}`}
      >
        <Maximize2 class="size-3" />
        {$t('system.entities.ai_model.test_report.title')}
      </Popover.Close>
    </div>
  </Popover.Content>
</Popover.Root>
