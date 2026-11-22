<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { SheetPanelLayout } from '@primebrick/ui';
  import SheetSectionTitle from '$lib/shell/sheets/SheetSectionTitle.svelte';
  import { Braces, Minus, Plus, Tags } from '@primebrick/ui/vendor/lucide';
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
  const ctxTz = $derived(typeof context?.tz === 'string' && context.tz !== '' ? context.tz : undefined);

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
  // While the counter slot is consumed the form mirrors the pattern's
  // own `counter_width`, disabled — the `-` CTA is the way to change it.
  let seqWidth = $state('0');

  const seqUsedWidth = $derived(
    parsed && !(parsed instanceof Error) && used.has('seq') ? parsed.counter_width : null,
  );

  function pick(spec: SequenceTokenSpec) {
    if (spec.kind === 'counter') {
      const w = Math.max(0, Math.min(19, Number(seqWidth) || 0));
      insert(w > 0 ? `{seq:${w}}` : '{seq}');
    } else {
      insert(spec.insert);
    }
  }

  function unpick(spec: SequenceTokenSpec) {
    if (!spec.slot || !on_write) return;
    on_write(removeSequenceToken(pattern, spec.slot));
  }
</script>

{#snippet tokenRow(spec: SequenceTokenSpec)}
  {@const isUsed = spec.slot !== undefined && used.has(spec.slot)}
  <div
    class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm {isUsed ? 'opacity-50' : ''}"
    data-testid={`sequence-pattern-token-${spec.id}`}
    data-used={isUsed}
  >
    <span class="min-w-0 flex-1">
      <span class="block font-mono font-medium">{spec.insert}</span>
      <span class="block text-xs text-muted-foreground">
        {$t(`app.widgets.sequence_pattern.tokens.${spec.key}`)}
      </span>
    </span>
    <code
      class="shrink-0 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none"
      data-testid={`sequence-pattern-token-${spec.id}-example`}
      >{spec.example({ counter, tz: ctxTz })}</code
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
    <!-- Padding form — authored alongside `{seq}` (the only width-bearing
         token): 0 = no padding (default), N = `{seq:N}` on insert. -->
    <div class="flex items-center gap-2 px-3 pb-2 pl-8" data-testid="sequence-pattern-seq-padding">
      <label class="text-xs text-muted-foreground" for="sequence-pattern-seq-width">
        {$t('app.widgets.sequence_pattern.tokens.seq_width')}
      </label>
      <input
        id="sequence-pattern-seq-width"
        inputmode="numeric"
        class="w-14 rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs disabled:opacity-50"
        value={seqUsedWidth !== null ? String(seqUsedWidth) : seqWidth}
        disabled={seqUsedWidth !== null}
        oninput={(e) => {
          seqWidth = e.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 2);
        }}
        data-testid="sequence-pattern-seq-width"
      />
    </div>
  </div>
{/snippet}

<SheetPanelLayout contentClass="p-0">
  {#snippet icon()}
    <Braces class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('app.widgets.sequence_pattern.title')}
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

  <div class="px-3 pb-3">
    <SheetSectionTitle>
      {$t('app.widgets.sequence_pattern.preview')}
    </SheetSectionTitle>
    {#if parsed instanceof Error}
      <p class="font-mono text-xs text-destructive" data-testid="sequence-pattern-preview-error">
        {parsed.message}
      </p>
    {:else}
      <p
        class="rounded-sm bg-muted px-2 py-1.5 font-mono text-sm break-all"
        data-testid="sequence-pattern-preview"
      >{preview}</p>
    {/if}
  </div>
</SheetPanelLayout>
