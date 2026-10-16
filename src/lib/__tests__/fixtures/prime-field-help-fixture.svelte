<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { PrimeField, type PrimeFieldHelp } from '$lib/components/ui/form';
  import type { Snippet } from 'svelte';

  let {
    help,
    control,
  }: {
    help: PrimeFieldHelp;
    control: Snippet<[{ id: string }]>;
  } = $props();
</script>

<Tooltip.Provider>
  <PrimeField id="help-fixture" label="With help" {help}>
    {#snippet control({ id })}
      {@render control({ id })}
    {/snippet}
  </PrimeField>
</Tooltip.Provider>
