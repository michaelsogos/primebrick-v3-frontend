<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { PriorityTooltipContent, type TooltipPriority } from '$lib/components/ui/tooltip';
  import HelpCircle from '@lucide/svelte/icons/help-circle';
  import { t } from '$lib/i18n';

  let {
    text,
    priority,
    title,
    labelKey,
  }: { text: string; priority?: TooltipPriority; title?: string; labelKey?: string } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button type="button" class="inline-flex items-center gap-1" {...props} aria-label="Help" tabindex={-1}>
        <HelpCircle class="size-3.5 text-muted-foreground" />
        {#if labelKey}
          <span class="text-xs font-normal text-muted-foreground italic">
            {$t(labelKey)}
          </span>
        {/if}
      </button>
    {/snippet}
  </Tooltip.Trigger>
  {#if priority}
    <PriorityTooltipContent {priority} {title}>
      {text}
    </PriorityTooltipContent>
  {:else}
    <Tooltip.Content class="max-w-xs text-xs">
      {text}
    </Tooltip.Content>
  {/if}
</Tooltip.Root>
