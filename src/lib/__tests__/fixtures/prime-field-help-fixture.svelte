<script lang="ts">
  import { Tooltip } from '@primebrick/ui';
  import { PrimeField, type PrimeFieldHelp, type HelpContext } from '@primebrick/ui';
  import type { Snippet } from 'svelte';

  let {
    help,
    help_context = 'form',
    control,
  }: {
    help: PrimeFieldHelp;
    help_context?: HelpContext;
    control: Snippet<[{ id: string }]>;
  } = $props();
</script>

<Tooltip.Provider>
  <PrimeField id="help-fixture" label="With help" {help} {help_context}>
    {#snippet control({ id })}
      {@render control({ id })}
    {/snippet}
  </PrimeField>
</Tooltip.Provider>
