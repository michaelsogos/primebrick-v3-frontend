<script lang="ts">
  /** Prop-echo fixture — renders the prop so tests can observe update() pushes. */
  let { value = '' }: { value?: string } = $props();
</script>

<p data-testid="echo-value">{value}</p>
