<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let { children }: { children: Snippet } = $props();
</script>

<Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
	{@render children()}
</Tooltip.Provider>
