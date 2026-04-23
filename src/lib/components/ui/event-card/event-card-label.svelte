<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	type EventColor = "critical" | "error" | "warning" | "info";

	let {
		ref = $bindable(null),
		class: className,
		eventColor = "info",
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		eventColor?: EventColor;
	} = $props();

	const labelColorClass = (c: EventColor) => {
		switch (c) {
			case "critical":
				return "text-red-700 dark:text-red-300";
			case "error":
				return "text-red-600 dark:text-red-400";
			case "warning":
				return "text-amber-700 dark:text-amber-400";
			default:
				return "text-sky-700 dark:text-sky-400";
		}
	};
</script>

<div
	bind:this={ref}
	data-slot="event-card-label"
	class={cn(
		"inline-flex items-center font-sans text-[10px] font-bold uppercase tracking-widest",
		labelColorClass(eventColor),
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

