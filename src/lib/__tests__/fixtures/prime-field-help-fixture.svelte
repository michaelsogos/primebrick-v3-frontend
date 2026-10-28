<script lang="ts">
  import { Tooltip } from '@primebrick/ui';
  import { PrimeField, type PrimeFieldHelp } from '@primebrick/ui';
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
