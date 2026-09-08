<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";
  import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "$lib/components/ui/input-group";
  import { CopyButton } from "$lib/components/ui/copy-button";
  import { t } from "$lib/i18n";
  import { openSheet } from "$lib/shell/sheets/sheet-manager.svelte";
  import { parseTypeConfig } from "$lib/config/type-config-schema";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import X from "@lucide/svelte/icons/x";
  import Copy from "@lucide/svelte/icons/copy";
  import Check from "@lucide/svelte/icons/check";

  type Props = WithElementRef<
    Omit<HTMLInputAttributes, "type" | "files"> & {
      /** type_config JSON string — parsed for allowed_protocols and default_protocol. */
      type_config?: string | null;
      /** Bindable value — the URL string. */
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

  const parsedConfig = $derived(parseTypeConfig(type_config));
  const allowedProtocols = $derived(parsedConfig?.allowed_protocols ?? []);
  const defaultProtocol = $derived(parsedConfig?.default_protocol ?? 'https');

  // Extract protocol from current value, or use default
  let currentProtocol = $derived.by(() => {
    if (!value) return defaultProtocol;
    try {
      const url = new URL(value);
      return url.protocol.replace(/:$/, '');
    } catch {
      return defaultProtocol;
    }
  });

  // The URL value without the protocol prefix (for display)
  let urlWithoutProtocol = $derived.by(() => {
    if (!value) return '';
    try {
      const url = new URL(value);
      // Reconstruct without protocol
      return value.replace(/^[a-zA-Z]+:\/\//, '');
    } catch {
      return value;
    }
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

  function openProtocolSheet() {
    if (readonly || disabled) return;
    openSheet(
      'config.protocolSelect',
      {
        currentProtocol,
        allowedProtocols: allowedProtocols.length > 0 ? allowedProtocols : ['http', 'https', 'ftp', 'redis', 'rediss', 'tcp', 'ws', 'wss', 'mailto'],
        onProtocolChange: handleProtocolChange,
      },
      { side: 'right', contentClass: 'w-[360px] p-0' },
    );
  }

  function handleProtocolChange(protocol: string) {
    if (!value) {
      // No value yet — just set the default protocol for next input
      value = `${protocol}://`;
    } else {
      try {
        const url = new URL(value);
        url.protocol = `${protocol}:`;
        value = url.toString();
      } catch {
        // Value is not a valid URL yet — prepend protocol
        const stripped = value.replace(/^[a-zA-Z]+:\/\//, '');
        value = `${protocol}://${stripped}`;
      }
    }
    onChange?.(value);
  }

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

<div class="w-full">
  <InputGroup
    class="group/input border-primary-gradient hover:brightness-105 focus-within:ring-2 focus-within:ring-ring/50 rounded-md transition-all duration-200 {className}"
  >
    <InputGroupButton
      variant="ghost"
      size="xs"
      class="h-full rounded-l-md rounded-r-none border-right-primary-gradient-soft hover:brightness-105 transition-colors font-mono"
      onclick={openProtocolSheet}
      disabled={disabled || readonly}
      data-testid="url-input-protocol-cta"
    >
      {currentProtocol}://
      {#if !readonly && !disabled}
        <ChevronDown class="size-3 ml-0.5 opacity-60" />
      {/if}
    </InputGroupButton>

    <InputGroupInput
      bind:ref={inputRef}
      type="text"
      inputmode="url"
      bind:value
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
        <InputGroupAddon align="inline-end" class="bg-transparent border-none pl-0">
          <button
            type="button"
            onclick={handleCopy}
            tabindex={-1}
            class="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={$t('app.common.copy')}
            title={$t('app.common.copy')}
            data-testid="url-input-copy"
          >
            {#if copied}
              <Check class="size-4 text-primary" />
            {:else}
              <Copy class="size-4" />
            {/if}
          </button>
        </InputGroupAddon>
      {:else}
        <InputGroupAddon align="inline-end" class="bg-transparent border-none pl-0">
          <button
            type="button"
            onclick={handleClear}
            tabindex={-1}
            class="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={$t('app.common.clear')}
            title={$t('app.common.clear')}
            data-testid="url-input-clear"
          >
            <X class="size-4" />
          </button>
        </InputGroupAddon>
      {/if}
    {/if}
  </InputGroup>
  {#if translatedError}
    <p class="text-xs text-destructive mt-1">{translatedError}</p>
  {/if}
</div>
