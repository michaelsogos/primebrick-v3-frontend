<script lang="ts">
	import { Dialog as SheetPrimitive } from '@primebrick/ui/vendor/bits-ui';

	let { ref = $bindable(null), ...restProps }: SheetPrimitive.TriggerProps = $props();
</script>

<SheetPrimitive.Trigger bind:ref data-slot="sheet-trigger" {...restProps} />
