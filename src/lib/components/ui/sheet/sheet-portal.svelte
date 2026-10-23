<script lang="ts">
	import { Dialog as SheetPrimitive } from '@primebrick/ui/vendor/bits-ui';

	let { ...restProps }: SheetPrimitive.PortalProps = $props();
</script>

<SheetPrimitive.Portal {...restProps} />
