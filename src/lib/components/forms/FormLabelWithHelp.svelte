<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import HelpCircle from '@lucide/svelte/icons/help-circle';

  let { text }: { text: string } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button type="button" class="inline-flex" {...props} aria-label="Help">
        <HelpCircle class="size-3.5 text-muted-foreground" />
      </button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content class="max-w-xs text-xs">
    {text}
  </Tooltip.Content>
</Tooltip.Root>
