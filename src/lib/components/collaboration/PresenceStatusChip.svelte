<script lang="ts">
	/**
	 * PresenceStatusChip — the merge/conflict indicator inside the reserved
	 * `page-header-presence` zone, immediately LEFT of the avatar stack.
	 *
	 * Reads the shared `collab-status-store` (written by the form's
	 * `useCollaborativeForm`): three escalation levels —
	 *   - nothing when the record is aligned (zero noise);
	 *   - soft-amber "Updated by {name}" / "Updated automatically" after a
	 *     silent merge or while stale;
	 *   - stronger warning + count when fields conflict and need a decision.
	 *
	 * Click → compact popover with the conflicted fields and per-field
	 * "keep mine / use new" resolution. The full CollaborationPanel
	 * (readers/editors lists, merge history) remains the F12 concern.
	 */
	import { Popover } from '@primebrick/ui';
	import { RefreshCcw, TriangleAlert } from '@primebrick/ui/vendor/lucide';
	import { Button } from '@primebrick/ui';
	import { getCollabStatus } from '$lib/collaboration/collab-status-store.svelte';
	import { t } from '$lib/i18n';

	interface Props {
		entity: string;
		uuid: string;
	}
	let { entity, uuid }: Props = $props();

	const status = $derived(getCollabStatus(entity, uuid));
	const hasConflicts = $derived((status?.conflictCount ?? 0) > 0);
	const hasMerge = $derived(
		(status?.isStale ?? false) || (status?.recentlyMergedCount ?? 0) > 0,
	);
	const visible = $derived(hasConflicts || hasMerge);
</script>

{#if visible && status}
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					data-testid="presence-status-chip"
					class={hasConflicts
						? 'inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20'
						: 'inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400'}
				>
					{#if hasConflicts}
						<TriangleAlert class="size-3.5" />
						{$t('app.collaboration.conflict_count', { count: status.conflictCount })}
					{:else}
						<RefreshCcw class="size-3.5" />
						{status.mergerName
							? $t('app.collaboration.updated_by', { name: status.mergerName })
							: $t('app.collaboration.updated_automatically')}
					{/if}
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-72 p-3" align="end">
			<div class="space-y-2" data-testid="presence-status-popover">
				{#if hasConflicts}
					<p class="text-xs font-medium">
						{$t('app.collaboration.conflict_title', { count: status.conflictCount })}
					</p>
					<ul class="space-y-1.5">
						{#each status.conflictFields as field (field)}
							<li class="flex items-center justify-between gap-2 rounded-md border border-border p-1.5">
								<span class="truncate text-xs font-mono">{field}</span>
								<span class="flex shrink-0 gap-1">
									<Button
										size="sm"
										variant="outline"
										class="h-6 px-2 text-xs"
										onclick={() => status.resolve?.(field, 'keep_mine')}
									>
										{$t('app.collaboration.keep_mine')}
									</Button>
									<Button
										size="sm"
										variant="outline"
										class="h-6 px-2 text-xs"
										onclick={() => status.resolve?.(field, 'use_remote')}
									>
										{$t('app.collaboration.use_new')}
									</Button>
								</span>
							</li>
						{/each}
					</ul>
					<p class="text-[11px] text-muted-foreground">
						{$t('app.collaboration.conflict_hint')}
					</p>
				{:else}
					<p class="text-xs text-muted-foreground">
						{status.mergerName
							? $t('app.collaboration.updated_by_desc', { name: status.mergerName })
							: $t('app.collaboration.updated_automatically_desc')}
					</p>
				{/if}
			</div>
		</Popover.Content>
	</Popover.Root>
{/if}
