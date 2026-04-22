<script lang="ts">
	import { cn } from '$lib/utils';
	import { GripVertical } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let { class: className, children }: { class?: string; children?: Snippet } = $props();
</script>

<div
	class={cn('cursor-grab active:cursor-grabbing p-1 touch-none', className)}
	data-sortable-handle
	role="button"
	tabindex="0"
	onmousedown={(e) => {
		const el = e.currentTarget as HTMLElement;
		const item = el.closest('[data-sortable-item]');
		if (item instanceof HTMLElement) item.dataset.sortableDragArmed = '1';
	}}
>
	{#if children}
		{@render children()}
	{:else}
		<GripVertical class="size-4 opacity-50" />
	{/if}
</div>

