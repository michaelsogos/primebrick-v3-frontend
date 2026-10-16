<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import Eye from '@lucide/svelte/icons/eye'
  import EyeOff from '@lucide/svelte/icons/eye-off';

  interface SelectionCounterProps {
    selectionCount: number;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    selectionPastParticipleKey: string;
    showSelectedOnly: boolean;
    onShowSelectedOnlyChange: (show: boolean) => void;
  }

  let {
    selectionCount,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    selectionPastParticipleKey,
    showSelectedOnly,
    onShowSelectedOnlyChange
  }: SelectionCounterProps = $props();
</script>

{#if selectionCount > 0}
  <div class="flex items-center gap-1.5 text-info">
    <span class="inline-flex flex-wrap items-baseline gap-x-1">
      {selectionCount}
      {#if selectionCount === 1}
        {#if selectionLabelSingularText}
          {' '}{selectionLabelSingularText}{' '}
        {:else if selectionLabelSingularKey}
          {' '}{$t(selectionLabelSingularKey)}{' '}
        {:else if selectionLabelText}
          {' '}{selectionLabelText}{' '}
        {:else if selectionLabelKey}
          {' '}{$t(selectionLabelKey)}{' '}
        {/if}
      {:else if selectionLabelText}
        {' '}{selectionLabelText}{' '}
      {:else if selectionLabelKey}
        {' '}{$t(selectionLabelKey)}{' '}
      {/if}
      {$t(selectionPastParticipleKey)}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="xs"
      class="shrink-0 text-info hover:bg-info/10 hover:text-info"
      aria-pressed={showSelectedOnly}
      title={showSelectedOnly ? $t('system.entities.list.viewAllRowsTitle') : $t('system.entities.list.viewSelectedOnlyTitle')}
      aria-label={showSelectedOnly ? $t('system.entities.list.viewAllRowsTitle') : $t('system.entities.list.viewSelectedOnlyTitle')}
      onclick={() => onShowSelectedOnlyChange(!showSelectedOnly)}
    >
      {#if showSelectedOnly}
        <EyeOff class="size-4" />
      {:else}
        <Eye class="size-4" />
      {/if}
    </Button>
  </div>
{/if}
