<script lang="ts">
  /**
   * AiModelImportPanel — "Add model" right sheet.
   *
   * ComboSelect driven by a remote Hugging Face search (ONNX generative
   * text models ≤5B — see `$lib/ai/hf-model-search.ts`). Selecting a hit
   * and confirming creates the `ai_model` catalog row via the generic
   * entity write endpoint (`{ entity }` envelope); BE defaults fill the
   * rest (power_level, sampling params, compatibility COMPATIBLE).
   */
  import { t } from '$lib/i18n';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import ComboSelect from '$lib/components/ui/combo-select/combo-select.svelte';
  import ModelIcon from '$lib/components/ui/smart-regex-input/ModelIcon.svelte';
  import RankMeter from '$lib/components/ui/smart-regex-input/RankMeter.svelte';
  import ScoreGauge from '$lib/components/ui/smart-regex-input/ScoreGauge.svelte';
  import { SliderField } from '$lib/components/ui/slider-field';  import { SwitchField } from '$lib/components/ui/switch-field';
  import { SelectableFieldset } from '$lib/components/ui/selectable-fieldset';
  import { Button } from '$lib/components/ui/button';
  import Download from '@lucide/svelte/icons/download';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import MemoryStick from '@lucide/svelte/icons/memory-stick';
  import HuggingFaceIcon from '$lib/components/ui/smart-regex-input/HuggingFaceIcon.svelte';
  import { formatMB } from '$lib/utils/format-bytes';
  import {
    searchHfModels,
    fetchHfDtypeVariants,
    fetchHfGenerationConfig,
    powerLevelFromWorkingSet,
    KV_CTX_FACTOR,
    HF_DTYPES,
    type HfModelHit,
    type HfSort,
    type HfDtypeVariant,
  } from '$lib/ai/hf-model-search';
  import { apiFetch } from '$lib/api';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { pushNotification } from '$lib/errors/app-errors';

  let {
    existing_model_ids = [],
    on_added,
  }: {
    existing_model_ids?: readonly string[];
    on_added?: () => void;
  } = $props();

  let existingIds = $derived(new Set(existing_model_ids));

  let options = $state<HfModelHit[]>([]);
  let searching = $state(false);
  let searchError = $state<string | null>(null);
  let selected = $state('');
  let adding = $state(false);

  // Real dtype variants of the selected repo (fetched on selection).
  let variants = $state<HfDtypeVariant[]>([]);
  let variantsLoading = $state(false);
  let selectedDtype = $state('');
  let variantController: AbortController | null = null;

  // Measured values per repo (single-variant repos only) — survives
  // dropdown refetches so a reopened list doesn't revert measured →
  // estimate (which reads as the RankMeter animating back down).
  const measured = new Map<string, { download_mb: number; ws_mb: number; power: number }>();

  // Real variant lists per repo — drives the quantization filter chips.
  const repoVariants = new SvelteMap<string, HfDtypeVariant[]>();
  // Enabled quantization filters (all on by default). A repo stays visible
  // while at least one of its variants is enabled; repos not yet enriched
  // are treated as unknown → shown until measured.
  const enabledDtypes = new SvelteSet<string>(HF_DTYPES);

  function toggleDtype(dtype: string) {
    if (enabledDtypes.has(dtype)) enabledDtypes.delete(dtype);
    else enabledDtypes.add(dtype);
  }

  // Server-side sort — HF has no power/size field, so rank filtering is
  // not possible. Available orders: downloads / trendingScore / id (A-Z).
  let sort = $state<HfSort>('downloads');

  function setSort(s: HfSort) {
    if (s === sort) return;
    sort = s;
    void runSearch(lastQuery);
  }

  const SORTS: HfSort[] = ['downloads', 'trending', 'name'];

  let visibleOptions = $derived(
    options.filter((h) => {
      const v = repoVariants.get(h.id);
      return !v || v.some((x) => enabledDtypes.has(x.dtype));
    }),
  );

  // dtype combobox restricted to enabled quantizations.
  let visibleVariants = $derived(variants.filter((v) => enabledDtypes.has(v.dtype)));

  // If the selected dtype got filtered out, fall back to the best enabled one.
  $effect(() => {
    const vv = visibleVariants;
    if (vv.length && !vv.some((v) => v.dtype === selectedDtype)) {
      selectedDtype = vv.find((v) => v.dtype === 'q4f16')?.dtype ?? vv[0].dtype;
    }
  });

  function withMeasured(hits: HfModelHit[]): HfModelHit[] {
    return hits.map((h) => {
      const m = measured.get(h.id);
      return m
        ? { ...h, est_download_mb: m.download_mb, est_working_set_mb: m.ws_mb, est_power_level: m.power }
        : h;
    });
  }

  // Background enrichment: estimates in the list assume a q4-class dtype,
  // which is wildly wrong for fp32-only repos (bloom-1b1: ~676 MB est vs
  // 16.6 GB real). Fetch each repo's real variants (preferred dtype =
  // q4f16 else smallest) and upgrade the row in place — concurrency 3.
  const enrichQueued = new Set<string>();
  let enrichRunning = 0;

  function enqueueEnrich(hits: HfModelHit[]) {
    for (const h of hits) {
      if (!measured.has(h.id) && !enrichQueued.has(h.id)) {
        enrichQueued.add(h.id);
      }
    }
    drainEnrich();
  }

  function drainEnrich() {
    while (enrichRunning < 3 && enrichQueued.size) {
      const id = enrichQueued.values().next().value!;
      enrichQueued.delete(id);
      enrichRunning++;
      fetchHfDtypeVariants(id)
        .then((v) => {
          repoVariants.set(id, v);
          const best = v.find((x) => x.dtype === 'q4f16') ?? v[0];
          if (best) {
            const ws = Math.round(best.download_mb * KV_CTX_FACTOR);
            measured.set(id, {
              download_mb: best.download_mb,
              ws_mb: ws,
              power: powerLevelFromWorkingSet(ws),
            });
            options = withMeasured(options);
          }
        })
        .catch(() => {})
        .finally(() => {
          enrichRunning--;
          drainEnrich();
        });
    }
  }

  // On selection: fetch the repo tree to discover real dtype variants.
  $effect(() => {
    const id = selected;
    variants = [];
    selectedDtype = '';
    if (!id) return;
    variantController?.abort();
    variantController = new AbortController();
    variantsLoading = true;
    fetchHfDtypeVariants(id, { signal: variantController.signal })
      .then((v) => {
        variants = v;
        repoVariants.set(id, v);
        // Prefer q4f16 (catalog default) else smallest download.
        selectedDtype = v.find((x) => x.dtype === 'q4f16')?.dtype ?? v[0]?.dtype ?? '';
        // Cache the real preferred-dtype size so the dropdown row shows
        // measured values even before the background enricher reaches it.
        const best = v.find((x) => x.dtype === 'q4f16') ?? v[0];
        if (best) {
          const ws = Math.round(best.download_mb * KV_CTX_FACTOR);
          measured.set(id, {
            download_mb: best.download_mb,
            ws_mb: ws,
            power: powerLevelFromWorkingSet(ws),
          });
          options = withMeasured(options);
        }
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') variants = [];
      })
      .finally(() => (variantsLoading = false));

    // Best-effort: repo generation_config.json seeds top_p/repetition_penalty.
    hfTopP = null;
    hfRepPenalty = null;
    fetchHfGenerationConfig(id, { signal: variantController.signal })
      .then((cfg) => {
        if (typeof cfg?.top_p === 'number') hfTopP = cfg.top_p;
        if (typeof cfg?.repetition_penalty === 'number') hfRepPenalty = cfg.repetition_penalty;
      })
      .catch(() => {});
  });

  let selectedVariant = $derived(variants.find((v) => v.dtype === selectedDtype) ?? null);

  // Default sampling params — identical fields to the cerebellum form, but
  // these are the MODEL's own defaults. temperature is always 0 for our
  // assistants; top_p / repetition_penalty seed from the repo's
  // generation_config.json when present.
  let temperature = $state<number | null>(0);
  let top_p = $state<number | null>(null);
  let max_tokens = $state<number | null>(null);
  let repetition_penalty = $state<number | null>(null);
  let enable_thinking = $state(false);
  let kv_cache_reuse = $state(false);
  let sliding_window = $state(true);
  let intent_detection = $state(false);
  let max_history_turns = $state<number | null>(null);

  let hfTopP = $state<number | null>(null);
  let hfRepPenalty = $state<number | null>(null);

  // Power level from the REAL selected-dtype download (+ KV/context headroom).
  let powerLevel = $derived(
    selectedVariant
      ? powerLevelFromWorkingSet(Math.round(selectedVariant.download_mb * KV_CTX_FACTOR))
      : (options.find((o) => o.id === selected)?.est_power_level ?? null),
  );

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  // Infinite scroll — HF Link-header cursor pagination (ComboSelect
  // `onLoadMore`/`loadingMore` standard props).
  let nextUrl = $state<string | null>(null);
  let lastQuery = $state('');
  let loadingMore = $state(false);

  function onSearchInput(q: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void runSearch(q), 300);
  }

  async function runSearch(q: string) {
    controller?.abort();
    controller = new AbortController();
    searching = true;
    searchError = null;
    try {
      const page = await searchHfModels(q, { signal: controller.signal, sort });
      options = withMeasured(page.hits).filter((h) => !existingIds.has(h.id));
      nextUrl = page.nextUrl;
      lastQuery = q;
      enqueueEnrich(options);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        searchError = err instanceof Error ? err.message : 'HF search failed';
      }
    } finally {
      searching = false;
    }
  }

  async function loadMore() {
    if (!nextUrl || loadingMore || searching) return;
    loadingMore = true;
    try {
      const page = await searchHfModels(lastQuery, { nextUrl });
      const seen = new Set(options.map((o) => o.id));
      const fresh = withMeasured(page.hits).filter(
        (h) => !seen.has(h.id) && !existingIds.has(h.id),
      );
      // Append only — never re-sort the merged list: re-sorting shuffles
      // already-visible rows while the user is scrolling.
      options = [...options, ...fresh];
      nextUrl = page.nextUrl;
      enqueueEnrich(fresh);
    } catch {
      // keep current options; a re-scroll will retry
    } finally {
      loadingMore = false;
    }
  }

  async function addModel() {
    const hit = options.find((o) => o.id === selected);
    if (!hit || adding) return;
    adding = true;
    try {
      const res = await apiFetch('/ws/ai/api/v1/entities/ai_model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: {
            model_id: hit.id,
            name: hit.name,
            engine_type: 'onnx',
            is_compatible: true,
            enable_thinking,
            temperature: temperature ?? 0,
            top_p: top_p ?? hfTopP ?? 0.9,
            max_tokens: max_tokens ?? 256,
            repetition_penalty: repetition_penalty ?? hfRepPenalty ?? 1.1,
            execution_config: {
              kv_cache_reuse,
              sliding_window,
              intent_detection,
              ...(max_history_turns != null ? { max_history_turns } : {}),
            },
            ...(selectedDtype ? { dtype: selectedDtype } : {}),
            ...(selectedVariant
              ? {
                  download_size_mb: selectedVariant.download_mb,
                  vram_mb: selectedVariant.download_mb,
                }
              : {}),
          },
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      pushNotification({
        impact: 'NONE',
        message: `${hit.name} — ${$t('system.entities.ai_model.added')}`,
        scope: 'AI Model',
        toast: true,
      });
      on_added?.();
      closeSheet();
    } catch (err) {
      pushNotification({
        impact: 'MEDIUM',
        messageKey: 'system.entities.ai_model.add_failed',
        scope: 'AI Model',
        detail: err instanceof Error ? err.message : 'Add model failed',
        toast: true,
      });
    } finally {
      adding = false;
    }
  }
