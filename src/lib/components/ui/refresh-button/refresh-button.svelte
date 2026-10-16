<script lang="ts">
	/**
	 * RefreshButton — the ONE canonical refresh/reload CTA.
	 *
	 * Chrome: `Button ghost sm`, `RefreshCw` icon (spins while `loading`),
	 * label hidden below `lg`. `compact` = smaller + muted chrome for
	 * in-card use (top-right corner of section cards). Used by
	 * `Toolbar.refresh`, `EntityListToolbar`, and card wrappers. Never
	 * hand-roll a refresh button — always use this atom.
	 */
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';

	let {
		onclick,
		loading = false,
		disabled = false,
		compact = false,
		label,
		testid,
	}: {
		onclick: () => void;
		loading?: boolean;
		disabled?: boolean;
		/** Smaller, muted chrome — for refresh CTAs inside card wrappers. */
		compact?: boolean;
		/** Accessible label — defaults to the standard refresh i18n key. */
		label?: string;
		testid?: string;
	} = $props();

	const resolvedLabel = $derived(label ?? $t('system.entities.list.refresh'));
</script>

<Button
	variant="ghost"
	size="sm"
	type="button"
	disabled={disabled || loading}
	{onclick}
	aria-label={resolvedLabel}
	title={resolvedLabel}
	data-testid={testid}
	class={compact ? 'h-5 gap-1 px-1 text-[10px] text-muted-foreground' : undefined}
>
	<RefreshCw class={compact ? (loading ? 'size-3 animate-spin' : 'size-3') : (loading ? 'size-4 animate-spin' : 'size-4')} />
	<span class={compact ? 'hidden uppercase tracking-wide lg:inline' : 'hidden lg:inline'}>{resolvedLabel}</span>
</Button>
