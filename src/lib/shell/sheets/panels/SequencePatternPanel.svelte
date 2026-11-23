<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import {
    Badge,
    NumericInput,
    PrimeField,
    SheetPanelFooter,
    SheetPanelLayout,
  } from '@primebrick/ui';
  import SheetSectionTitle from '$lib/shell/sheets/SheetSectionTitle.svelte';
  import { CircleAlert, Minus, Plus, Tags } from '@primebrick/ui/vendor/lucide';
  import {
    sequenceTokenCatalog,
    usedSequenceTokens,
    removeSequenceToken,
    sequenceTokenExampleDefaults,
    parseSequencePattern,
    renderSequenceValue,
    type SequenceTokenSpec,
  } from '@primebrick/ui';

  interface Props {
    /** Pattern snapshot — the panel's initial mirror value. */
    get_value: () => string;
    /**
     * Live value feed — subscribes a callback to the input's real `input`
     * events (survives sheet-stack remounts, which is exactly how typing
     * propagates). Returns the unsubscribe. Optional for non-DOM hosts.
     */
    on_change?: (cb: (value: string) => void) => () => void;
    /** Splice `insert` at the input's saved caret/selection. */
    insert: (token: string) => void;
    /** Replace the WHOLE pattern — the used-token `-` CTA writes the
     *  token-stripped source through the same live channel. */
    on_write?: (next: string) => void;
    /** Form record — `step`/`start`/`tz` example context when carried. */
    context?: Record<string, unknown>;
  }

  let { get_value, on_change, insert, on_write, context }: Props = $props();

  // Live pattern mirror — `get_value()` reads a DOM input (non-reactive),
  // so the panel keeps its own $state fed by the `on_change` feed; every
  // insert fires `input` on the element and flows through the same path.
  // `untrack` — the initial read IS a snapshot by contract, not a bind.
  let pattern = $state(untrack(() => get_value()));

  $effect(() => {
    if (!on_change) return;
    return on_change((v) => {
      pattern = v;
    });
  });

  const tokens = sequenceTokenCatalog();

  // Example context — illustrative only: the counter rides the form's
  // `start` sibling when authored (the first emitted value) else the
  // catalog default; sez partitions use the shared catalog defaults
  // (claim-time context, never persisted on the sequence row).
  // Example tz — the record's `tz` sibling when authored, else the
  // BROWSER-local zone: examples must read like the user's clock, not UTC.
  const ctxTz = $derived(
    typeof context?.tz === 'string' && context.tz !== ''
      ? context.tz
      : Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  /** Parsed pattern — `Error` while the source is mid-typing invalid. */
  let parsed = $derived.by(() => {
    try {
      return parseSequencePattern(pattern);
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  });

  let used = $derived(usedSequenceTokens(pattern));

  let counter = $derived.by(() => {
    const s = context?.start;
    if (typeof s === 'bigint' || typeof s === 'number' || typeof s === 'string') {
      try {
        return BigInt(s);
      } catch {
        /* fall through to default */
      }
    }
    return sequenceTokenExampleDefaults.counter;
  });

  let previewPartitions = $derived.by(() => {
    const p: Record<string, string> = {};
    if (parsed && !(parsed instanceof Error)) {
      for (const s of parsed.sez_slots) {
        p[s] = sequenceTokenExampleDefaults.partitions[s];
      }
    }
    return p;
  });

  let preview = $derived.by(() => {
    if (!parsed || parsed instanceof Error) return null;
    try {
      return renderSequenceValue(parsed, counter, new Date(), {
        tz: ctxTz,
        partitions: previewPartitions,
      });
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  });

  // Counter padding — `0` means no padding (`{seq}`, the default); a
  // positive N inserts `{seq:N}` (grammar caps W at 19 = bigint digits).
  // While the counter slot is consumed the field mirrors the pattern's
  // own `counter_width`, disabled — the `-` CTA is the way to change it.
  let seqWidth = $state('0');

  const seqUsedWidth = $derived(
    parsed && !(parsed instanceof Error) && used.has('seq') ? parsed.counter_width : null,
  );

  /** Effective width — the pattern's own while consumed, the authored
   *  padding value otherwise. Drives the composed tag (`{seq:N}`), the
   *  live example and the insert text — always in sync. */
  const seqW = $derived(
    seqUsedWidth ?? Math.max(0, Math.min(19, Number(seqWidth) || 0)),
  );

  /** Composed counter token — the row's tag reads `{seq}` or `{seq:N}` so
   *  the authored padding is visible BEFORE inserting. */
  const seqInsert = $derived(seqW > 0 ? `{seq:${seqW}}` : '{seq}');

  /** Live counter example — rendered through the shared engine with the
   *  effective width (`0042` for W=4), updates as padding is typed. */
  const seqExample = $derived.by(() => {
    try {
      return renderSequenceValue(parseSequencePattern(seqInsert), counter, new Date(), {
        tz: ctxTz,
        partitions: {},
      });
    } catch {
      return String(counter);
    }
  });

  function pick(spec: SequenceTokenSpec) {
    insert(spec.kind === 'counter' ? seqInsert : spec.insert);
  }

  function unpick(spec: SequenceTokenSpec) {
    if (!spec.slot || !on_write) return;
    on_write(removeSequenceToken(pattern, spec.slot));
  }
</script>

{#snippet tokenRow(spec: SequenceTokenSpec)}
  {@const isUsed = spec.slot !== undefined && used.has(spec.slot)}
  {@const isCounter = spec.kind === 'counter'}
  <div
    class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm {isUsed ? 'opacity-50' : ''}"
    data-testid={`sequence-pattern-token-${spec.id}`}
    data-used={isUsed}
  >
    <span class="min-w-0 flex-1">
      <span class="block font-mono font-medium" data-testid={`sequence-pattern-token-${spec.id}-tag`}>{isCounter ? seqInsert : spec.insert}</span>
      <span class="block text-xs text-muted-foreground">
        {$t(`app.widgets.sequence_pattern.tokens.${spec.key}`)}
      </span>
    </span>
    <code
      class="shrink-0 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none"
      data-testid={`sequence-pattern-token-${spec.id}-example`}
      >{isCounter ? seqExample : spec.example({ counter, tz: ctxTz })}</code
    >
    {#if isUsed}
      <span
        class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
        title={$t('app.widgets.sequence_pattern.used')}
        data-testid={`sequence-pattern-token-${spec.id}-used`}
      >
        <Tags class="size-4" />
      </span>
      <button
        type="button"
        class="flex shrink-0 items-center justify-center rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-destructive transition-colors"
        onclick={() => unpick(spec)}
        disabled={!on_write}
        aria-label={$t('app.widgets.sequence_pattern.remove')}
        title={$t('app.widgets.sequence_pattern.remove')}
        data-testid={`sequence-pattern-token-${spec.id}-remove`}
      >
        <Minus class="size-4" />
      </button>
    {:else}
      <button
        type="button"
        class="flex shrink-0 items-center justify-center rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        onclick={() => pick(spec)}
        aria-label={$t('app.widgets.sequence_pattern.insert')}
        title={$t('app.widgets.sequence_pattern.insert')}
        data-testid={`sequence-pattern-token-${spec.id}-insert`}
      >
        <Plus class="size-4" />
      </button>
    {/if}
  </div>
{/snippet}

{#snippet counterRow(spec: SequenceTokenSpec)}
  <div>
    {@render tokenRow(spec)}
    <!-- Padding field — canonical PrimeField + NumericInput anatomy
         (label above, full-width control): 0 = no padding (default),
         N → `{seq:N}` on insert. The tag and example update live. -->
    <div class="px-3 pb-2 pl-8" data-testid="sequence-pattern-seq-padding">
      <PrimeField
        id="sequence-pattern-seq-width"
        label={$t('app.widgets.sequence_pattern.tokens.seq_width')}
        data-testid="sequence-pattern-seq-padding-field"
      >
        {#snippet control({ id })}
          <NumericInput
            {id}
            kind="bigint"
            bind:value={seqWidth}
            min={0}
            max={19}
            unsigned
            disabled={seqUsedWidth !== null}
            data-testid="sequence-pattern-seq-width"
          />
        {/snippet}
      </PrimeField>
    </div>
  </div>
{/snippet}

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <Tags class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('app.widgets.sequence_pattern.title')}
  {/snippet}
  {#snippet footer()}
    <!-- Sticky FOOT preview — SheetPanelFooter is the canonical FOOT
         anatomy; the example rides the `start` slot (meta content),
         Badge-chrome, no "Preview" label — the badge IS the preview. -->
    <SheetPanelFooter data-testid="sequence-pattern-preview-foot">
      {#snippet start()}
        {#if parsed instanceof Error}
          <CircleAlert class="size-4 shrink-0 text-destructive" />
          <span class="text-xs text-destructive break-all" data-testid="sequence-pattern-preview-error">
            {parsed.message}
          </span>
        {:else}
          <Badge variant="secondary" data-testid="sequence-pattern-preview">{preview}</Badge>
        {/if}
      {/snippet}
    </SheetPanelFooter>
  {/snippet}

  <div class="px-3 pb-2">
    <SheetSectionTitle>
      {$t('app.widgets.sequence_pattern.tokens_title')}
    </SheetSectionTitle>
    <div>
      {#each tokens as spec (spec.id)}
        {#if spec.kind === 'counter'}
          {@render counterRow(spec)}
        {:else}
          {@render tokenRow(spec)}
        {/if}
      {/each}
    </div>
  </div>
</SheetPanelLayout>
