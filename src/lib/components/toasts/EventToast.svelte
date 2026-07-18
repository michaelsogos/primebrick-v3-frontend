<script lang="ts">
	import * as EventCard from "$lib/components/ui/event-card";
	import { Badge } from "$lib/components/ui/badge";
	import { cn } from "$lib/utils";
	import { formatUiDateTime } from "$lib/i18n";
	import { uiLang } from "$lib/i18n/store.svelte";
	import { get } from "svelte/store";

	type ToastTone = "critical" | "error" | "warning" | "info" | "success";
	type AppErrorTag = { label: string; tone: 'danger' | 'neutral' | 'warning' | 'info' | 'success' };

	let {
		label,
		title,
		message,
		time,
		tone = "error",
		tags,
		detail,
	}: {
		label: string;
		title: string;
		message: string;
		time: Date | number | string;
		tone?: ToastTone;
		tags?: AppErrorTag[];
		detail?: string;
	} = $props();

	const eventColor = $derived.by(() => {
		switch (tone) {
			case "critical":
				return "critical";
			case "warning":
				return "warning";
			case "info":
				return "info";
			case "success":
				return "success";
			default:
				return "error";
		}
	});

	const timeText = $derived.by(() => {
		const d = time instanceof Date ? time : new Date(time);
		if (Number.isNaN(d.getTime())) return "";
		return formatUiDateTime(d, get(uiLang));
	});

	function errorTagBadgeClass(tagTone: AppErrorTag['tone']): string {
		switch (tagTone) {
			case 'danger': return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
			case 'warning': return 'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300';
			case 'info': return 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300';
			case 'success': return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
			default: return 'border-border/60 bg-muted/30 text-muted-foreground';
		}
	}
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

		{#if tags?.length}
			<div class="mt-1 flex flex-wrap gap-1">
				{#each tags as tag (tag.label)}
					<Badge
						variant="outline"
						class={cn('h-auto border px-1.5 py-0.5 text-[10px] font-medium', errorTagBadgeClass(tag.tone))}
					>
						{tag.label}
					</Badge>
				{/each}
			</div>
		{/if}

		{#if detail}
			<EventCard.Message class="text-xs">{detail}</EventCard.Message>
		{/if}

		{#if timeText}
			<EventCard.Time>{timeText}</EventCard.Time>
		{/if}
	</div>
</EventCard.Root>

