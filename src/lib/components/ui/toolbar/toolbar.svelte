<script lang="ts">
  import { Toolbar as ToolbarPrimitive } from "bits-ui";
  import type { ToolbarRootProps } from "bits-ui";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<ToolbarRootProps> = $props();
</script>

<ToolbarPrimitive.Root
  bind:ref
  data-slot="toolbar"
  class={cn(
    "flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-1.5",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</ToolbarPrimitive.Root>
