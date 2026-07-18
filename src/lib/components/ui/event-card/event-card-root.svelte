<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	type EventColor = "critical" | "error" | "warning" | "info" | "success";

	let {
		ref = $bindable(null),
		class: className,
		eventColor = "info",
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		eventColor?: EventColor;
	} = $props();

	const tintClass = (c: EventColor) => {
		switch (c) {
			case "critical":
				return "bg-red-100 dark:bg-red-950";
			case "error":
				return "bg-red-50 dark:bg-red-900";
			case "warning":
				return "bg-amber-50 dark:bg-amber-950";
			case "success":
				return "bg-emerald-50 dark:bg-emerald-950";
			default:
				return "bg-sky-50 dark:bg-sky-950";
		}
	};

	const indicatorClass = (c: EventColor) => {
		switch (c) {
			case "critical":
				return "before:bg-red-600 dark:before:bg-red-400";
			case "error":
				return "before:bg-red-500 dark:before:bg-red-400";
			case "warning":
				return "before:bg-amber-500 dark:before:bg-amber-400";
			case "success":
				return "before:bg-emerald-500 dark:before:bg-emerald-400";
			default:
				return "before:bg-sky-500 dark:before:bg-sky-400";
		}
	};

	const borderClass = (c: EventColor) => {
		switch (c) {
			case "critical":
				return "border-red-300 dark:border-red-800";
			case "error":
				return "border-red-200 dark:border-red-700";
			case "warning":
				return "border-amber-200 dark:border-amber-800";
			case "success":
				return "border-emerald-200 dark:border-emerald-800";
			default:
				return "border-sky-200 dark:border-sky-800";
		}
	};
</script>

<div
	bind:this={ref}
	data-slot="event-card-root"
	data-event-color={eventColor}
	class={cn(
		"relative w-full overflow-hidden rounded-xl border px-3 py-2 pl-5 shadow-sm font-sans",
		"before:absolute before:inset-y-2 before:left-2 before:w-1 before:rounded-full before:content-['']",
		"flex flex-col",
		tintClass(eventColor),
		borderClass(eventColor),
		indicatorClass(eventColor),
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

