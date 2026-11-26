<script lang="ts" generics="TRow extends Record<string, unknown>">
  /**
   * BuiltinEntityListPage — the `entity_list` archetype mount for
   * service-published builtin entities (the `sequence` registry today).
   *
   * EntityTablePage with derived props + builtin-entity custom-op
   * surfaces: `sequence_set` is a PARAMETRIC op (`next` is operator
   * input, not a row field) — the generic endpoint dispatch cannot
   * produce it, so the CTA rides `customActionHandlers` → the authored
   * SequenceSetDialog via `extraDialogs`, keeping `runEntityOp`'s
   * confirm/MFA gates intact.
   *
   * Builtin entities mount on EVERY service — `decl.module` carries the
   * owning module (crm-settings → crm), same contract as EntityDictPage;
   * the storage namespace is service-scoped so two services' registries
   * never share column config.
   */
  import { untrack } from 'svelte';
  import EntityTablePage from './EntityTablePage.svelte';
  import SequenceSetDialog from '../entity-list-table/dialogs/SequenceSetDialog.svelte';
  import { entityApiBase, type CensusRoute } from '$lib/api';

  let { decl }: { decl: CensusRoute } = $props();

  // Immutable per mount — the {#key pathname} remounts on navigation
  // (same contract as EntityDictPage's untrack).
  const entity = untrack(() => decl.entity ?? '');
  const service = untrack(() => decl.module?.split('-')[0]);

  let seqSetOpen = $state(false);
  let seqSetRow = $state<TRow | null>(null);

  const customActionHandlers = $derived(
    entity === 'sequence'
      ? {
          sequence_set: (r: TRow) => {
            seqSetRow = r;
            seqSetOpen = true;
          },
        }
      : undefined,
  );
</script>

<EntityTablePage
  basePath={entityApiBase(entity, service)}
  {service}
  storageKeyPrefix={`pb:${service}-${entity}:list:`}
  syncChannel={`primebrick_${entity}_sync`}
  errorScopeKey="app.common.errors.scope.entity_list"
  errorScopeKeyInit="app.common.errors.scope.entity_page_init"
  customActionHandlers={customActionHandlers as Record<string, (row: TRow) => void> | undefined}
>
  {#snippet extraDialogs(uid: string)}
    {#if entity === 'sequence'}
      <SequenceSetDialog
        bind:open={seqSetOpen}
        row={seqSetRow as Record<string, unknown> | null}
        {uid}
        {entity}
        {service}
      />
    {/if}
  {/snippet}
</EntityTablePage>
