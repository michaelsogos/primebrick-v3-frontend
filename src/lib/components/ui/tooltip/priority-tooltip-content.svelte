<script lang="ts">
	import { Content as TooltipPrimitiveContent } from "$lib/vendor/bits-ui-tooltip-exports";
	import type { ContentProps } from "$lib/vendor/bits-ui-tooltip-exports";
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils.js";
	import BadgeInfo from "@lucide/svelte/icons/badge-info";
	import BadgeAlert from "@lucide/svelte/icons/badge-alert";
	import BadgeX from "@lucide/svelte/icons/badge-x";
	import BadgeQuestionMark from "@lucide/svelte/icons/badge-question-mark";
	import Lightbulb from "@lucide/svelte/icons/lightbulb";
	import BadgeCheck from "@lucide/svelte/icons/badge-check";

	export type TooltipPriority =
		| "INFORMATION"
		| "WARNING"
		| "ERROR"
		| "QUESTION"
		| "HINT"
		| "SUCCESS";

	type Props = ContentProps & {
		priority?: TooltipPriority;
		title?: string;
		children: Snippet;
	};

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		priority = "INFORMATION",
		title,
		children,
		...restProps
	}: Props = $props();

	const iconMap = {
		INFORMATION: BadgeInfo,
		WARNING: BadgeAlert,
		ERROR: BadgeX,
		QUESTION: BadgeQuestionMark,
		HINT: Lightbulb,
		SUCCESS: BadgeCheck,
	};
	// Project semaphoric colors — defined in src/app.css @theme block (text-info, text-warning, text-success, text-destructive)
	const colorMap = {
		INFORMATION: "text-info",
		WARNING: "text-warning",
		ERROR: "text-destructive",
		QUESTION: "text-info",
		HINT: "text-info",
		SUCCESS: "text-success",
	};

	const Icon = $derived(iconMap[priority]);
	const colorClass = $derived(colorMap[priority]);
</script>

<TooltipPrimitiveContent
	bind:ref
	{sideOffset}
	class={cn(
		"bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[100] overflow-hidden rounded-md border border-border/60 px-3 py-2 text-xs font-medium shadow-md max-w-xs",
		className
	)}
	{...restProps}
>
	<div class="flex flex-col gap-1">
		{#if title}
			<div class="flex items-center gap-1.5 font-semibold {colorClass}">
				<Icon class="size-3.5 shrink-0" />
				{title}
			</div>
		{:else}
			<Icon class="size-3.5 shrink-0 {colorClass}" />
		{/if}
		<div class="text-background leading-relaxed">
			{@render children()}
		</div>
	</div>
</TooltipPrimitiveContent>