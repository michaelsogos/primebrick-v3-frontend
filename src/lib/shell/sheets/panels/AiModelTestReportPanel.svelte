<script lang="ts">
  /**
   * AiModelTestReportPanel — global-sheet panel showing the full test report
   * for one ai_model row. Cases render as accordions (closed by default):
   * trigger = case label + avg quality / avg speed / last-tested date on the
   * right; content = load info, generation/execution config, every turn's
   * prompt/expected/actual/metrics.
   *
   * Opened via `openSheet('shell.aiModelTestReport', { model })` from the
   * AI settings page test-scores popover. Anatomy: SheetPanelLayout.
   */
  import { summarizeTestScores, testCaseLabel, turnSpeedScore } from '$lib/ai/ai-model-test-scores';
  import type { TestTurn } from '$lib/ai/ai-model-test-scores';
  import { gaugeColor } from '$lib/components/ui/smart-regex-input/ScoreGauge.svelte';
  import * as Accordion from '$lib/components/ui/accordion/index.js';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';
  import type { AiModel } from '$lib/api-types';
  import type { Component } from 'svelte';
  import { t, formatUiDate } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import Award from '@lucide/svelte/icons/award';
  import CalendarFold from '@lucide/svelte/icons/calendar-fold';
  import CircleGauge from '@lucide/svelte/icons/circle-gauge';
  import FlaskConical from '@lucide/svelte/icons/flask-conical';
  import Gauge from '@lucide/svelte/icons/gauge';
  import Trophy from '@lucide/svelte/icons/trophy';

  let { model }: { model: AiModel; modal?: boolean } = $props();

  let tsSummary = $derived(summarizeTestScores(model.test_scores));

  /** Passed turns (score ≥4) over scored turns for a turn list. */
  function countPassed(turns: TestTurn[]): { passed: number; total: number } {
    let passed = 0;
    let total = 0;
    for (const turn of turns) {
      const s = typeof turn.score === 'number' ? turn.score : null;
      if (s === null) continue;
      total += 1;
      if (s >= 4) passed += 1;
    }
    return { passed, total };
  }

  let passedTurns = $derived.by(() => {
    const { passed, total } = countPassed(tsSummary.cases.flatMap((c) => c.turns));
    return total ? { passed, total, text: `${passed}/${total}` } : null;
  });

  function fmt(v: number | null): string {
    return v === null ? '—' : v.toFixed(1);
  }

  const scoreKey = 'system.entities.ai_model.test_report.score';
  const qualityKey = 'system.entities.ai_model.test_report.quality';
  const speedKey = 'system.entities.ai_model.fields.speed';
  const passedKey = 'system.entities.ai_model.test_report.passed';
  const avgKey = 'system.entities.ai_model.speed.avg_response';
