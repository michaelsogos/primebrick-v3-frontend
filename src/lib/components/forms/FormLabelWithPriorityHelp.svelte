<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { PriorityTooltipContent, type TooltipPriority } from '$lib/components/ui/tooltip';
  import HelpCircle from '@lucide/svelte/icons/help-circle';

  let {
    text,
    priority,
    title,
  }: { text: string; priority?: TooltipPriority; title?: string } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button type="button" class="inline-flex" {...props} aria-label="Help" tabindex={-1}>
        <HelpCircle class="size-3.5 text-muted-foreground" />
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