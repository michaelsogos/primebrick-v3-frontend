<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";
  import Input from "$lib/components/ui/input/input.svelte";
  import { CopyButton } from "$lib/components/ui/copy-button";
  import { t } from "$lib/i18n";
  import X from "@lucide/svelte/icons/x";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";
  import { inputTrailingIconButtonClasses } from "$lib/components/ui/input/input-chrome.js";

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, "type" | "files"> & {
      /** Bindable value — the email string. */
      value?: string;
      /** Optional callback fired on blur with the canonical string value. */
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
    value = $bindable(""),
    onChange,
    errors = [],
    readonly = false,
    disabled = false,
    class: className,
    ...restProps
  }: Props = $props();

  let copied = $state(false);

  let mode = $derived(disabled ? "disabled" : readonly ? "readonly" : "editable");
  let showTrailing = $derived(mode !== "disabled" && (value ?? "").length > 0);
  let hasError = $derived(errors.length > 0);
  let firstError = $derived(errors.length > 0 ? errors[0] : "");

  let inputClass = $derived(
    cn(
      showTrailing && "pr-9",
      mode === "readonly" && "border-readonly-gradient",
      mode === "disabled" && "border-readonly-gradient",
      "border-primary-gradient hover:brightness-105 focus-within:ring-2 focus-within:ring-ring/50 rounded-md transition-all duration-200",
      className,
    ),
  );

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

  function handleBlur() {
    onChange?.(value);
  }

  function handleClear() {
    value = "";
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

<div class="relative w-full">
  <Input
    bind:ref
    bind:value
    type="email"
    inputmode="email"
    onblur={handleBlur}
    aria-invalid={hasError || restProps["aria-invalid"] === "true" || restProps["aria-invalid"] === true}
    class={inputClass}
    data-testid={restProps["data-testid"]}
    placeholder={restProps.placeholder}
    {readonly}
    {disabled}
    id={restProps.id}
    name={restProps.name}
  />

  {#if showTrailing}
    {#if mode === "readonly"}
      <button
        type="button"
        onclick={handleCopy}
        tabindex={-1}
        class={cn(inputTrailingIconButtonClasses, "text-foreground")}
        aria-label={$t('app.common.copy')}
        title={$t('app.common.copy')}
        data-testid="email-input-copy"
      >
        {#if copied}
          <Check class="size-4 text-primary" />
        {:else}
          <Copy class="size-4" />
        {/if}
      </button>
    {:else if mode === "editable"}
      <button
        type="button"
        onclick={handleClear}
        tabindex={-1}
        class={inputTrailingIconButtonClasses}
        aria-label={$t('app.common.clear')}
        title={$t('app.common.clear')}
        data-testid="email-input-clear"
      >
        <X class="size-4" />
      </button>
    {/if}
  {/if}

  {#if translatedError}
    <p class="text-xs text-destructive mt-1">{translatedError}</p>
  {/if}
</div>
