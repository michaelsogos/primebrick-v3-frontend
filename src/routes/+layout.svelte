<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SessionExpiredDialog from '$lib/components/auth/SessionExpiredDialog.svelte';
	import { loadAuthConfig } from '$lib/auth-config-store.svelte';
	import { registerRegexAiSw } from '$lib/ai/sw-manager';

	let { children }: { children: Snippet } = $props();

	// Load public auth config once at app startup so the LoginForm and
	// SessionExpiredDialog know which login methods (form / passkey) to show.
	// Also register the SmartRegexInput AI service worker for background model
	// pre-download (non-blocking, fails silently if SW is unavailable).
	onMount(() => {
		void loadAuthConfig();
		void registerRegexAiSw();
	});
</script>

<Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
	{@render children()}
	<SessionExpiredDialog />
</Tooltip.Provider>
