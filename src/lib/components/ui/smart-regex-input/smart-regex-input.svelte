<script lang="ts">
  /**
   * SmartRegexInput — AI-powered regex input component.
   *
   * Extends TextInput with two inner CTAs on the right side:
   * 1. Flags CTA — opens a right-panel sheet to toggle regex flags (g, i, m)
   * 2. Brain CTA — opens a right-panel AI chat that converts natural language
   *    descriptions to regex patterns using WebLLM (Qwen2.5-0.5B-Instruct).
   *
   * The "Smart" prefix establishes the convention for AI-powered components.
   *
   * Props follow snake_case per data-model-conventions rule.
   */
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { inputTrailingIconColorClasses } from '$lib/components/ui/input/input-chrome';
  import Flag from '@lucide/svelte/icons/flag';
  import Brain from '@lucide/svelte/icons/brain';
  import X from '@lucide/svelte/icons/x';

  interface $$Props {
    /** The regex pattern string (bindable). */
    value?: string;
    /** The regex flags (bindable, e.g. 'gi'). */
    flags?: string;
    /** Called when the pattern or flags change. */
    on_change?: (value: string, flags: string) => void;
    /** Called on input events. */
    oninput?: (e: Event) => void;
    /** Placeholder text. */
    placeholder?: string;
    /** Disabled state. */
    disabled?: boolean;
    /** Read-only state. */
    readonly?: boolean;
    /** Input ID. */
    id?: string;
    /** Additional classes. */
    class?: string;
    /** Test ID. */
    'data-testid'?: string;
    /** Config type context — controls which flags are available. */
    config_type?: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
  }

  let {
    value = $bindable(''),
    flags = $bindable(''),
    on_change,
    oninput,
    placeholder,
    disabled = false,
    readonly = false,
    id,
    class: className,
    'data-testid': dataTestId = 'smart-regex-input',
    config_type = 'string',
  }: $$Props = $props();

  let regex_error = $state<string | null>(null);

  // Validate the regex pattern on input
  function validate_pattern(pattern: string, flag_str: string): string | null {
    if (!pattern) return null;
    try {
      new RegExp(pattern, flag_str);
      return null;
    } catch {
      return $t('app.common.validation.invalidRegexPattern');
    }
  }

  function handle_input(e: Event) {
    const target = e.target as HTMLInputElement;
    value = target.value;
    regex_error = validate_pattern(value, flags);
    oninput?.(e);
    on_change?.(value, flags);
  }

  function handle_clear() {
    value = '';
    regex_error = null;
    on_change?.(value, flags);
  }

  function open_flags_panel() {
    openSheet('config.regexFlags', {
      current_flags: flags,
      config_type,
      on_flags_change: (new_flags: string) => {
        flags = new_flags;
        regex_error = validate_pattern(value, flags);
        on_change?.(value, flags);
      },
    });
  }

  function open_ai_panel() {
    openSheet('config.regexAiChat', {
      config_type,
      on_apply_regex: (pattern: string, flag_str: string) => {
        value = pattern;
        flags = flag_str;
        regex_error = validate_pattern(value, flags);
        on_change?.(value, flags);
      },
    });
  }

  // Show flags badge if any flags are set
  let has_flags = $derived(flags.length > 0);
</script>

<div class="relative">
  <input
    {id}
    type="text"
    {value}
    {placeholder}
    {disabled}
    {readonly}
    oninput={handle_input}
    data-testid={dataTestId}
    class={cn(
      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium',
      'placeholder:text-muted-foreground',
      'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'border-primary-gradient dark:border-primary-gradient',
      regex_error && 'border-destructive',
      // Right padding for trailing CTAs (flags + brain + clear)
      'pr-24',
      className,
    )}
  />

  <!-- Trailing CTAs -->
  <div class="absolute top-1/2 right-0 -translate-y-1/2 flex items-center gap-0.5 pr-1">
    <!-- Flags CTA -->
    <button
      type="button"
      onclick={open_flags_panel}
      disabled={disabled || readonly}
      title={$t('app.smart.regex.ai.flagsCta')}
      aria-label={$t('app.smart.regex.ai.flagsCta')}
      tabindex={-1}
      class={cn(
        inputTrailingIconColorClasses,
        'relative',
        !disabled && !readonly && 'hover:bg-accent rounded',
        has_flags && 'text-primary',
      )}
      data-testid="smart-regex-flags-cta"
    >
      <Flag class="size-4" />
      {#if has_flags}
        <span
          class="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground"
          data-testid="smart-regex-flags-badge"
        >
          {flags.length}
        </span>
      {/if}
    </button>

    <!-- Brain CTA (AI assistant) -->
    <button
      type="button"
      onclick={open_ai_panel}
      disabled={disabled || readonly}
      title={$t('app.smart.regex.ai.brainCta')}
      aria-label={$t('app.smart.regex.ai.brainCta')}
      tabindex={-1}
      class={cn(
        inputTrailingIconColorClasses,
        !disabled && !readonly && 'hover:bg-accent rounded',
      )}
      data-testid="smart-regex-brain-cta"
    >
      <Brain class="size-4" />
    </button>

    <!-- Clear button (only when value is present and not disabled/readonly) -->
    {#if value && !disabled && !readonly}
      <button
        type="button"
        onclick={handle_clear}
        aria-label="Clear"
        title="Clear"
        tabindex={-1}
        class={inputTrailingIconColorClasses}
        data-testid="smart-regex-clear"
      >
        <X class="size-4" />
      </button>
    {/if}
  </div>
</div>

<!-- Error display -->
{#if regex_error}
  <p class="mt-1 text-xs text-destructive" data-testid="smart-regex-input-error">
    {regex_error}
  </p>
{/if}
