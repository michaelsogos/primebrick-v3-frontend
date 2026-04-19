<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		/** When true, do not paint all cells `bg-muted` on row hover (entity list applies per-cell palette hovers). */
		suppressCellHoverMuted = false,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>> & { suppressCellHoverMuted?: boolean } = $props();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn(
		!suppressCellHoverMuted && "hover:[&,&>svelte-css-wrapper]:[&>th,td]:bg-muted",
		"data-[state=selected]:bg-muted border-b transition-colors",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</tr>
