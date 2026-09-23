<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";
  import { InputGroup, InputGroupButton, InputGroupInput } from "$lib/components/ui/input-group";
  import { CopyButton } from "$lib/components/ui/copy-button";
  import { t } from "$lib/i18n";
  import { openSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import { parseTypeConfig } from "$lib/config/type-config-schema";
  import { getCountryData } from "countries-list";
  import type { TCountryCode } from "countries-list";
  import { AsYouType } from "libphonenumber-js";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import X from "@lucide/svelte/icons/x";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, "type" | "files"> & {
      /** type_config JSON string — parsed for country and allowed_countries. */
      type_config?: string | null;
      /** Bindable value — the phone number in E.164 format. */
      value?: string;
      /** Optional callback fired on blur with the canonical E.164 string value. */
      onChange?: (value: string) => void;
      /** Errors array (i18n keys in `key|jsonParams` format) — renders below input. */
      errors?: string[];
      /** Readonly mode — shows copy button instead of clear. */
      readonly?: boolean;
      /** Disabled mode. */
      disabled?: boolean;
    }
  >;

  let {
    ref = $bindable(null),
    type_config = null,
    value = $bindable(""),
    onChange,
    errors = [],
    readonly = false,
    disabled = false,
    class: className,
    ...restProps
  }: Props = $props();

  let inputRef = $derived(ref as HTMLInputElement | null);
  let copied = $state(false);
  let displayValue = $state('');

  const parsedConfig = $derived(parseTypeConfig(type_config));
  const country = $derived(parsedConfig?.country ?? 'US');
  const allowedCountries = $derived(parsedConfig?.allowed_countries);

  // Country phone prefix for display in the CTA button
  let countryPrefix = $derived.by(() => {
    try {
      const data = getCountryData(country as TCountryCode);
      if (data?.phone && data.phone.length > 0) {
        return `+${data.phone[0]}`;
      }
    } catch {
      // ignore
    }
    return '+1';
  });

  let countryFlag = $derived.by(() => {
    // Convert ISO 3166-1 alpha-2 to flag emoji
    if (!country || country.length !== 2) return '';
    const codePoints = country
      .toUpperCase()
      .split('')
      .map((c) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  });

  let hasError = $derived(errors.length > 0);
  let firstError = $derived(errors.length > 0 ? errors[0] : "");

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

  // Sync display value from prop (E.164 → formatted)
  $effect(() => {
    if (!value) {
      displayValue = '';
      return;
    }
    // If value is E.164, format it for display using AsYouType
    try {
      const formatter = new AsYouType(country as any);
      displayValue = formatter.input(value);
    } catch {
      displayValue = value;
    }
  });

  function openPhonePrefixSheet() {
    if (readonly || disabled) return;
    openSheet(
      'config.phonePrefixSelect',
      {
        currentCountry: country,
        allowedCountries,
        onCountryChange: handleCountryChange,
      }
    );
  }

  function handleCountryChange(newCountry: string) {
    // Re-parse the current value with the new country
    // The value stays in E.164, but the display will re-format
    // For now, just trigger re-render via the effect
    // The actual country change should update type_config, which is handled by the parent
    // This callback is for display purposes only — the parent component handles type_config updates
  }

  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const raw = input.value;
    // Format as user types using AsYouType
    try {
      const formatter = new AsYouType(country as any);
      displayValue = formatter.input(raw);
      // Get the E.164 number from the formatter
      const phoneNumber = formatter.getNumber();
      value = phoneNumber ? phoneNumber.formatInternational() : raw;
    } catch {
      displayValue = raw;
      value = raw;
    }
  }

  function handleBlur() {
    onChange?.(value);
  }

  function handleClear() {
    value = "";
    displayValue = "";
    onChange?.(value);
    ref?.focus();
  }

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      // ignore
    }
  }
</script>

<div class="w-full">
  <InputGroup
    class="group/input border-primary-gradient hover:brightness-105 focus-within:ring-2 focus-within:ring-ring/50 rounded-md transition-all duration-200 {className}"
  >
    <InputGroupButton
      variant="ghost"
      size="xs"
      class="h-full rounded-l-md rounded-r-none border-right-primary-gradient-soft hover:brightness-105 transition-colors"
      onclick={openPhonePrefixSheet}
      disabled={disabled || readonly}
      data-testid="phone-input-prefix-cta"
    >
      <span class="text-base">{countryFlag}</span>
      <span class="font-mono text-sm ml-1">{countryPrefix}</span>
      {#if !readonly && !disabled}
        <ChevronDown class="size-3 ml-0.5 opacity-60" />
      {/if}
    </InputGroupButton>

    <InputGroupInput
      bind:ref={inputRef}
      type="tel"
      inputmode="tel"
      value={displayValue}
      oninput={handleInput}
      onblur={handleBlur}
      aria-invalid={hasError || restProps["aria-invalid"] === "true" || restProps["aria-invalid"] === true}
      data-testid={restProps["data-testid"]}
      placeholder={restProps.placeholder}
      {disabled}
      {readonly}
      id={restProps.id}
      name={restProps.name}
    />

    {#if value && !disabled}
      {#if readonly}
        <button
          type="button"
          onclick={handleCopy}
          tabindex={-1}
          class="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={$t('app.common.copy')}
          title={$t('app.common.copy')}
          data-testid="phone-input-copy"
        >
          {#if copied}
            <Check class="size-4 text-primary" />
          {:else}
            <Copy class="size-4" />
          {/if}
        </button>
      {:else}
        <button
          type="button"
          onclick={handleClear}
          tabindex={-1}
          class="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={$t('app.common.clear')}
          title={$t('app.common.clear')}
          data-testid="phone-input-clear"
        >
          <X class="size-4" />
        </button>
      {/if}
    {/if}
  </InputGroup>
  {#if translatedError}
    <p class="text-xs text-destructive mt-1">{translatedError}</p>
  {/if}
</div>
