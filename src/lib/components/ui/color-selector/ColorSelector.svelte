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
  import { Button } from "$lib/components/ui/button";
  import * as ColorPicker from "$lib/components/ui/color-picker";
  import * as Popover from "$lib/components/ui/popover";

  let {
    value = $bindable(),
    labelKey,
    placeholderKey,
    fallbackColor = "#000000",
    triggerId,
  }: {
    value: string | undefined;
    labelKey: string;
    placeholderKey?: string;
    fallbackColor?: string;
    triggerId?: string;
  } = $props();
</script>

<!-- Color Picker -->
<div>
  <label
    for={triggerId}
    class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
  >
    {$t(labelKey)}
  </label>
  <div class="mt-2">
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="outline" id={triggerId}>
            <div class="flex items-center gap-4">
              <div
                class="w-5 h-5 rounded-full border shadow-sm"
                style="background-color: {value || fallbackColor};"
              ></div>
              {value || (placeholderKey ? $t(placeholderKey) : value)}
            </div>
          </Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="z-[100] w-auto p-0">
        <div class="p-3">
          <ColorPicker.Root bind:value />
        </div>
      </Popover.Content>
    </Popover.Root>
  </div>
</div>
