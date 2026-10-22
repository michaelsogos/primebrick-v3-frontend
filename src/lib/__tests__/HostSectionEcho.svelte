<script lang="ts">
  import type { HostSectionProps } from '../components/remote-page/host-sections';
  let { section }: HostSectionProps = $props();
</script>

<div data-testid="host-section-{section.id}">{String(section.props?.value ?? section.id)}</div>
