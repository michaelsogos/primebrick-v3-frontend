<script lang="ts">
  /**
   * PrimeField — standalone field-row wrapper for controls NOT inside a
   * superforms/formsnap `FormField` (config rows, dynamic meta rows,
   * settings widgets, sheet-panel quick forms).
   *
   * Anatomy (two layouts, same chrome as the established pages):
   *
   *   layout="stacked" (default)          layout="inline" (bool controls)
   *   ┌────────────────────────┐          ┌────────────────────────┐
   *   │ LABEL [req *] [?help]  │          │ CONTROL LABEL [?help]  │
   *   │ CONTROL                │          │ (switch/checkbox/…)    │
   *   │ hint / error           │          │ hint / error           │
   *   └────────────────────────┘          └────────────────────────┘
   *
   * The `control` snippet always receives `id` — render a real
   * `<label for>`/`id` pair. For superforms pages use `ui/form`
   * (`FormField`/`FormControl`) instead.
   *
   *   <PrimeField id="cfg-foo" label={$t('…')} hint={$t('…')}>
   *     {#snippet control({ id })}
   *       <Input {id} bind:value={v} />
   *     {/snippet}
   *   </PrimeField>
   */
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
  import type { TooltipPriority } from '$lib/components/ui/tooltip';
  import type { Snippet } from 'svelte';

  /**
   * Help tooltip — either a pre-mapped shape (`text` is already translated)
   * or raw column meta fields (`tooltip*` are i18n keys, translated here and
   * gated by `show_form_tooltip`). A `MetaColumn` (entity-list/types) is
   * structurally assignable to the second variant.
   */
  export type PrimeFieldHelp =
    | {
        /** Translated tooltip body. */
        text: string;
        /** Priority/severity of the tooltip icon + title. */
        priority?: TooltipPriority;
        /** Translated tooltip title. */
        title?: string;
        /** i18n key for the muted italic qualifier next to the icon. */
        labelKey?: string;
      }
    | {
        /** i18n key for tooltip content (translated internally). */
        tooltip?: string;
        /** Priority/severity from column meta. */
        tooltip_priority?: TooltipPriority;
        /** i18n key for tooltip title (translated internally). */
        tooltip_title?: string;
        /** Meta flag — tooltip hidden when `false`. */
        show_form_tooltip?: boolean;
      };

  let {
    id: idProp,
    label,
    required = false,
    hint,
    error,
    help,
    layout = 'stacked',
    control,
    class: className,
    'data-testid': dataTestId,
  }: {
    /** Control id — defaults to a stable per-instance `$props.id()`. */
    id?: string;
    /** Translated label text. Omit for label-less rows (switch-only, etc.). */
    label?: string;
    /** Append the required `*` marker. */
    required?: boolean;
    /** Translated hint line under the control (`text-xs text-muted-foreground`). */
    hint?: string;
    /** Translated error line(s) under the control (`text-destructive`). */
    error?: string | string[];
    /**
     * Tooltip help — pre-mapped `{ text, priority?, title?, labelKey? }` or
     * raw `MetaColumn` (`tooltip`, `tooltip_priority`, `tooltip_title`,
     * `show_form_tooltip`).
     */
    help?: PrimeFieldHelp;
    /** `'stacked'` (label above) or `'inline'` (bool controls — label beside control). */
    layout?: 'stacked' | 'inline';
    /** The control — receives `{ id }` and MUST apply it for label wiring. */
    control: Snippet<[{ id: string }]>;
    class?: string;
    'data-testid'?: string;
  } = $props();

  // `$props.id()` must be a top-level variable initializer — gives a stable,
  // hydration-safe per-instance id when the caller does not provide one.
  const generatedId = $props.id();
  const id = $derived(idProp ?? generatedId);

  interface ResolvedHelp {
    text: string;
    priority?: TooltipPriority;
    title?: string;
    labelKey?: string;
  }

  const resolvedHelp = $derived.by<ResolvedHelp | null>(() => {
    if (!help) return null;
    if ('text' in help) {
      return {
        text: help.text,
        priority: help.priority,
        title: help.title,
        labelKey: help.labelKey,
      };
    }
    if (help.tooltip && help.show_form_tooltip !== false) {
      return {
        text: $t(help.tooltip),
        priority: help.tooltip_priority,
        title: help.tooltip_title ? $t(help.tooltip_title) : undefined,
      };
    }
    return null;
  });

  const errors = $derived(
    error === undefined ? [] : Array.isArray(error) ? error : [error],
  );
</script>

{#snippet helpIcon()}
  {#if resolvedHelp}
    <FormLabelWithPriorityHelp
      text={resolvedHelp.text}
      priority={resolvedHelp.priority}
      title={resolvedHelp.title}
      labelKey={resolvedHelp.labelKey}
    />
  {/if}
{/snippet}

{#snippet labelEl()}
  {#if label}
    {label}{#if required}<span class="text-destructive">*</span>{/if}{@render helpIcon()}
  {/if}
{/snippet}

<div class={cn('space-y-2', className)} data-testid={dataTestId}>
  {#if layout === 'inline'}
    <div class="flex items-center gap-2">
      {@render control({ id })}
      {#if label}
        <label
          for={id}
          class="inline-flex items-center gap-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {@render labelEl()}
        </label>
      {/if}
    </div>
  {:else}
    {#if label}
      <label for={id} class="inline-flex items-center gap-1 text-sm font-medium">
        {@render labelEl()}
      </label>
    {/if}
    {@render control({ id })}
  {/if}

  {#if hint}
    <p class="text-xs text-muted-foreground">{hint}</p>
  {/if}
  {#each errors as err (err)}
    <p class="text-xs font-medium text-destructive">{err}</p>
  {/each}
</div>
