<script lang="ts">
  /**
   * FormLabelWithPriorityHelp — the ONLY hint channel for form labels.
   *
   * Renders the label help trigger: a small icon (`size-3.5`, muted) plus an
   * optional italic qualifier (`labelKey`, e.g. "(optional)"). On hover it
   * opens a `PriorityTooltipContent` (title + body, priority-driven icon and
   * color inside the tooltip).
   *
   * Trigger icon mirrors `priority`: WARNING → TriangleAlert (warning),
   * ERROR → OctagonX (destructive), anything else → HelpCircle.
   *
   * `text` is optional: omit it for a pure marker (icon + qualifier only,
   * no tooltip body). Every tooltip carries a priority-tinted title —
   * explicit `title` wins, otherwise `app.common.tooltipTitle.<priority>`
   * is used (INFORMATION default).
   */
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { PriorityTooltipContent, type TooltipPriority } from '$lib/components/ui/tooltip';
  import HelpCircle from '@lucide/svelte/icons/help-circle';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import OctagonX from '@lucide/svelte/icons/octagon-x';
  import type { Component } from 'svelte';
  import { t } from '$lib/i18n';
  import type { FieldHelp } from './field-help';

  let { text, priority, title, labelKey }: FieldHelp = $props();

  const triggerIconMap: Record<string, Component> = {
    WARNING: TriangleAlert,
    ERROR: OctagonX,
  };
  const triggerColorMap: Record<string, string> = {
    WARNING: 'text-warning',
    ERROR: 'text-destructive',
  };
  const TriggerIcon = $derived(triggerIconMap[priority ?? ''] ?? HelpCircle);
  const triggerColor = $derived(triggerColorMap[priority ?? ''] ?? 'text-muted-foreground');

  // Every tooltip shows a priority-tinted title: explicit `title` wins,
  // otherwise the per-priority default (app.common.tooltipTitle.<priority>).
  const effectivePriority = $derived<TooltipPriority>(priority ?? 'INFORMATION');
  const resolvedTitle = $derived(
    title ?? $t(`app.common.tooltipTitle.${effectivePriority.toLowerCase()}`),
  );
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button type="button" class="inline-flex items-center gap-1" {...props} aria-label="Help" tabindex={-1}>
        <TriggerIcon class="size-3.5 {triggerColor}" />
        {#if labelKey}
          <span class="text-xs font-normal text-muted-foreground italic">
            {$t(labelKey)}
          </span>
        {/if}
      </button>
    {/snippet}
  </Tooltip.Trigger>
  {#if text}
    <PriorityTooltipContent priority={effectivePriority} title={resolvedTitle}>
      {text}
    </PriorityTooltipContent>
  {/if}
</Tooltip.Root>
