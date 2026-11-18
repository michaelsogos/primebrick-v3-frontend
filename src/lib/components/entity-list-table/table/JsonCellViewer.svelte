<script lang="ts">
	/**
	 * Generic `format:"json"` cell — canonical cell-link anatomy
	 * (`CellAffordance`, same as ref/mapper cells): the "View" text link
	 * opens the registered `entity.jsonViewer` sheet panel (the single
	 * SheetHost). Specific renderers (filter chips, …) take precedence
	 * upstream.
	 */
	import { t } from '$lib/i18n';
	import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
	import CellAffordance from './CellAffordance.svelte';

	let { value }: { value: unknown } = $props();
</script>

<CellAffordance
	text={$t('app.common.view')}
	ontextclick={() => openSheet('entity.jsonViewer', { value })}
>
	{#snippet icon()}{/snippet}
</CellAffordance>
