<script lang="ts">
	import { Dialog as DialogPrimitive } from '@primebrick/ui/vendor/bits-ui';

	let { ...restProps }: DialogPrimitive.PortalProps = $props();
</script>

<DialogPrimitive.Portal {...restProps} />
