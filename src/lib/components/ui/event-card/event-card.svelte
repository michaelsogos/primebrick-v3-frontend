<script lang="ts">
	import { cn } from "$lib/utils.js";
	import { CircleAlert, Info, TriangleAlert } from "lucide-svelte";

	type EventColor = "critical" | "error" | "warning" | "info";

	let { class: className, eventColor = "info" }: { class?: string; eventColor?: EventColor } = $props();

	const icon = $derived.by(() => {
		switch (eventColor) {
			case "warning":
				return TriangleAlert;
			case "critical":
			case "error":
				return CircleAlert;
			default:
				return Info;
		}
	});

	const iconClass = $derived.by(() => {
		switch (eventColor) {
			case "warning":
				return "bg-amber-100 text-amber-800 ring-1 ring-amber-500 dark:bg-amber-950 dark:text-amber-200";
			case "critical":
			case "error":
				return "bg-red-100 text-red-800 ring-1 ring-red-500 dark:bg-red-950 dark:text-red-200";
			default:
				return "bg-sky-100 text-sky-800 ring-1 ring-sky-500 dark:bg-sky-950 dark:text-sky-200";
		}
	});

	const Icon = $derived.by(() => icon);
</script>

<div
	data-slot="event-card-icon"
	class={cn("mt-0.5 grid size-9 place-items-center rounded-full", iconClass, className)}
>
	<Icon class="size-5" />
</div>

