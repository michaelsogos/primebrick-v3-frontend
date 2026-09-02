<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";
  import Input from "$lib/components/ui/input/input.svelte";
  import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "$lib/components/ui/input-group";
  import { useNumericInput } from "$lib/composables/useNumericInput.svelte";
  import { t } from "$lib/i18n";
  import { openSheet } from "$lib/shell/sheets/sheet-manager.svelte";

  type NumericType = "bigint" | "number" | "money";

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, "type" | "files"> & {
      /**
       * Numeric config type — drives inputmode, character filtering, and
       * native type conversion (bigint → BigInt, number/money → Number).
       */
      type: NumericType;
      /**
       * type_config JSON string — parsed for `validation.unsigned` and
       * `validation.rules.min` to derive unsigned behavior and effective min.
       */
      type_config?: string | null;
      /**
       * Bindable value — accepts string | bigint | number.
       * The composable converts to/from a local string for the input element.
       */
      value?: string | bigint | number;
      /** Optional callback fired on blur with the native typed value. */
      onChange?: (value: string | bigint | number) => void;
      /** Errors array (i18n keys in `key|jsonParams` format) — renders below input. */
      errors?: string[];
      /**
       * Currency symbol to display inside the input (inline-start addon).
       * When provided, the input is rendered inside an InputGroup with the
       * symbol as a prefix adornment. Used for money type.
       */
      currencySymbol?: string;
      /**
       * Currency code (e.g. "EUR") shown on a CTA button at the inline-end.
       * Clicking it opens the currency selection sheet.
       * Only rendered when currencySymbol is also provided.
       */
      currencyCode?: string;
      /**
       * Callback fired when the user selects a new currency from the sheet.
       * If not provided, the CTA button is hidden (display-only symbol).
       */
      onCurrencyChange?: (code: string) => void;
    }
  >;

  let {
    ref = $bindable(null),
    type,
    type_config = null,
    value = $bindable(""),
    onChange,
    errors = [],
    currencySymbol,
    currencyCode,
    onCurrencyChange,
    class: className,
    ...restProps
  }: Props = $props();

  // InputGroupInput expects HTMLInputElement | null | undefined, but WithElementRef
  // gives HTMLElement | null. Cast to satisfy the type.
  let inputRef = $derived(ref as HTMLInputElement | null);

  const num = useNumericInput({
    type: () => type,
    type_config: () => type_config,
    value: () => value,
  });

  // Whether to render the InputGroup (money with currency adornment) or plain Input.
  let hasCurrencyAdornment = $derived(!!currencySymbol);

  // Sync from prop when external value changes (e.g. form reset, SuperForms reset).
  // Normalize to string for comparison — the form value is always a string
  // (the DB stores text, Zod validates z.string(), native coercion happens at the SDK/BE boundary).
  // svelte-ignore state_referenced_locally -- local mutable state tracking last external value for sync
  let lastValue = $state<string>(String(value));
  $effect(() => {
    const str = String(value);
    if (str !== lastValue) {
      num.syncFromProp();
      lastValue = str;
    }
  });

  // oninput — filter invalid characters in real-time
  function handleInput() {
    num.filterInput();
  }

  // onblur — normalize leading zeros, then notify parent with the string value.
  // The form value stays as a string for Zod validation (z.string()).
  // Native type coercion (bigint/number) happens at the SDK/BE boundary,
  // not during form editing — the DB stores everything as text.
  function handleBlur() {
    num.normalize();
    const str = num.localValue;
    if (str !== lastValue) {
      lastValue = str;
      value = str;
      onChange?.(str);
    }
  }

  // Error rendering — same `key|jsonParams` translation pattern as ConfigValueInput
  let firstError = $derived(errors.length > 0 ? errors[0] : "");
  let hasError = $derived(!!firstError);

  function translateError(error: string): string {
    if (!error.includes("|")) return $t(error);
    const [key, jsonParams] = error.split("|", 2);
    try {
      const params = JSON.parse(jsonParams);
      return $t(key, params);
    } catch {
      return $t(key);
    }
  }

  let translatedError = $derived(firstError ? translateError(firstError) : "");

  // Open the currency selection sheet
  function openCurrencySheet() {
    if (!onCurrencyChange) return;
    openSheet(
      'config.currencySelect',
      {
        currentCurrency: currencyCode ?? num.currency,
        onCurrencyChange,
      },
      { side: 'right', contentClass: 'w-[360px] p-0' },
    );
  }
</script>

<div class="w-full">
  {#if hasCurrencyAdornment}
    <InputGroup
      class="group/input border-primary-gradient hover:brightness-105 focus-within:ring-2 focus-within:ring-ring/50 rounded-md transition-all duration-200 {className}"
    >
      <InputGroupAddon
        align="inline-start"
        class="bg-transparent border-none pr-0"
      >
        <span class="text-sm font-medium text-muted-foreground">{currencySymbol}</span>
      </InputGroupAddon>

      <InputGroupInput
        bind:ref={inputRef}
        inputmode={num.inputMode}
        min={num.effectiveMin ?? undefined}
        bind:value={num.localValue}
        oninput={handleInput}
        onblur={handleBlur}
        aria-invalid={hasError || restProps["aria-invalid"] === "true" || restProps["aria-invalid"] === true}
        data-testid={restProps["data-testid"]}
        placeholder={restProps.placeholder}
        disabled={restProps.disabled}
        id={restProps.id}
        name={restProps.name}
      />

      {#if currencyCode && onCurrencyChange}
        <InputGroupButton
          variant="ghost"
          size="xs"
          class="h-full rounded-l-none rounded-r-md border-left-primary-gradient-soft hover:brightness-105 transition-colors"
          onclick={openCurrencySheet}
          data-testid="numeric-input-currency-cta"
        >
          {currencyCode}
        </InputGroupButton>
      {/if}
    </InputGroup>
  {:else}
    <Input
      bind:ref
      type="text"
      inputmode={num.inputMode}
      min={num.effectiveMin ?? undefined}
      bind:value={num.localValue}
      oninput={handleInput}
      onblur={handleBlur}
      aria-invalid={hasError || restProps["aria-invalid"] === "true" || restProps["aria-invalid"] === true}
      class={cn("w-full", className)}
      {...restProps}
    />
  {/if}
  {#if translatedError}
    <p class="text-xs text-destructive mt-1">{translatedError}</p>
  {/if}
</div>
