<script lang="ts">
	import { cn } from '$lib/utils';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Snippet } from 'svelte';

	type ColorVariant =
		| 'primary'
		| 'info'
		| 'warning'
		| 'success'
		| 'destructive'
		| 'neutral'
		| string;

	let {
		open = $bindable(),
		showCloseButton = true,
		class: className = '',
		color = 'primary',
		children
	}: {
		open?: boolean;
		showCloseButton?: boolean;
		class?: string;
		color?: ColorVariant;
		children: Snippet;
	} = $props();

	const borderColor = $derived(() => {
		const colorMap: Record<ColorVariant, string> = {
			primary: 'border-t-primary',
			info: 'border-t-info',
			warning: 'border-t-warning',
			success: 'border-t-success',
			destructive: 'border-t-destructive',
			neutral: 'border-t-neutral-500',
		};

		if (color in colorMap) {
			return colorMap[color as keyof typeof colorMap];
		}
		return '';
	});

	const colorClass = (() => {
		const colorMap: Record<ColorVariant, string> = {
			primary: 'bg-primary',
			info: 'bg-info',
			warning: 'bg-linear-to-r from-yellow-300 via-yellow-500 to-yellow-300 animate-gradient-pan',
			success: 'bg-success',
			destructive: 'bg-linear-to-r from-rose-400 via-red-600 to-rose-400 animate-gradient-pan',
			neutral: 'bg-neutral-500',
		};

		if (color in colorMap) {
			return colorMap[color as keyof typeof colorMap];
		}
		return 'bg-primary';
	})();
</script>

<Dialog.Root {open} onOpenChange={(e) => open = e}>
	<Dialog.Content
		class={cn('p-0', className)}
		{showCloseButton}
	>
		<div class="h-2 w-full rounded-t-xl {colorClass}"></div>
		<div class="p-4">
			{@render children()}
		</div>
	</Dialog.Content>
</Dialog.Root>
