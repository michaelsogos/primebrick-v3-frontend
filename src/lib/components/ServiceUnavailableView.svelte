<script lang="ts">
	/**
	 * ServiceUnavailableView — the dedicated page state when the owning
	 * microservice is not online. Names the service explicitly, explains it
	 * self-recovers, and still offers a manual retry (the user may know the
	 * service is back before the next heartbeat lands).
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { DynamicIcon } from '@primebrick/ui';
	import { House, RefreshCw } from '@primebrick/ui/vendor/lucide';
	import { t } from '$lib/i18n';
	import { resolveSafePage } from '$lib/navigation/safe-page';

	interface Props {
		service: string;
		onRetry?: () => void;
	}
	let { service, onRetry }: Props = $props();

	let homeHref = $state<string | null>(null);

	onMount(async () => {
		homeHref = await resolveSafePage(page.url.pathname);
	});
</script>

<div
	class="flex flex-col items-center justify-center gap-3 p-12 text-center"
	data-testid="service-unavailable"
>
	<DynamicIcon name="server-off" size={32} class="text-muted-foreground" />
	<h2 class="text-lg font-semibold">
		{$t('app.service.unavailable', { service })}
	</h2>
	<p class="max-w-md text-sm text-muted-foreground">
		{$t('app.service.unavailable_detail')}
	</p>
	<nav class="mt-6 flex items-center gap-20 font-mono text-xs font-normal">
		{#if onRetry}
			<button
				type="button"
				data-testid="service-unavailable-retry"
				onclick={onRetry}
				class="inline-flex cursor-pointer items-center gap-1.5 hover:underline"
			>
				<RefreshCw class="h-3.5 w-3.5" />
				{$t('app.common.refresh')}
			</button>
		{/if}
		{#if homeHref}
			<a
				data-testid="service-unavailable-home"
				href={resolve(homeHref as '/')}
				class="inline-flex items-center gap-1.5 decoration-primary hover:underline"
			>
				<House class="h-3.5 w-3.5 text-primary" />
				<span class="text-primary-gradient">{$t('app.error.return_home')}</span>
			</a>
		{:else}
			<span
				data-testid="service-unavailable-home"
				class="inline-flex items-center gap-1.5 text-foreground/40"
				aria-disabled="true"
			>
				<House class="h-3.5 w-3.5" />
				{$t('app.error.return_home')}
			</span>
		{/if}
	</nav>
</div>
