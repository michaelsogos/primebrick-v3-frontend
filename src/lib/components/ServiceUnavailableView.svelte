<script lang="ts">
	/**
	 * ServiceUnavailableView — the dedicated page state when the owning
	 * microservice is not online. Names the service explicitly, explains it
	 * self-recovers, and still offers a manual retry (the user may know the
	 * service is back before the next heartbeat lands).
	 */
	import { Button, DynamicIcon } from '@primebrick/ui';
	import { t } from '$lib/i18n';

	interface Props {
		service: string;
		status?: string | null;
		onRetry?: () => void;
	}
	let { service, status = null, onRetry }: Props = $props();
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
	{#if status}
		<span class="text-xs uppercase tracking-wide text-muted-foreground">{status}</span>
	{/if}
	{#if onRetry}
		<Button variant="outline" size="sm" onclick={onRetry}>
			{$t('app.common.refresh')}
		</Button>
	{/if}
</div>
