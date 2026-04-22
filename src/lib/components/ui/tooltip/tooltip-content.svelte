<script lang="ts">
	import { Content as TooltipPrimitiveContent } from "$lib/vendor/bits-ui-tooltip-exports";
	import type { ContentProps } from "$lib/vendor/bits-ui-tooltip-exports";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		...restProps
	}: ContentProps = $props();
</script>

<TooltipPrimitiveContent
	bind:ref
	{sideOffset}
	class={cn(
		"bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 overflow-hidden rounded-md border border-border/60 px-2 py-1 text-xs font-medium shadow-md",
		className
	)}
	{...restProps}
/>
