<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SessionExpiredDialog from '$lib/components/auth/SessionExpiredDialog.svelte';
	import { loadAuthConfig } from '$lib/auth-config-store.svelte';

	let { children }: { children: Snippet } = $props();

	// Load public auth config once at app startup so the LoginForm and
	// SessionExpiredDialog know which login methods (form / passkey) to show.
	onMount(() => {
		void loadAuthConfig();
	});
</script>

<Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
	{@render children()}
	<SessionExpiredDialog />
</Tooltip.Provider>
