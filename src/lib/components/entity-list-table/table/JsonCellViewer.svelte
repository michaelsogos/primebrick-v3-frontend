<script lang="ts">
	/**
	 * Generic `format:"json"` cell — braces CTA + "View" label opens the
	 * registered `entity.jsonViewer` sheet panel (the single SheetHost).
	 * Specific renderers (filter chips, …) take precedence upstream.
	 */
	import { t } from '$lib/i18n';
	import { DynamicIcon } from '@primebrick/ui';
	import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';

	let { value }: { value: unknown } = $props();
</script>

<button
	type="button"
	onclick={(e) => { e.stopPropagation(); openSheet('entity.jsonViewer', { value }); }}
	class="inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-xs text-foreground underline-offset-2 hover:bg-accent hover:underline"
>
	<DynamicIcon name="braces" size={12} class="shrink-0" />
	<span>{$t('app.common.view')}</span>
</button>
