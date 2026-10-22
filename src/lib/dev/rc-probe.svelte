<script lang="ts">
	// Probe component for the runtime-source-compile spike.
	// Exercises: $state, $derived, event handlers, scoped styles,
	// a host-env import (lucide → cross-runtime seam) and a snippet.
	import { Zap } from '@lucide/svelte';

	let { label = 'probe' }: { label?: string } = $props();
	let count = $state(0);
	let doubled = $derived(count * 2);
</script>

<div class="probe">
	<Zap size={14} />
	<span>{label}: {count} → {doubled}</span>
	<button onclick={() => count++}>+1</button>
</div>

<style>
	.probe {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border: 1px solid #7c3aed;
		border-radius: 6px;
		font-size: 13px;
	}
	.probe button {
		background: #7c3aed;
		color: white;
		border: none;
		border-radius: 4px;
		padding: 2px 8px;
		cursor: pointer;
	}
</style>
