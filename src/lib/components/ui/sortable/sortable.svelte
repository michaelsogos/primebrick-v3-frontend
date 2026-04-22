<script lang="ts">
	import { cn } from '$lib/utils';
	import { setSortableContext } from './ctx';
	import { onDestroy, tick, type Snippet } from 'svelte';

	let {
		items = $bindable([]),
		class: className,
		children,
		onSort,
		animation = 200
	}: {
		items: any[];
		class?: string;
		children: Snippet;
		onSort?: (items: any[]) => void;
		animation?: number;
	} = $props();

	let draggedId = $state<string | null>(null);
	let itemNodes = new Map<string, HTMLElement>();
	let moveInFlight = $state(false);
	let rootEl = $state<HTMLElement | null>(null);
	let windowDragOverHandler: ((e: DragEvent) => void) | null = null;
	let windowDropHandler: ((e: DragEvent) => void) | null = null;
	let documentDragEnterHandler: ((e: DragEvent) => void) | null = null;

	function eventInsideRoot(e: DragEvent): boolean {
		const root = rootEl;
		if (!root) return false;
		const t = e.target as Node | null;
		if (t && root.contains(t)) return true;
		// Fallback for shadow DOM
		const path = (e as any).composedPath?.() as unknown[] | undefined;
		if (path && path.includes(root)) return true;
		return false;
	}

	function startGlobalDragMode() {
		if (typeof window === 'undefined') return;
		if (!windowDragOverHandler) {
			windowDragOverHandler = (e: DragEvent) => {
				if (!draggedId) return;
				if (!eventInsideRoot(e)) return;
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			};
			// Use capture so we beat nested widgets that may not call preventDefault().
			window.addEventListener('dragover', windowDragOverHandler, { capture: true });
		}
		if (!documentDragEnterHandler) {
			documentDragEnterHandler = (e: DragEvent) => {
				if (!draggedId) return;
				if (!eventInsideRoot(e)) return;
				e.preventDefault();
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			};
			document.addEventListener('dragenter', documentDragEnterHandler, { capture: true });
		}
		if (!windowDropHandler) {
			windowDropHandler = (e: DragEvent) => {
				if (!draggedId) return;
				if (!eventInsideRoot(e)) return;
				e.preventDefault();
			};
			window.addEventListener('drop', windowDropHandler, { capture: true });
		}
	}

	function stopGlobalDragMode() {
		if (typeof window === 'undefined') return;
		if (windowDragOverHandler) {
			window.removeEventListener('dragover', windowDragOverHandler, { capture: true } as any);
			windowDragOverHandler = null;
		}
		if (documentDragEnterHandler) {
			document.removeEventListener('dragenter', documentDragEnterHandler, { capture: true } as any);
			documentDragEnterHandler = null;
		}
		if (windowDropHandler) {
			window.removeEventListener('drop', windowDropHandler, { capture: true } as any);
			windowDropHandler = null;
		}
	}

	async function move(fromIdx: number, toIdx: number) {
		const rects = new Map<string, DOMRect>();
		itemNodes.forEach((node, id) => rects.set(id, node.getBoundingClientRect()));

		const newItems = [...items];
		const [item] = newItems.splice(fromIdx, 1);
		newItems.splice(toIdx, 0, item);
		items = newItems;
		onSort?.(newItems);

		await tick();

		itemNodes.forEach((node, id) => {
			const prev = rects.get(id);
			if (!prev) return;
			const curr = node.getBoundingClientRect();
			const dx = prev.left - curr.left;
			const dy = prev.top - curr.top;
			if (dx || dy) {
				node.style.transition = 'none';
				node.style.transform = `translate(${dx}px, ${dy}px)`;
				node.offsetHeight;
				node.style.transition = `transform ${animation}ms cubic-bezier(0.2, 0, 0, 1)`;
				node.style.transform = '';
			}
		});
	}

	setSortableContext({
		getDraggedId: () => draggedId,
		registerItem: (id, node) => itemNodes.set(id, node),
		unregisterItem: (id) => itemNodes.delete(id),
		onDragStart: (e, id) => {
			draggedId = id;
			startGlobalDragMode();
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				// Required by some browsers to keep a consistent "move" cursor.
				try {
					e.dataTransfer.setData('text/plain', id);
				} catch {
					// ignore
				}
				const ghost = document.createElement('div');
				e.dataTransfer.setDragImage(ghost, 0, 0);
			}
		},
		onDragOver: (e, targetId) => {
			if (!draggedId || draggedId === targetId) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			if (moveInFlight) return;

			const fromIdx = items.findIndex((i) => i.id === draggedId);
			const toIdx = items.findIndex((i) => i.id === targetId);

			if (fromIdx === -1 || toIdx === -1) return;

			// Reduce flicker by only reordering after crossing the midpoint of the hovered item.
			const targetNode = itemNodes.get(targetId);
			if (targetNode) {
				const r = targetNode.getBoundingClientRect();
				const midY = r.top + r.height / 2;
				if (fromIdx > toIdx) {
					// dragging upwards: only swap when cursor is in upper half
					if (e.clientY > midY) return;
				} else if (fromIdx < toIdx) {
					// dragging downwards: only swap when cursor is in lower half
					if (e.clientY < midY) return;
				}
			}

			moveInFlight = true;
			void move(fromIdx, toIdx).finally(() => {
				moveInFlight = false;
			});
		},
		onDragEnd: () => {
			draggedId = null;
			moveInFlight = false;
			stopGlobalDragMode();
		}
	});

	onDestroy(() => stopGlobalDragMode());
</script>

<div
	bind:this={rootEl}
	class={cn(className, draggedId ? 'pb-sortable-root--dragging' : undefined)}
	role="list"
	ondragover={(e) => {
		// Ensure the cursor stays in "move" state even when hovering container gaps.
		if (!draggedId) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}}
	ondrop={(e) => {
		// Prevent "not-allowed" flashes when dropping on non-item gaps.
		if (!draggedId) return;
		e.preventDefault();
	}}
>
	{@render children()}
</div>

