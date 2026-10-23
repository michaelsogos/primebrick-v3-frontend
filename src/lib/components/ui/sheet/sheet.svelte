<script lang="ts">
	import { Dialog as SheetPrimitive } from '@primebrick/ui/vendor/bits-ui';

	let { open = $bindable(false), ...restProps }: SheetPrimitive.RootProps = $props();
</script>

<SheetPrimitive.Root bind:open {...restProps} />
