<script lang="ts">
  /**
   * SwitchField — the ONLY standard way to render a labelled Switch.
   *
   * Anatomy (canonical order — switch FIRST, label immediately after):
   *   [Switch] Label [?]           (flex row, items-center gap-3)
   *   description                  (optional muted sublabel under the row)
   *
   * - `label` is the visible text; `tooltip`/`tooltipTitle`/`tooltipPriority`
   *   render a FormLabelWithPriorityHelp (?) inside the label — same pattern as
   *   the profile page.
   * - `description` renders the muted `text-xs` sublabel under the row
   *   (same pattern as configurations/create "Reserved").
   * - Raw <Switch> is only allowed inside composite components that own their
   *   own labelling (e.g. ConfigValueInput); every user-facing labelled switch
   *   in a form MUST be a SwitchField.
   */
  import Switch from '$lib/components/ui/switch/switch.svelte';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
  import type { TooltipPriority } from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils.js';

  let {
    checked = $bindable(false),
    onCheckedChange,
    label,
    description,
    tooltip,
    tooltipTitle,
    tooltipPriority,
    tooltipLabelKey,
    disabled = false,
    size = 'default',
    id,
    class: className,
    'data-testid': dataTestId,
  }: {
    checked?: boolean;
    /** Alternative to bind:checked for external stores (superForm, builders). */
    onCheckedChange?: (checked: boolean) => void;
    /** Visible label text, rendered right after the switch. */
    label?: string;
    /** Optional muted sublabel under the row. */
    description?: string;
    /** Optional help text shown in a (?) tooltip inside the label. */
    tooltip?: string;
    tooltipTitle?: string;
    tooltipPriority?: TooltipPriority;
    /** Optional muted italic i18n key rendered next to the (?) icon. */
    tooltipLabelKey?: string;
    disabled?: boolean;
    /**
     * Label density — layout only, never affects colors/gradients:
     * - 'default' (form pages): text-sm font-medium
     * - 'sm' (dense sheets/panels): text-xs font-medium text-muted-foreground
     */
    size?: 'default' | 'sm';
    id?: string;
    class?: string;
    'data-testid'?: string;
  } = $props();
</script>

<div class={cn('space-y-2', className)} data-testid={dataTestId}>
  <div class="flex items-center gap-3">
    <Switch
      {id}
      bind:checked
      {disabled}
      onCheckedChange={onCheckedChange}
      data-testid={dataTestId ? `${dataTestId}-switch` : undefined}
    />
    {#if label}
      <label
        for={id}
        class={cn(
          'inline-flex items-center gap-1 font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          size === 'sm' ? 'text-xs text-muted-foreground' : 'text-sm',
        )}
      >
        {label}
        {#if tooltip}
          <FormLabelWithPriorityHelp
            text={tooltip}
            priority={tooltipPriority}
            title={tooltipTitle}
            labelKey={tooltipLabelKey}
          />
        {/if}
      </label>
    {/if}
  </div>
  {#if description}
    <p class="text-xs text-muted-foreground">{description}</p>
  {/if}
</div>
