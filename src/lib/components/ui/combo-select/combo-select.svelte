<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { t } from "$lib/i18n";
  import * as Popover from "$lib/components/ui/popover";
  import * as Command from "$lib/components/ui/command";
  import Badge from "$lib/components/ui/badge/badge.svelte";
  import X from "@lucide/svelte/icons/x";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Check from "@lucide/svelte/icons/check";
  import type { Snippet } from "svelte";
  import { inputTrailingIconColorClasses } from "$lib/components/ui/input/input-chrome.js";

  type ComboSelectMode = "single" | "multi";

  type Props = {
    mode: ComboSelectMode;
    value: string | string[];
    onChange?: (value: string | string[]) => void;
    options: string[] | Record<string, any>[];
    valueField?: string;
    labelField?: string;
    isLabelTranslated?: boolean;
    placeholder?: string;
    disabled?: boolean;
    loading?: boolean;
    id?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    itemSnippet?: Snippet<[{
      option: string | Record<string, any>;
      selected: boolean;
      resolvedLabel: string;
      resolvedValue: string;
    }]>;
    isOptionDisabled?: (option: string | Record<string, any>) => boolean;
    /**
     * Extra search terms for an option, used both by ComboSelect's own filter
     * and passed to bits-ui's `Command.Item` `keywords` prop to boost scoring.
     * Lets users search by fields not present in `value`/`label` (e.g. permissions, badges).
     */
    getSearchKeywords?: (option: string | Record<string, any>) => string[];
    selectedSnippet?: Snippet<[{
      option: string | Record<string, any>;
      resolvedLabel: string;
      resolvedValue: string;
    }]>;
    "aria-invalid"?: boolean | "true" | "false";
    "aria-describedby"?: string;
    "aria-required"?: boolean | "true" | "false";
    "data-fs-error"?: string;
    [key: string]: unknown;
  };

  let {
    mode,
    value = $bindable(),
    onChange,
    options,
    valueField,
    labelField,
    isLabelTranslated = false,
    placeholder = "Select...",
    disabled = false,
    loading = false,
    id,
    searchable = true,
    searchPlaceholder = "Search...",
    itemSnippet,
    isOptionDisabled,
    getSearchKeywords,
    selectedSnippet,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedby,
    "aria-required": ariaRequired,
    "data-fs-error": dataFsError,
    ...restProps
  }: Props = $props();

  let open = $state(false);
  let search = $state("");

  // --- Value & label resolution ---

  function resolveValue(opt: string | Record<string, any>): string {
    if (typeof opt === "string") return opt;
    if (valueField) {
      const v = getByPath(opt, valueField);
      return v != null ? String(v) : String(opt);
    }
    return String(opt);
  }

  function resolveLabel(opt: string | Record<string, any>): string {
    if (typeof opt === "string") {
      return isLabelTranslated ? $t(opt) : opt;
    }
    if (labelField) {
      const raw = getByPath(opt, labelField);
      if (raw == null) return resolveValue(opt);
      const rawStr = String(raw);
      return isLabelTranslated ? $t(rawStr) : rawStr;
    }
    return resolveValue(opt);
  }

  function getByPath(obj: Record<string, any>, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in acc) {
        return (acc as Record<string, any>)[key];
      }
      return undefined;
    }, obj);
  }

  // --- Normalized options with resolved value/label ---

  type NormalizedOption = {
    raw: string | Record<string, any>;
    value: string;
    label: string;
  };

  let normalizedOptions = $derived.by<NormalizedOption[]>(() => {
    return options.map((opt) => {
      const raw = opt as string | Record<string, any>;
      return {
        raw,
        value: resolveValue(raw),
        label: resolveLabel(raw),
      };
    });
  });

  // --- Selection state ---
  // `value` (bindable) is the single source of truth. No duplicate state, no sync
  // effect — a previous internalValue + sync $effect caused effect_update_depth_exceeded
  // for array (multi) values, because two distinct proxies are never ===, so the
  // effect wrote internalValue = value on every run and never converged.

  function syncChange(v: string | string[]) {
    value = v;
    onChange?.(v);
  }

  // --- Single mode helpers ---

  let selectedNormalized = $derived.by<NormalizedOption | null>(() => {
    if (mode !== "single") return null;
    const v = value as string;
    return normalizedOptions.find((o) => o.value === v) ?? null;
  });

  function handleSelectSingle(opt: NormalizedOption) {
    syncChange(opt.value);
    open = false;
    search = "";
  }

  function handleClearSingle() {
    syncChange("");
  }

  // --- Multi mode helpers ---

  let selectedValues = $derived.by<string[]>(() => {
    if (mode !== "multi") return [];
    return Array.isArray(value) ? value : [];
  });

  function handleToggleMulti(opt: NormalizedOption) {
    const current = selectedValues;
    if (current.includes(opt.value)) {
      syncChange(current.filter((v) => v !== opt.value));
    } else {
      syncChange([...current, opt.value]);
    }
  }

  function handleRemoveMulti(val: string) {
    syncChange(selectedValues.filter((v) => v !== val));
  }

  function handleClearMulti() {
    syncChange([]);
  }

  // --- Filtering ---

  let filteredOptions = $derived.by<NormalizedOption[]>(() => {
    if (!search) return normalizedOptions;
    const lowerSearch = search.toLowerCase();
    return normalizedOptions.filter((opt) => {
      if (opt.label.toLowerCase().includes(lowerSearch)) return true;
      if (opt.value.toLowerCase().includes(lowerSearch)) return true;
      const kws = getSearchKeywords?.(opt.raw) ?? [];
      return kws.some((k) => k.toLowerCase().includes(lowerSearch));
    });
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props: triggerProps })}
      <div
        {...triggerProps}
        {id}
        role="combobox"
        tabindex={disabled ? -1 : 0}
        class={cn(
          "min-h-9 w-full rounded-md border-primary-gradient bg-background px-3 py-1 text-sm ring-offset-background outline-hidden transition-all hover:brightness-105",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "cursor-pointer flex items-center text-left",
          "aria-invalid:border-destructive-gradient aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
        )}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        aria-required={ariaRequired}
        data-fs-error={dataFsError}
      >
        {#if mode === "single"}
          {#if selectedNormalized}
            {#if selectedSnippet}
              {@render selectedSnippet({
                option: selectedNormalized.raw,
                resolvedLabel: selectedNormalized.label,
                resolvedValue: selectedNormalized.value,
              })}
            {:else}
              <span class="flex-1 truncate text-left">
                {selectedNormalized.label}
              </span>
            {/if}
          {:else}
            <span class="flex-1 truncate text-left text-muted-foreground">
              {placeholder}
            </span>
          {/if}
        {:else}
          {#if selectedValues.length === 0}
            <span class="flex-1 truncate text-left text-muted-foreground">
              {placeholder}
            </span>
          {:else}
            <div class="flex flex-1 flex-wrap gap-2 items-center text-left">
              {#each selectedValues as val (val)}
                {@const opt = normalizedOptions.find((o) => o.value === val)}
                <Badge variant="secondary" class="gap-1">
                  {opt?.label ?? val}
                  {#if !disabled}
                    <button
                      type="button"
                      onclick={(e) => {
                        e.stopPropagation();
                        handleRemoveMulti(val);
                      }}
                      class="rounded-full hover:bg-muted hover:text-foreground p-0.5"
                    >
                      <X class="h-3 w-3" />
                    </button>
                  {/if}
                </Badge>
              {/each}
            </div>
          {/if}
        {/if}
        <div class="ml-auto flex items-center gap-1 shrink-0">
          {#if mode === "single" && value && !disabled}
            <button
              type="button"
              onclick={(e) => { e.stopPropagation(); handleClearSingle(); }}
              class={inputTrailingIconColorClasses}
              aria-label={$t("common.clearSelection")}
              title={$t("common.clearSelection")}
            >
              <X class="h-3.5 w-3.5" />
            </button>
          {/if}
          {#if mode === "multi" && selectedValues.length > 0 && !disabled}
            <button
              type="button"
              onclick={(e) => { e.stopPropagation(); handleClearMulti(); }}
              class={inputTrailingIconColorClasses}
              aria-label={$t("common.clearSelection")}
              title={$t("common.clearSelection")}
            >
              <X class="h-3.5 w-3.5" />
            </button>
          {/if}
          {#if loading}
            <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          {:else}
            <ChevronDown class="h-4 w-4 text-muted-foreground" />
          {/if}
        </div>
      </div>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content align="start" class="w-(--bits-popover-anchor-width) min-w-56 p-0">
    <Command.Root shouldFilter={searchable}>
      {#if searchable}
        <Command.Input
          bind:value={search}
          placeholder={searchPlaceholder}
        />
      {/if}
      <Command.List>
        {#if filteredOptions.length === 0}
          <Command.Empty>No results found.</Command.Empty>
        {:else}
          {#each filteredOptions as opt (opt.value)}
            {@const isDisabled = isOptionDisabled ? isOptionDisabled(opt.raw) : false}
            <Command.Item
              value={opt.value}
              keywords={getSearchKeywords ? getSearchKeywords(opt.raw) : undefined}
              disabled={isDisabled}
              class={cn(
                "relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden",
                "data-highlighted:bg-muted data-highlighted:text-foreground",
                "data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:text-muted-foreground data-disabled:data-highlighted:bg-transparent",
                "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              )}
              onSelect={() => {
                if (isDisabled) return;
                if (mode === "single") {
                  handleSelectSingle(opt);
                } else {
                  handleToggleMulti(opt);
                }
              }}
            >
              <div class="flex items-center gap-2 w-full">
                {#if mode === "multi"}
                  <div class={cn(
                    "combo-select-checkbox h-4 w-4 rounded border shrink-0 flex items-center justify-center",
                    selectedValues.includes(opt.value) ? "bg-primary border-primary" : "border-input",
                  )}>
                    {#if selectedValues.includes(opt.value)}
                      <Check class="h-3 w-3 text-primary-foreground" />
                    {/if}
                  </div>
                {/if}
                {#if itemSnippet}
                  {@render itemSnippet({
                    option: opt.raw,
                    selected: mode === "multi" ? selectedValues.includes(opt.value) : (value as string) === opt.value,
                    resolvedLabel: opt.label,
                    resolvedValue: opt.value,
                  })}
                {:else}
                  <span class="flex-1 truncate text-left">{opt.label}</span>
                {/if}
              </div>
            </Command.Item>
          {/each}
        {/if}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