</script>

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <FlaskConical class="size-4" />
  {/snippet}

  {#snippet title()}
    {$t('system.entities.ai_model.test_report.title')}
  {/snippet}

  <div data-testid={`ai-model-test-sheet-${model.model_id}`}>
    <!-- Model identity + aggregate metrics: metadata lives in CONTENT -->
    <div class="space-y-2 border-b border-border/40 px-4 py-3">
      <div>
        <p class="text-sm font-medium">{model.name}</p>
        <p class="truncate font-mono text-[11px] text-muted-foreground">{model.model_id}</p>
      </div>
      <div class="flex items-center gap-4 text-[11px] text-muted-foreground">
        {#if tsSummary.score !== null}
          {@render metric(Trophy, $t(scoreKey), fmt(tsSummary.score), gaugeColor(tsSummary.score, 5), 'size-3.5')}
        {/if}
        {#if tsSummary.quality !== null}
          {@render metric(Award, $t(qualityKey), fmt(tsSummary.quality), gaugeColor(tsSummary.quality, 5), 'size-3.5')}
        {/if}
        {#if tsSummary.speed !== null}
          {@render metric(Gauge, $t(speedKey), fmt(tsSummary.speed), gaugeColor(tsSummary.speed, 5), 'size-3.5')}
        {/if}
        {#if passedTurns}
          {@render metric(FlaskConical, $t(passedKey), passedTurns.text, gaugeColor((passedTurns.passed / passedTurns.total) * 5, 5), 'size-3.5')}
        {/if}
        {#if tsSummary.avg_response_s !== null}
          {@render metric(CircleGauge, $t(avgKey), `${tsSummary.avg_response_s.toFixed(1)}s`, gaugeColor(turnSpeedScore(tsSummary.avg_response_s), 5), 'size-3.5')}
        {/if}
      </div>
    </div>

    <!-- Per-case sections: accordions, closed by default -->
    <Accordion.Root type="multiple" class="w-full">
      {#each tsSummary.cases as reportCase (reportCase.key)}
        {#if reportCase.turns.length || reportCase.load || reportCase.note || reportCase.load_ok === false}
          <Accordion.Item value={reportCase.key} data-testid={`ai-model-test-report-${model.model_id}-${reportCase.key}`}>
            <Accordion.Trigger class="px-4 hover:no-underline">
              {@const casePassed = countPassed(reportCase.turns)}
              <span class="flex flex-1 flex-col">
                <span class="capitalize group-hover/accordion-trigger:underline">{testCaseLabel(reportCase.key)}</span>
                <span class="mt-1 flex items-center gap-3 text-[10px] font-normal text-muted-foreground">
                  {#if reportCase.quality !== null}
                    {@render metric(Award, $t(qualityKey), fmt(reportCase.quality), gaugeColor(reportCase.quality, 5), 'size-3')}
                  {/if}
                  {#if reportCase.speed !== null}
                    {@render metric(Gauge, $t(speedKey), fmt(reportCase.speed), gaugeColor(reportCase.speed, 5), 'size-3')}
                  {/if}
                  {#if casePassed.total}
                    {@render metric(FlaskConical, $t(passedKey), `${casePassed.passed}/${casePassed.total}`, gaugeColor((casePassed.passed / casePassed.total) * 5, 5), 'size-3')}
                  {/if}
                  {#if reportCase.avg_response_s !== null}
                    {@render metric(CircleGauge, $t(avgKey), `${reportCase.avg_response_s.toFixed(1)}s`, gaugeColor(turnSpeedScore(reportCase.avg_response_s), 5), 'size-3')}
                  {/if}
                  {#if reportCase.tested_at}
                    <span class="flex items-center gap-1"><CalendarFold class="size-3" /><span>{formatUiDate(reportCase.tested_at, $uiLang)}</span></span>
                  {/if}
                </span>
              </span>
            </Accordion.Trigger>
            <Accordion.Content class="space-y-2 px-4 pb-3">
              {#if reportCase.load?.error || reportCase.error}
                <div class="rounded bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
                  <b>LOAD FAILURE</b> — {reportCase.load?.error ?? reportCase.error}
                </div>
              {:else}
                <div class="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                  {#if reportCase.load?.load_time_ms != null}<span>load {(Number(reportCase.load.load_time_ms) / 1000).toFixed(0)}s</span>{/if}
                  {#if reportCase.generation_ok !== undefined}<span>gen {reportCase.generation_ok ? 'ok' : 'failed'}</span>{/if}
                  {#if reportCase.generation_config}
                    <span>T={reportCase.generation_config.temperature} top_p={reportCase.generation_config.top_p} max={reportCase.generation_config.max_tokens}</span>
                  {/if}
                  {#if reportCase.execution_config}
                    <span>kv {reportCase.execution_config.kv_cache_reuse ? 'on' : 'off'}{reportCase.execution_config.max_history_turns ? ` · window ${reportCase.execution_config.max_history_turns}` : ''}</span>
                  {/if}
                </div>
              {/if}

              {#if reportCase.turns.length}
                <div class="space-y-1">
                  {#each reportCase.turns as turn, ti (ti)}
                    {@const n = turn.n ?? turn.turn ?? ti + 1}
                    {@const tScore = typeof turn.score === 'number' ? turn.score : null}
                    {@const tActual = turn.actual ?? turn.output}
                    {@const tSecs = turn.response_s ?? turn.ttft_s}
                    <details class="group rounded border border-border/40 text-[10px]">
                      <summary class="flex cursor-pointer list-none items-center gap-1.5 px-1.5 py-1 hover:bg-accent/40">
                        <span class="font-mono font-semibold w-5">T{n}</span>
                        <span class="font-bold {tScore !== null && tScore >= 4 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}">
                          {tScore !== null ? tScore.toFixed(0) : '—'}/5
                        </span>
                        <span>{turn.verdict === 'pass' ? '✓' : turn.verdict ? '✗' : ''}</span>
                        <span class="truncate flex-1 text-muted-foreground">{turn.reason ?? turn.note ?? turn.prompt ?? ''}</span>
                        {#if tSecs != null}<span class="font-mono text-muted-foreground">{tSecs.toFixed(1)}s</span>{/if}
                      </summary>
                      <div class="space-y-1 border-t border-border/40 px-2 py-1.5">
                        {#if turn.prompt}<div><span class="text-muted-foreground">prompt:</span> <span class="font-medium">{turn.prompt}</span></div>{/if}
                        {#if turn.expected != null}<div><span class="text-muted-foreground">expected:</span> <code class="font-mono">{turn.expected}</code></div>{/if}
                        {#if tActual != null}<div><span class="text-muted-foreground">actual:</span> <code class="font-mono">{tActual}</code></div>{/if}
                        {#if turn.actual_response}<div><span class="text-muted-foreground">raw:</span><pre class="mt-0.5 max-h-24 overflow-auto rounded bg-muted/40 p-1 font-mono whitespace-pre-wrap">{turn.actual_response}</pre></div>{/if}
                        <div class="flex gap-x-3 font-mono text-muted-foreground">
                          {#if turn.tokens_per_second != null}<span>{turn.tokens_per_second} t/s</span>{/if}
                          {#if turn.kv_cache_hit_ratio != null}<span>kv hit {(turn.kv_cache_hit_ratio * 100).toFixed(0)}%</span>{/if}
                          {#if turn.reason}<span>reason: {turn.reason}</span>{/if}
                        </div>
                      </div>
                    </details>
                  {/each}
                </div>
              {/if}

              {#if reportCase.note}
                <p class="text-[10px] leading-snug text-muted-foreground italic">{reportCase.note}</p>
              {/if}
            </Accordion.Content>
          </Accordion.Item>
        {/if}
      {/each}
    </Accordion.Root>
  </div>
</SheetPanelLayout>

{#snippet metric(Icon: Component<{ class?: string }>, label: string, value: string, color: string | undefined, iconClass: string)}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <span {...props} class="flex items-center gap-1"><Icon class={iconClass} /><b style={color ? `color:${color}` : undefined}>{value}</b></span>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>{label}</Tooltip.Content>
  </Tooltip.Root>
{/snippet}
