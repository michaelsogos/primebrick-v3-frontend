<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="event-card-message"
	class={cn(
		"mt-0.5 font-sans text-sm font-normal text-foreground/75 dark:text-foreground/80 whitespace-pre-wrap break-words",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

