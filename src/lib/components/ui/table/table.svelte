<script lang="ts">
	import type { HTMLTableAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		containerClass = "",
		class: className,
		children,
		overlay,
		...restProps
	}: WithElementRef<HTMLTableAttributes> & {
		containerClass?: string;
		children?: Snippet;
		/**
		 * Decorative layer rendered inside the scroll container as a sibling of
		 * `<table>` — e.g. the keyboard-focus row frame. `position: relative`
		 * on a `<tr>` is NOT a containing block (Blink ignores it for table
		 * rows), so row-anchored overlays cannot live inside cells; they are
		 * measured against this container and scroll with the content.
		 */
		overlay?: Snippet;
	} = $props();
</script>
<div data-slot="table-container" class={cn("relative w-full overflow-x-auto", containerClass)}>
	<table
		bind:this={ref}
		data-slot="table"
		class={cn("w-full caption-bottom text-sm", className)}
		{...restProps}
	>
		{@render children?.()}
	</table>
	{@render overlay?.()}
</div>
