<script lang="ts">
	/**
	 * EntityFormField stub for sheet-body tests — renders the column key
	 * under the canonical `record-sheet-field-*` id so the test can read
	 * the field surface's DOM order without mounting real widgets.
	 */
	let {
		column,
		controlProps,
	}: {
		column: { key: string };
		controlProps: { id: string };
	} = $props();
</script>

<div id={controlProps.id}>{column.key}</div>
