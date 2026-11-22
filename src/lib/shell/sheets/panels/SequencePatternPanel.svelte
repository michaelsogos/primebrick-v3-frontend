<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '$lib/i18n';
  import { SheetPanelLayout } from '@primebrick/ui';
  import SheetSectionTitle from '$lib/shell/sheets/SheetSectionTitle.svelte';
  import { Braces, Check, Plus, Tag } from '@primebrick/ui/vendor/lucide';
  import {
    sequenceTokenCatalog,
    usedSequenceTokens,
    parseSequencePattern,
    renderSequenceValue,
    type SequenceTokenSpec,
    type SequenceSezToken,
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
    /** Form record — `step`/`start`/`tz` example context when carried. */
    context?: Record<string, unknown>;
  }

  let { get_value, on_change, insert, context }: Props = $props();

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

  // Example context — illustrative preview values. Counter defaults to the
  // form's `start` when authored (the first emitted value) else the
  // catalog default; `at` is now; sez samples follow the catalog defaults
  // and become editable when the pattern uses sez slots.
  let exampleCounter = $state('42');
  let exampleSez = $state<Record<SequenceSezToken, string>>({
    sez: 'A',
    sez2: '01',
    sez3: 'X',
  });

  $effect(() => {
    const start = context?.start;
    if (typeof start === 'bigint' || typeof start === 'number' || typeof start === 'string') {
      exampleCounter = String(start);
    }
  });

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
    try {
      return BigInt(exampleCounter.trim() || '0');
    } catch {
      return 42n;
    }
  });

  let previewPartitions = $derived.by(() => {
    const p: Record<string, string> = {};
    if (parsed && !(parsed instanceof Error)) {
      for (const s of parsed.sez_slots) {
        if (exampleSez[s] !== '') p[s] = exampleSez[s];
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

  function pick(spec: SequenceTokenSpec) {
    insert(spec.insert);
  }
</script>

{#snippet tokenRow(spec: SequenceTokenSpec)}
  {@const isUsed = spec.slot !== undefined && used.has(spec.slot)}
  <div
    class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm {isUsed ? 'opacity-50' : ''}"
    data-testid={`sequence-pattern-token-${spec.id}`}
    data-used={isUsed}
  >
    <Tag class="size-4 shrink-0 text-muted-foreground" />
    <span class="min-w-0 flex-1">
      <span class="block font-mono font-medium">{spec.insert}</span>
      <span class="block truncate text-xs text-muted-foreground">
        {$t(`app.widgets.sequence_pattern.tokens.${spec.id.toLowerCase()}`)}
      </span>
    </span>
    <code
      class="shrink-0 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none"
      data-testid={`sequence-pattern-token-${spec.id}-example`}
      >{spec.example({ counter, partitions: exampleSez, tz: ctxTz })}</code
    >
    {#if isUsed}
      <span
        class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
        title={$t('app.widgets.sequence_pattern.used')}
        data-testid={`sequence-pattern-token-${spec.id}-used`}
      >
        <Check class="size-3.5" />
      </span>
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
    <div class="rounded-md border border-border">
      {#each tokens as spec (spec.id)}
        {@render tokenRow(spec)}
      {/each}
    </div>
  </div>

  <div class="px-3 pb-3">
    <SheetSectionTitle>
      {$t('app.widgets.sequence_pattern.preview')}
    </SheetSectionTitle>
    <div class="flex flex-col gap-2 rounded-md border border-border p-3">
      <div class="flex items-center gap-2">
        <label
          class="text-xs text-muted-foreground shrink-0"
          for="sequence-pattern-example-counter"
          >{$t('app.widgets.sequence_pattern.example_counter')}</label
        >
        <input
          id="sequence-pattern-example-counter"
          inputmode="numeric"
          class="w-24 rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs"
          bind:value={exampleCounter}
          data-testid="sequence-pattern-example-counter"
        />
        {#if parsed && !(parsed instanceof Error) && parsed.sez_slots.length > 0}
          {#each parsed.sez_slots as slot (slot)}
            <label class="text-xs font-mono text-muted-foreground shrink-0" for="sequence-pattern-sez-{slot}"
              >{`{${slot}}`}</label
            >
            <input
              id="sequence-pattern-sez-{slot}"
              class="w-16 rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs"
              bind:value={exampleSez[slot]}
              data-testid="sequence-pattern-sez-{slot}"
            />
          {/each}
        {/if}
      </div>
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
  </div>
</SheetPanelLayout>
