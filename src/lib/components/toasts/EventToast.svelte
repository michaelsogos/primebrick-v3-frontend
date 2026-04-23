<script lang="ts">
	import * as EventCard from "$lib/components/ui/event-card";
	import { formatUiDateTime } from "$lib/i18n";
	import { uiLang } from "$lib/i18n/store.svelte";
	import { get } from "svelte/store";

	type ToastTone = "critical" | "error" | "warning" | "info";

	let {
		label,
		title,
		message,
		time,
		tone = "error",
	}: {
		label: string;
		title: string;
		message: string;
		time: Date | number | string;
		tone?: ToastTone;
	} = $props();

	const eventColor = $derived.by(() => {
		switch (tone) {
			case "critical":
				return "critical";
			case "warning":
				return "warning";
			case "info":
				return "info";
			default:
				return "error";
		}
	});

	const timeText = $derived.by(() => {
		const d = time instanceof Date ? time : new Date(time);
		if (Number.isNaN(d.getTime())) return "";
		return formatUiDateTime(d, get(uiLang));
	});
</script>

<EventCard.Root eventColor={eventColor} class="max-w-[420px]">
	<div class="min-w-0 space-y-1.5">
		<div class="flex items-start justify-between">
			<EventCard.Label eventColor={eventColor}>
				{label}
			</EventCard.Label>
		</div>

		<EventCard.Title class="truncate">{title}</EventCard.Title>

		<EventCard.Message>{message}</EventCard.Message>

		{#if timeText}
			<EventCard.Time>{timeText}</EventCard.Time>
		{/if}
	</div>
</EventCard.Root>

