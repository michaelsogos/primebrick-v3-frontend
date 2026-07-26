<script lang="ts">
	import { cn } from '$lib/utils';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Snippet } from 'svelte';

	export type DialogSeverity =
		| 'primary'
		| 'info'
		| 'success'
		| 'warning'
		| 'destructive'
		| 'neutral';

	export type DialogTone = '' | 'soft';

	let {
		open = $bindable(),
		severity = 'primary',
		tone = '',
		showCloseButton = true,
		class: className = '',
		children,
		...restProps
	}: {
		open?: boolean;
		severity?: DialogSeverity;
		tone?: DialogTone;
		showCloseButton?: boolean;
		class?: string;
		children: Snippet;
		// Pass-through of bits-ui Dialog.Content props (escapeKeydownBehavior,
		// onInteractOutside, etc.) for persistent dialogs.
		[key: string]: unknown;
	} = $props();

	// Resolve severity: explicit `severity` wins; finally default to 'primary'.
	const resolvedSeverity = $derived<DialogSeverity>(
		(severity ?? 'primary') as DialogSeverity,
	);

	// Top accent strip class (tone=""): a colored/gradient bar on the top edge.
	const topStripClass = $derived.by<string>(() => {
		const map: Record<DialogSeverity, string> = {
			primary: 'bg-linear-to-br from-sky-400 to-indigo-400',
			info: 'bg-linear-to-br from-sky-400 to-blue-600',
			success: 'bg-linear-to-br from-emerald-400 to-emerald-600',
			warning:
				'bg-linear-to-r from-yellow-300 via-yellow-500 to-yellow-300 animate-gradient-pan',
			destructive:
				'bg-linear-to-r from-rose-400 via-red-600 to-rose-400 animate-gradient-pan',
			neutral: 'bg-neutral-500',
		};
		return map[resolvedSeverity] ?? 'bg-linear-to-br from-sky-400 to-indigo-400';
	});

	// Soft (full-around gradient border) class (tone="soft"): applied directly on
	// Dialog.Content via the border-<sev>-gradient-popover utilities.
	const softBorderClass = $derived.by<string>(() => {
		const map: Record<DialogSeverity, string> = {
			primary: 'border-primary-gradient-popover',
			info: 'border-info-gradient-popover',
			success: 'border-success-gradient-popover',
			warning: 'border-warning-gradient-popover',
			destructive: 'border-destructive-gradient-popover',
			neutral: 'border-neutral-gradient-popover',
		};
		return map[resolvedSeverity] ?? 'border-primary-gradient-popover';
	});

	const isSoft = $derived(tone === 'soft');
</script>

<Dialog.Root {open} onOpenChange={(e) => (open = e)}>
	{#if isSoft}
		<!-- tone="soft": full-around gradient border on Dialog.Content (no top strip) -->
		<Dialog.Content
			class={cn(softBorderClass, className)}
			{showCloseButton}
			{...restProps}
		>
			{@render children()}
		</Dialog.Content>
	{:else}
		<!-- tone="" (default): top accent strip + inner padded wrapper -->
		<Dialog.Content
			class={cn('p-0', className)}
			{showCloseButton}
			{...restProps}
		>
			<div class="h-2 w-full rounded-t-xl {topStripClass}"></div>
			<div class="p-4">
				{@render children()}
			</div>
		</Dialog.Content>
	{/if}
</Dialog.Root>