</script>

<SheetPanelLayout contentClass="px-4 py-3">
  {#snippet icon()}
    <Download class="size-4" />
  {/snippet}
  {#snippet title()}
    <span>{$t('system.entities.ai_model.add_model')}</span>
  {/snippet}

  <div class="space-y-3">
    <p class="text-xs text-muted-foreground">
      {$t('system.entities.ai_model.add_model_hint')}
    </p>
    <!-- Sort order (server-side) -->
    <div class="flex flex-wrap items-center gap-1" data-testid="ai-model-import-sort">
      {#each SORTS as s (s)}
        <button
          type="button"
          aria-pressed={sort === s}
          onclick={() => setSort(s)}
          class={[
            'rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors',
            sort === s
              ? 'border-foreground/25 bg-foreground/5 text-foreground'
              : 'border-transparent text-muted-foreground/50 hover:text-muted-foreground',
          ]}
        >
          {$t(`system.entities.ai_model.sort_${s}`)}
        </button>
      {/each}
    </div>
    <!-- Quantization filter chips -->
    <div class="flex flex-wrap items-center gap-1" data-testid="ai-model-import-dtype-filters">
      {#each HF_DTYPES as dtype (dtype)}
        <button
          type="button"
          aria-pressed={enabledDtypes.has(dtype)}
          onclick={() => toggleDtype(dtype)}
          class={[
            'rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors',
            enabledDtypes.has(dtype)
              ? 'border-foreground/25 bg-foreground/5 text-foreground'
              : 'border-transparent text-muted-foreground/50 hover:text-muted-foreground',
          ]}
        >
          {dtype}
        </button>
      {/each}
    </div>
    <ComboSelect
      mode="single"
      bind:value={selected}
      options={visibleOptions}
      valueField="id"
      labelField="name"
      display="custom"
      loading={searching}
      placeholder={$t('system.entities.ai_model.search_hf')}
      searchPlaceholder={$t('system.entities.ai_model.search_hf')}
      {onSearchInput}
      onLoadMore={loadMore}
      {loadingMore}
      data-testid="ai-model-import-search"
    >
      {#snippet itemSnippet({ option, resolvedLabel, resolvedValue })}
        {@const hit = option as HfModelHit}
        <ModelIcon model_id={resolvedValue} class="size-4 shrink-0" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="truncate font-medium">{resolvedLabel}</span>
          <span class="truncate font-mono text-xs text-muted-foreground">{resolvedValue}</span>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-0.5 text-[10px] text-muted-foreground">
          {#if hit.est_download_mb !== null}
            <span
              class="flex items-center gap-1"
              title={$t('system.entities.ai_model.fields.download_size_mb')}
            >
              <Download class="size-3" />{#if !measured.has(hit.id)}~{/if}{formatMB(hit.est_download_mb)}
            </span>
          {/if}
          <RankMeter rank={hit.est_power_level} />
        </div>
      {/snippet}
      {#snippet selectedSnippet({ resolvedLabel, resolvedValue })}
        <span class="flex flex-1 items-center gap-2 truncate text-left">
          <ModelIcon model_id={resolvedValue} class="size-4 shrink-0" />
          <span class="truncate">{resolvedLabel}</span>
        </span>
      {/snippet}
    </ComboSelect>
    {#if searchError}
      <p class="text-xs text-destructive">{searchError}</p>
    {/if}

    {#if selected}
      <!-- dtype selector -->
      <div class="space-y-1.5">
        <label class="text-xs font-medium text-muted-foreground" for="ai-model-import-dtype">
          {$t('system.entities.ai_model.fields.dtype')}
        </label>
        {#if variantsLoading}
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <div class="size-3 animate-spin rounded-full border border-muted border-t-foreground"></div>
            {$t('app.common.loading')}
          </div>
        {:else if visibleVariants.length > 0}
          <ComboSelect
            id="ai-model-import-dtype"
            mode="single"
            bind:value={selectedDtype}
            options={visibleVariants}
            valueField="dtype"
            labelField="dtype"
            display="custom"
            searchable={false}
            data-testid="ai-model-import-dtype"
          >
            {#snippet itemSnippet({ option, resolvedLabel })}
              {@const v = option as HfDtypeVariant}
              <span class="flex-1 truncate font-medium">{resolvedLabel}</span>
              <span class="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground">
                <Download class="size-3" />{formatMB(v.download_mb)}
              </span>
            {/snippet}
          </ComboSelect>
        {/if}
      </div>

      <!-- Real metrics + power gauge, then HF link below -->
      {#if selectedVariant}
        <div class="space-y-1.5">
          <div class="flex items-center justify-between px-1 py-1">
            <span
              class="flex items-center gap-1.5 text-sm font-semibold"
              title={$t('system.entities.ai_model.fields.download_size_mb')}
            >
              <Download class="size-4 text-muted-foreground" />
              {formatMB(selectedVariant.download_mb)}
            </span>
            <span
              class="flex items-center gap-1.5 text-sm font-semibold"
              title={$t('system.entities.ai_model.fields.vram_mb')}
            >
              <MemoryStick class="size-4 text-muted-foreground" />
              {formatMB(selectedVariant.download_mb)}
            </span>
            <ScoreGauge value={powerLevel} label={$t('system.entities.ai_model.fields.power_level')} size={32} />
          </div>
          <a
            class="flex items-center justify-center gap-1.5 rounded-md py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            href={`https://huggingface.co/${selected}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="ai-model-import-hf-link"
          >
            <HuggingFaceIcon class="size-3.5" />
            {$t('system.entities.ai_model.view_on_hf')}
            <ExternalLink class="size-3" />
          </a>
        </div>
      {/if}

      <!-- Model default params (same fields as the cerebellum form) -->
      <div class="grid grid-cols-2 gap-3">
        <SliderField size="sm" id="import-temperature" bind:value={temperature} label={$t('system.entities.ai_model.fields.temperature')} defaultValue={0} min={0} max={2} step={0.1} decimals={1} data-testid="ai-model-import-temperature" />
        <SliderField size="sm" id="import-top-p" bind:value={top_p} label={$t('system.entities.ai_model.fields.top_p')} defaultValue={hfTopP ?? 0.9} min={0.01} max={1} step={0.01} decimals={2} data-testid="ai-model-import-top-p" />
        <SliderField size="sm" id="import-max-tokens" bind:value={max_tokens} label={$t('system.entities.ai_model.fields.max_tokens')} defaultValue={256} steps={[128, 256, 512, 1024, 2048, 4096, 8192]} data-testid="ai-model-import-max-tokens" />
        <SliderField size="sm" id="import-rep-penalty" bind:value={repetition_penalty} label={$t('system.entities.ai_model.fields.repetition_penalty')} defaultValue={hfRepPenalty ?? 1.1} min={1} max={2} step={0.01} decimals={2} data-testid="ai-model-import-repetition-penalty" />
      </div>

      <SwitchField
        size="sm"
        id="import-thinking"
        bind:checked={enable_thinking}
        label={$t('system.entities.ai_model.fields.enable_thinking')}
        data-testid="ai-model-import-thinking"
      />

      <SelectableFieldset label={$t('system.entities.ai_cerebellum.fields.execution_config')}>
        <div class="grid grid-cols-2 gap-3">
          <SwitchField
            size="sm"
            id="import-kv-cache"
            bind:checked={kv_cache_reuse}
            label={$t('system.entities.ai_cerebellum.fields.kv_cache_reuse')}
            data-testid="ai-model-import-kv-cache-reuse"
          />
          <SwitchField
            size="sm"
            id="import-sliding-window"
            bind:checked={sliding_window}
            label={$t('system.entities.ai_cerebellum.fields.sliding_window')}
            data-testid="ai-model-import-sliding-window"
          />
          <SwitchField
            size="sm"
            id="import-intent-detection"
            bind:checked={intent_detection}
            label={$t('system.entities.ai_cerebellum.fields.intent_detection')}
            data-testid="ai-model-import-intent-detection"
          />
          <SliderField size="sm" id="import-max-history" bind:value={max_history_turns} label={$t('system.entities.ai_cerebellum.fields.max_history_turns')} defaultValue={6} min={1} max={16} step={1} data-testid="ai-model-import-max-history-turns" />
        </div>
      </SelectableFieldset>
    {/if}
  </div>

  {#snippet footer()}
    <div class="p-3">
      <Button
        variant="default"
        class="w-full"
        type="button"
        disabled={!selected || adding}
        onclick={addModel}
        data-testid="ai-model-import-add"
      >
        {$t('system.entities.ai_model.add_model')}
      </Button>
    </div>
  {/snippet}
</SheetPanelLayout>
