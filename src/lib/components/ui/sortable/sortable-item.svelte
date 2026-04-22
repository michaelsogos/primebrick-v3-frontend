<script lang="ts">
	import { cn } from '$lib/utils';
	import { getSortableContext } from './ctx';
	import { onDestroy, onMount, type Snippet } from 'svelte';

	let {
		id,
		class: className,
		children
	}: { id: string; class?: string; children: Snippet } = $props();

	const ctx = getSortableContext();
	let node = $state<HTMLElement>();

	onMount(() => {
		if (node) ctx.registerItem(id, node);
	});
	onDestroy(() => ctx.unregisterItem(id));

	let isDragging = $derived(ctx?.getDraggedId() === id);
</script>

<div
	bind:this={node}
	class={cn('relative transition-all', isDragging && 'opacity-30', className)}
	role="listitem"
	data-sortable-item
	draggable="true"
	ondragstart={(e) => {
		const itemEl = e.currentTarget as HTMLElement;
		// Drag is allowed only when the handle "arms" this item (see SortableHandle).
		if (itemEl.dataset.sortableDragArmed !== '1') {
			e.preventDefault();
			return;
		}
		ctx.onDragStart(e, id);
	}}
	ondragover={(e) => ctx.onDragOver(e, id)}
	ondragend={(e) => {
		const itemEl = e.currentTarget as HTMLElement;
		delete itemEl.dataset.sortableDragArmed;
		ctx.onDragEnd(e);
	}}
>
	{@render children()}
</div>

