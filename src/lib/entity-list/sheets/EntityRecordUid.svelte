<script lang="ts">
  /**
   * EntityRecordUid — the identity block shared by the record surface and
   * the hero states: `{entity singular} ID` label + mono uid badge with
   * the inner copy CTA. Rendered whenever the uid is known — a missing
   * or pseudo record still HAS a stored value and an entity type, and the
   * sheet shows both above the hero instead of hiding them behind it.
   */
  import { t } from '$lib/i18n';
  import { Badge, Label, DynamicIcon, colorCssFromToken } from '@primebrick/ui';
  import { Copy, Check } from '@primebrick/ui/vendor/lucide';
  import type { EntityMeta } from '$lib/entity-list/types';

  let {
    meta,
    value,
  }: {
    /** Served entity meta — null when meta itself failed to load; the
     *  label degrades to the raw entity name. */
    meta: EntityMeta | null;
    /** The uid to display — record uid, resolved ref uuid, or the raw
     *  stored value for pseudo-actor refs. */
    value: unknown;
  } = $props();

  /** Translated entity singular — the `<ns>.entities.<tk>.singular`
   *  convention shared with `entityPageTitle`; raw key fallback keeps
   *  the label readable when a dict entry is missing. */
  const entitySingular = $derived.by(() => {
    const ns = meta?.entities_ns ?? 'system';
    const tk = meta?.translation_key ?? meta?.entity ?? '';
    const resolved = $t(`${ns}.entities.${tk}.singular`);
    return resolved && !resolved.includes('.singular') ? resolved : (meta?.entity ?? '');
  });

  let uidCopied = $state(false);
  async function copyUid() {
    if (value === undefined || value === null) return;
    try {
      await navigator.clipboard.writeText(String(value));
      uidCopied = true;
      setTimeout(() => (uidCopied = false), 1500);
    } catch {
      /* clipboard denied — silent, the badge still shows the value */
    }
  }
</script>

<div class="space-y-2">
  <Label for="record-sheet-uid-badge">{entitySingular} ID</Label>
  <Badge
    id="record-sheet-uid-badge"
    variant="secondary"
    class="h-9 w-full max-w-full justify-start gap-2 truncate px-3 font-mono shadow-none [&>svg]:size-4"
    title={String(value)}
    data-testid="entity-record-sheet-uid-badge"
  >
    <DynamicIcon name="file-key" size={16} class="shrink-0" style="color:{colorCssFromToken('amber-500')}" />
    <span class="truncate">{value}</span>
    <button
      type="button"
      class="ml-auto inline-flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground"
      title={$t('app.common.copy')}
      aria-label={$t('app.common.copy')}
      onclick={copyUid}
      data-testid="entity-record-sheet-uid-copy"
    >
      {#if uidCopied}
        <Check class="size-4" />
      {:else}
        <Copy class="size-4" />
      {/if}
    </button>
  </Badge>
</div>
