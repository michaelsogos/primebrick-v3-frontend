<script lang="ts">
  /**
   * ColorSelector — generic color picker component with a Popover trigger
   * button showing a color swatch and the current hex value.
   *
   * Consolidates the duplicated Popover + Button + swatch + label block (D-12)
   * across Profile, Create User, and Edit User pages.
   *
   * Not avatar-specific — can be used for any color selection field.
   */
  import { t } from "$lib/i18n";
  import { cn } from "$lib/utils";
  import { Button } from '@primebrick/ui';
  import * as ColorPicker from "$lib/components/ui/color-picker";
  import { Popover, CopyButton, inputTrailingIconButtonClasses } from '@primebrick/ui';
  import { Eraser } from '@primebrick/ui/vendor/lucide';

  let {
    value = $bindable(),
    labelKey,
    placeholderKey,
    placeholder,
    fallbackColor = "#000000",
    triggerId,
    disabled = false,
  }: {
    value: string | undefined;
    /** Absent → the caller renders the field label itself (form/field
     *  anatomy owns the label row); present → the selector paints its
     *  own label like the standalone picker pages. */
    labelKey?: string;
    placeholderKey?: string;
    /** Already-resolved hint text — form surfaces translate the
     *  placement's `placeholder_key` upstream and pass the string. */
    placeholder?: string;
    fallbackColor?: string;
    triggerId?: string;
    /** Readonly surfaces: the trigger stays visible (swatch + hex) but
     *  the popover cannot open — the field is display-only. */
    disabled?: boolean;
  } = $props();

  // Same trailing-CTA contract as the text inputs (input-anatomy.mdx):
  // editable → eraser clear (always rendered, disabled while empty);
  // display-only → copy, only when there is a value to copy.
  let showTrailing = $derived(!disabled || (value ?? "").length > 0);
  let clearDisabled = $derived((value ?? "").length === 0);

  function handleClear() {
    value = undefined;
  }
</script>

<!-- Color Picker -->
<div>
  {#if labelKey}
    <label
      for={triggerId}
      class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
      {$t(labelKey)}
    </label>
  {/if}
  <div class={labelKey ? "mt-2" : undefined}>
    <Popover.Root>
      <div class="relative">
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="outline" id={triggerId} {disabled} class={cn("w-full justify-start disabled:border-disabled disabled:hover:brightness-100 disabled:opacity-100", showTrailing && "pr-9")}>
              <div class="flex w-full items-center gap-4">
                <div
                  class="w-5 h-5 rounded-full border shadow-sm"
                  style="background-color: {value || fallbackColor};"
                ></div>
                {value || placeholder || (placeholderKey ? $t(placeholderKey) : value)}
              </div>
            </Button>
          {/snippet}
        </Popover.Trigger>
        {#if showTrailing}
          {#if disabled}
            <CopyButton
              text={value ?? ""}
              variant="ghost"
              size="icon"
              class={inputTrailingIconButtonClasses}
              aria-label={$t('app.common.copy')}
              title={$t('app.common.copy')}
              data-testid="color-selector-copy"
            />
          {:else}
            <button
              type="button"
              onclick={handleClear}
              tabindex={-1}
              disabled={clearDisabled}
              class={inputTrailingIconButtonClasses}
              aria-label={$t('app.common.clear')}
              title={$t('app.common.clear')}
              data-testid="color-selector-clear"
            >
              <Eraser class="size-4" />
            </button>
          {/if}
        {/if}
      </div>
      <Popover.Content class="z-[100] w-auto p-0">
        <div class="p-3">
          <ColorPicker.Root bind:value />
        </div>
      </Popover.Content>
    </Popover.Root>
  </div>
</div>
