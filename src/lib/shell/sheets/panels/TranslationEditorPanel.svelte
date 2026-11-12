<script lang="ts">
  /**
   * TranslationEditorPanel — `i18n.translationEditor` sheet: create AND
   * update translation rows for ONE i18n key, per UI language.
   *
   * Delayed-write contract (never a standalone CRUD):
   *   - saved rows are editable — their queued entries carry the observed
   *     `{ uuid, version }` and flush as PUT (optimistic-concurrency CAS);
   *   - users without `translation.update.single` see saved rows read-only;
   *   - values queue into the OWNER-SCOPED pending-translations store
   *     (`pending_owner` prop) and flush only with the owning page's save;
   *   - at least one EN value (en-GB|en-US) is mandatory — Save is gated;
   *   - the EN base preview shows while editing another language (never for
   *     the EN row itself — the textarea already IS that text);
   *   - AI suggests single-language text or fills every uncovered
   *     language — EASY = browser Translator API (tier-0); POWERED =
   *     instruct-SLM POC on the shared text-generation worker — every AI
   *     output is reviewed per language (accept / accept-all), never
   *     auto-committed.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { UI_LANGS, UI_LANG_META, orderLangEntriesByBrowser, type UiLang } from '$lib/i18n/languages';
  import { fetchModuleTranslations, fetchTranslationList } from '$lib/api';
  import {
    addPendingTranslation,
    dropPendingTranslation,
    getPendingTranslation,
  } from '$lib/i18n/pending-translations.svelte';
  import { hasRequiredPermission } from '$lib/permissions.svelte';
  import {
    browserPairAvailability,
    browserTranslatorSupported,
    toMtLang,
    translateBrowser,
  } from '$lib/ai/browser-translator';
  import { useAiAssistant } from '$lib/components/ui/smart-ai/use-ai-assistant.svelte';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { SheetPanelLayout, SheetPanelFooter, Button, ButtonGroup, Badge, ComboSelect, TextInput, Textarea, AiIcon, AiTypingDots, CopyButton, PrimeField, inputTrailingIconColorClasses } from '@primebrick/ui';
  import { Languages, LoaderCircle, Check, CircleCheck, Clock, CircleHelp, TriangleAlert, ArrowUpDown, X, Eraser, Cpu, CpuAi, ThumbsUp } from '@primebrick/ui/vendor/lucide';

  let { i18n_key, pending_owner }: { i18n_key: string; pending_owner: string } = $props();

  /** The owning translations schema — `custom.*` → custom, `app.*` → app, … */
  const keyModule = $derived(i18n_key.split('.')[0]);
  const keySegments = $derived(i18n_key.split('.'));

  /**
   * Dot-notation semantic palette (approved):
   *   seg[0] namespace owner → sky · `entities` marker → muted ·
   *   entity segment → violet · facet (`rows`/`fields`/…) → amber ·
   *   leaf identity → foreground-semibold. Non-`*.entities.*` keys
   *   degrade positionally: first=ns, last=leaf, middle=muted.
   */
  function segmentClass(seg: string, i: number, parts: string[]): string {
    const last = parts.length - 1;
    if (i === 0) return 'font-semibold text-sky-600 dark:text-sky-400';
    if (i === last) return 'font-semibold text-foreground';
    if (seg === 'entities') return 'text-muted-foreground';
    if (parts[1] === 'entities') {
      if (i === 2) return 'font-medium text-violet-600 dark:text-violet-400';
      if (i === 3) return 'text-amber-600 dark:text-amber-400';
    }
    return 'text-muted-foreground';
  }

  const EN_LANGS: UiLang[] = ['en-GB', 'en-US'];
  /** Server row per language — `{value}` always; `{uuid,version}` when the
   *  admin list endpoint could read them (update CAS identity). `null` =
   *  fetched, no row (createable); `undefined` = not fetched yet. */
  type ServerRow = { value: string; uuid?: string; version?: number };
  let existing = $state<Partial<Record<UiLang, ServerRow | null>>>({});
  /** User edits only — prefilled from the owner's pending queue on mount. */
  let draft = $state<Record<string, string>>({});

  const canUpdateT = hasRequiredPermission('translation.update.single');

  /** LINE 3a — which language feeds the preview (combobox, any of the 7;
   *  there is no fixed base language). */
  let previewLang = $state<UiLang>('en-GB');
  /** LINE 3b — the update languages being edited (multi-select, 1..n). */
  let updateLangs = $state<UiLang[]>([get(uiLang)]);
  /** Per-lang textarea refs — the eraser refocuses its own field.
   *  Pre-seeded: `bind:ref` refuses `undefined` when ref has a fallback. */
  let valueRefs = $state<Record<string, HTMLTextAreaElement | null>>(
    Object.fromEntries(UI_LANGS.map((l) => [l, null])),
  );

  let aiBusy = $state(false);
  let aiStep = $state('');
  /** Engine switch (sheet header, one for ALL rows): off = the EASY track
   *  (browser Translator API); on = the POWERED POC — an instruct SLM on
   *  the shared text-generation worker so the prompt can carry the
   *  CONTEXT the seq2seq MT could not (key segments, meaning hint).
   *  Model: granite-4.0-micro (q4f16) — third candidate after the
   *  ai-translation-powered.spec evidence: Qwen3-0.6B failed quality
   *  (~50% on terse labels), Qwen3.5-2B hit the qwen3_5-arch WebGPU
   *  CPU-fallback (~25-30s/call, DB evidence); granite swept 0.6-1.6s
   *  per turn on prior WebGPU tests and is proven is_compatible on
   *  this stack. Generation params ride the 'translation' cerebellum
   *  tuning (ai_cerebellum row → effective_params) — not constants. */
  const POWERED_MODEL_ID = 'onnx-community/granite-4.0-micro-ONNX-web';
  const LANG_NAME: Record<UiLang, string> = {
    'en-GB': 'British English',
    'en-US': 'American English',
    'it-IT': 'Italian',
    'fr-FR': 'French',
    'es-ES': 'Spanish',
    'de-DE': 'German',
    'pt-PT': 'European Portuguese',
  };
  let powered = $state(false);
  /** Free-form MEANING hint the user can hand the powered model — rides
   *  the system prompt next to the automatic key/entity/facet context. */
  let meaning = $state('');
  const poweredAssistant = useAiAssistant(POWERED_MODEL_ID, {
    build_system_prompt: () => poweredSystemPrompt(),
  }, { assistant_key: 'translation' });
  /** One-off generation params resolved from the 'translation' cerebellum
   *  tuning (assistant_key → ai_cerebellum row → effective_params): the
   *  row is the single source of this pair's generation contract. */
  const poweredParams = $derived.by(() => {
    const ep = poweredAssistant.effective_params;
    return { max_new_tokens: ep.max_tokens, temperature: ep.temperature, top_p: ep.top_p, repetition_penalty: ep.repetition_penalty };
  });
  const poweredStatus = $derived<'idle' | 'loading' | 'ready' | 'error'>(
    poweredAssistant.state.error
      ? 'error'
      : poweredAssistant.state.is_ready
        ? 'ready'
        : poweredAssistant.state.is_loading_model
          ? 'loading'
          : 'idle',
  );
  const aiSupported = $derived(
    powered ? poweredAssistant.state.error !== 'webgpu_required' : browserTranslatorSupported(),
  );
  /** Per-language AI suggestions pending review (one per update lang). */
  let suggestions = $state<Partial<Record<UiLang, { text: string }>>>({});
  /** Generate-all results pending review — one row per attempted language. */
  let results = $state<{ lang: UiLang; text?: string; error?: 'unavailable' | 'failed'; accepted?: boolean }[]>([]);

  /**
   * Read EVERY language's row for this key in ONE list call — the canonical
   * `filters[i][field]=key` WHERE carries uuid+version (CAS identity) for all
   * 7 langs. Fallback to per-language flat dicts when the list isn't
   * readable — the rows then exist WITHOUT identity and degrade to
   * read-only, never a phantom create.
   */
  async function loadAll() {
    try {
      const res = await fetchTranslationList(keyModule, {
        page_size: 100,
        filters: [{ field: 'key', op: '=', value: i18n_key }],
      });
      const rows = res.rows as Array<{ uuid: string; version: number; language: string; value: string }>;
      for (const r of rows) {
        if (UI_LANGS.includes(r.language as UiLang)) {
          existing[r.language as UiLang] = { value: r.value, uuid: r.uuid, version: r.version };
        }
      }
      for (const l of UI_LANGS) if (!(l in existing)) existing[l] = null;
    } catch {
      await Promise.all(
        UI_LANGS.map(async (lang) => {
          try {
            const dict = await fetchModuleTranslations(keyModule, lang);
            const v = dict[i18n_key];
            existing[lang] = v !== undefined ? { value: v } : null;
          } catch {
            existing[lang] = null;
          }
        }),
      );
    }
  }

  onMount(() => {
    // POWERED prefetch — the instruct model warms in the background while
    // the user is still in easy mode, so the first powered suggest is
    // instant. Transformers.js own Cache API holds the files across opens
    // (the SW prefetch layer was retired in favor of it) — first open
    // downloads ~0.6GB, later opens only rebuild the ONNX session.
    void poweredAssistant.init().catch(() => { /* best-effort warm — suggest retries */ });
    const pending = getPendingTranslation(pending_owner, i18n_key) ?? {};
    draft = Object.fromEntries(Object.entries(pending).map(([lang, e]) => [lang, e.value]));
    // Fetch EVERY language up front — the coverage counter and the missing
    // chips are headline data: an unfetched language must never read as
    // "missing".
    void loadAll().then(() => {
      // Defaults (approved): update = en-GB when nothing EN exists, else
      // the app language; preview = the first EN holding text, else en-GB.
      if (!hasEn) updateLangs = ['en-GB'];
      previewLang = EN_LANGS.find((l) => langText(l).trim() !== '') ?? 'en-GB';
    });
    return () => { void poweredAssistant.dispose(); };
  });

  const langOptions = orderLangEntriesByBrowser(
    UI_LANGS.map((l) => ({ code: l, label: UI_LANG_META[l].label, flag: UI_LANG_META[l].flag })),
    typeof navigator !== 'undefined' ? navigator.languages : null,
  );
  const langText = (l: UiLang) => draft[l] ?? existing[l]?.value ?? '';

  /** The EN preview — the language picked in combobox 1 (draft or saved). */
  const previewValue = $derived(langText(previewLang));
  const showPreview = $derived(previewValue.trim() !== '');

  const hasEn = $derived(EN_LANGS.some((l) => langText(l).trim() !== ''));

  const missingLangs = $derived(UI_LANGS.filter((l) => langText(l).trim() === ''));
  const coveredCount = $derived(UI_LANGS.length - missingLangs.length);

  /** The LINE-3 swap CTA exchanges preview ↔ update — only defined when the
   *  update side holds exactly ONE language; multi-selection greys it. */
  const canSwap = $derived(updateLangs.length === 1);
  function swapLangs() {
    if (updateLangs.length !== 1) return;
    const next = previewLang;
    previewLang = updateLangs[0];
    updateLangs = [next];
  }

  /** Per-language row helpers — read live state inside the each block. */
  const rowOf = (l: UiLang) => existing[l];
  const savedOf = (l: UiLang) => rowOf(l) != null;
  const isEn = (l: UiLang) => EN_LANGS.includes(l);
  /** Editable: missing rows always; saved rows need the update perm AND a
   *  CAS identity (rows read via the flat-dict fallback carry none →
   *  disabled, an honest degradation — never a phantom update). */
  const editableOf = (l: UiLang) =>
    !savedOf(l) || (canUpdateT && rowOf(l)?.uuid != null && rowOf(l)?.version != null);
  const statusOf = (l: UiLang): 'saved' | 'modified' | 'missing' | 'draft' => {
    if (savedOf(l)) {
      return draft[l] !== undefined && draft[l].trim() !== (rowOf(l)?.value ?? '') ? 'modified' : 'saved';
    }
    return draft[l]?.trim() ? 'draft' : 'missing';
  };

  /** AI suggest source: always the preview language (combobox 1). The
   *  button MOUNTS on every non-source row — an empty preview or a busy
   *  op only greys it (`disabled`), never unmounts it. */
  const suggestible = (l: UiLang) => aiSupported && l !== previewLang;
  const canSuggest = (l: UiLang) =>
    suggestible(l) && !aiBusy && previewValue.trim() !== '';
  const canGenerateAll = $derived(
    aiSupported && !aiBusy && previewValue.trim() !== '' && missingLangs.length > 0,
  );

  const canSave = $derived(hasEn);

  /**
   * POWERED prompt — the COMPACT shape the node probe proved on
   * Qwen3.5-2B (a verbose rules/context block broke the 0.6B and is
   * dead weight for the 2B): the system line carries only the contract,
   * the user message carries the instruction + the context the seq2seq
   * MT could never see — key segments + the free-form MEANING hint.
   */
  function poweredSystemPrompt(): string {
    return 'You are a professional translator for a business admin console UI. Reply with ONLY the translated UI label — no quotes, explanations, or alternatives.';
  }

  function poweredUserPrompt(target: UiLang, src: string): string {
    const isEntity = keySegments[1] === 'entities';
    const hint = meaning.trim();
    // Probe-validated on granite-4.0-micro (probe-granite-meaning, 8/8):
    // when a meaning is given the task MUST be reframed — "this label is
    // ambiguous, write the target label for its intended meaning" is the
    // only shape where the model follows the hint; every "translate the
    // label + meaning as side-context" shape anchors on the literal
    // label (or worse, translates the prompt itself).
    if (hint) {
      return [
        `The UI label "${src}" is ambiguous. Its intended meaning is: ${hint}.`,
        `Context key: ${i18n_key}${isEntity && keySegments[2] ? ` — entity ${keySegments[2]}${keySegments[3] ? `, ${keySegments[3]} facet` : ''}` : ''}`,
        `Write the ${LANG_NAME[target]} UI label for that meaning. Reply with ONLY the label.`,
      ].join('\n');
    }
    const context: string[] = [`Key: ${i18n_key}`];
    if (isEntity && keySegments[2]) {
      context.push(`entity ${keySegments[2]}${keySegments[3] ? `, ${keySegments[3]} facet` : ''}`);
    }
    return [
      `Translate the UI label from ${LANG_NAME[previewLang]} to ${LANG_NAME[target]}.`,
      context.join(' · '),
      `Label: ${src}`,
    ].join('\n');
  }

  /** Instruct models may echo quotes around their answer — strip them. */
  function cleanPoweredOutput(raw: string): string {
    return raw.trim().replace(/^["'«»“”‘’]+|["'«»“”‘’]+$/g, '').trim();
  }

  /**
   * Await the powered model's readiness (init may still be mid-download
   * from the onMount prefetch) — the pair label + load progress ride the
   * aiStep tail meanwhile. False when the engine can never run.
   */
  async function poweredReady(pair: string): Promise<boolean> {
    if (poweredAssistant.state.is_ready) return true;
    if (poweredAssistant.state.error) return false;
    await poweredAssistant.init().catch(() => {});
    while (poweredAssistant.state.is_loading_model) {
      aiStep = `${pair} · model ${poweredAssistant.state.load_progress}%`;
      await new Promise((r) => setTimeout(r, 250));
    }
    return poweredAssistant.state.is_ready;
  }

  async function suggestLang(l: UiLang) {
    const src = previewValue.trim();
    if (aiBusy || !suggestible(l) || !src) return;
    aiBusy = true;
    try {
      if (powered) {
        const pair = `${toMtLang(previewLang)} → ${toMtLang(l)}`;
        if (!(await poweredReady(pair))) {
          suggestions[l] = { text: '' };
          return;
        }
        const out = await poweredAssistant.generateOneOff(poweredSystemPrompt(), poweredUserPrompt(l, src), poweredParams);
        suggestions[l] = { text: cleanPoweredOutput(out) };
      } else {
        const availability = await browserPairAvailability(previewLang, l);
        if (availability === 'unavailable') {
          suggestions[l] = { text: '' };
          return;
        }
        const out = await translateBrowser(src, previewLang, l, (f) => {
          aiStep = `${toMtLang(previewLang)} → ${toMtLang(l)} · ${Math.min(100, Math.round(f * 100))}%`;
        });
        suggestions[l] = { text: out.trim() };
      }
    } catch {
      suggestions[l] = { text: '' };
    } finally {
      aiBusy = false;
      aiStep = '';
    }
  }

  async function generateAll() {
    const src = previewValue.trim();
    if (!canGenerateAll || !src) return;
    aiBusy = true;
    results = [];
    try {
      // Load every language first — an unfetched row must not read as missing.
      await loadAll();
      const missing = UI_LANGS.filter((l) => langText(l).trim() === '');
      let step = 0;
      for (const lang of missing) {
        step += 1;
        const pair = `${toMtLang(previewLang)} → ${toMtLang(lang)} (${step}/${missing.length})`;
        aiStep = pair;
        if (powered) {
          if (!(await poweredReady(pair))) {
            results.push({ lang, error: 'failed' });
            continue;
          }
          try {
            const out = await poweredAssistant.generateOneOff(poweredSystemPrompt(), poweredUserPrompt(lang, src), poweredParams);
            const text = cleanPoweredOutput(out);
            results.push(text ? { lang, text } : { lang, error: 'failed' });
          } catch {
            results.push({ lang, error: 'failed' });
          }
          continue;
        }
        const availability = await browserPairAvailability(previewLang, lang);
        if (availability === 'unavailable') {
          results.push({ lang, error: 'unavailable' });
          continue;
        }
        try {
          const out = await translateBrowser(src, previewLang, lang, (f) => {
            aiStep = `${pair} · ${Math.min(100, Math.round(f * 100))}%`;
          });
          results.push(out.trim() ? { lang, text: out } : { lang, error: 'failed' });
        } catch {
          results.push({ lang, error: 'failed' });
        }
      }
    } finally {
      aiBusy = false;
      aiStep = '';
    }
  }

  function acceptSuggestion(l: UiLang) {
    const s = suggestions[l];
    if (!s?.text) return;
    draft[l] = s.text;
    delete suggestions[l];
  }

  function acceptResult(lang: UiLang) {
    const r = results.find((x) => x.lang === lang);
    if (!r?.text) return;
    draft[lang] = r.text;
    r.accepted = true;
  }

  function acceptAllResults() {
    for (const r of results) {
      if (r.text && !r.accepted) {
        draft[r.lang] = r.text;
        r.accepted = true;
      }
    }
  }

  function save() {
    const entries: Record<string, { value: string; uuid?: string; version?: number }> = {};
    for (const [lang, v] of Object.entries(draft)) {
      const value = v.trim();
      if (!value) continue;
      const row = existing[lang as UiLang];
      if (row && row.value === value) continue; // unchanged — nothing to write
      entries[lang] =
        row?.uuid != null && row?.version != null
          ? { value, uuid: row.uuid, version: row.version }
          : { value };
    }
    if (Object.keys(entries).length > 0) addPendingTranslation(pending_owner, i18n_key, entries);
    else dropPendingTranslation(pending_owner, i18n_key);
    closeSheet();
  }

  const statusBadge: Record<string, { label: string; class: string; icon: typeof Check; iconClass: string }> = {
    saved: {
      label: 'app.common.translations.saved',
      class: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      icon: Check,
      iconClass: 'text-emerald-500',
    },
    modified: {
      label: 'app.common.translations.modified',
      class: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      icon: Clock,
      iconClass: 'text-sky-500',
    },
    draft: {
      label: 'app.common.translations.draft',
      class: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      icon: Clock,
      iconClass: 'text-sky-500',
    },
    missing: {
      label: 'app.common.translations.missing',
      class: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      icon: CircleHelp,
      iconClass: 'text-amber-500',
    },
  };
</script>

<SheetPanelLayout contentClass="p-3">
  {#snippet icon()}
    <Languages class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.settings.translations.title')}
  {/snippet}
  {#snippet actions()}
    <!-- Easy⇄Powered engine segmented toggle — ONE for the whole sheet
         (canonical ButtonGroup segmented + aria-pressed, the ViewModeToggle
         anatomy). Easy = browser Translator API; Powered = the POC
         instruct SLM (Qwen3-0.6B, context-capable). Disabled while any AI
         op is in flight so the engine never swaps mid-generation; the
         trailing dot mirrors the powered model status while powered. -->
    <div class="flex items-center gap-1.5">
      <ButtonGroup segmented data-testid="i18n-editor-engine-toggle">
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          class={!powered ? 'bg-foreground/10 text-foreground shadow-xs' : ''}
          aria-pressed={!powered}
          disabled={aiBusy}
          title={$t('app.common.translations.easy_hint')}
          onclick={() => { powered = false; }}
          data-testid="i18n-editor-engine-easy"
        >
          <Cpu class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          class={powered ? 'bg-foreground/10 text-foreground shadow-xs' : ''}
          aria-pressed={powered}
          aria-label={$t('app.common.translations.powered')}
          disabled={aiBusy}
          title={$t('app.common.translations.powered_hint')}
          onclick={() => { powered = true; }}
          data-testid="i18n-editor-engine-powered"
        >
          <CpuAi class="size-4" />
        </Button>
      </ButtonGroup>
      {#if powered && poweredStatus !== 'idle'}
        <span
          class="size-2 rounded-full {poweredStatus === 'ready' ? 'bg-emerald-500' : poweredStatus === 'loading' ? 'animate-pulse bg-sky-500' : 'bg-destructive'}"
          title={poweredStatus === 'ready'
            ? `Powered ready (${POWERED_MODEL_ID})`
            : poweredStatus === 'error'
              ? (poweredAssistant.state.error ?? 'error')
              : `${poweredStatus} · ${poweredAssistant.state.load_phase}`}
          data-testid="i18n-editor-powered-status"
        ></span>
      {/if}
    </div>
  {/snippet}
  <div class="space-y-3">
    <!-- LINE 1 — key label + the edited key as a colored dot-notation badge
         (full path is the badge text AND the title). -->
    <div class="flex items-center gap-2">
      <span class="text-xs font-medium text-muted-foreground">{$t('system.settings.translations.key')}</span>
      <Badge
        variant="outline"
        class="border-muted-foreground/30 bg-muted/50 font-mono text-xs"
        title={i18n_key}
        data-testid="i18n-editor-key"
      >
        {#each keySegments as seg, i (i)}
          {#if i > 0}<span class="text-muted-foreground/50">.</span>{/if}<span class={segmentClass(seg, i, keySegments)}>{seg}</span>
        {/each}
      </Badge>
    </div>

    <!-- LINE 2 — left: the missing-language copy + clickable flag chips;
         right: the covered/total ratio — success when full, destructive
         when anything is missing. -->
    <div class="flex items-center gap-2">
      <span class="shrink-0 text-xs text-muted-foreground" data-testid="i18n-editor-missing-label">
        {$t(missingLangs.length === 0 ? 'app.common.translations.missing_none' : 'app.common.translations.missing_list')}
      </span>
      {#each missingLangs as l (l)}
        <button
          type="button"
          class="rounded-sm transition-opacity hover:opacity-70"
          title={UI_LANG_META[l].label}
          aria-label={UI_LANG_META[l].label}
          onclick={() => { if (!updateLangs.includes(l)) updateLangs = [...updateLangs, l]; }}
          data-testid="i18n-editor-missing-{l}"
        >
          <span class="fi fi-{UI_LANG_META[l].flag} rounded-sm" aria-hidden="true"></span>
        </button>
      {/each}
      <!-- Generate-all-missing mini CTA — lives HERE next to the missing
           flags it fills; hidden when nothing is missing (no flags, no
           context) or when no AI engine can run. -->
      {#if aiSupported && missingLangs.length > 0}
        <Button
          variant="ghost"
          size="sm"
          class="h-6 shrink-0 px-2 text-xs"
          onclick={() => void generateAll()}
          disabled={!canGenerateAll}
          data-testid="i18n-editor-generate-all"
        >
          {#if aiBusy}
            <LoaderCircle class="size-3.5 animate-spin" />
          {:else}
            <AiIcon size={14} />
          {/if}
          {$t('app.common.translations.generate_all')}
        </Button>
      {/if}
      <Badge
        variant="outline"
        class="ml-auto shrink-0 px-1.5 text-[10px] tabular-nums {coveredCount === UI_LANGS.length ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-destructive/30 bg-destructive/10 text-destructive'}"
        data-testid="i18n-editor-coverage"
      >
        {#if coveredCount === UI_LANGS.length}<CircleCheck class="mr-0.5 size-3" />{:else}<TriangleAlert class="mr-0.5 size-3" />{/if}
        {coveredCount}/{UI_LANGS.length}
      </Badge>
    </div>

    <!-- LINE 3 — the two pickers STACKED full-width (preview source on
         top, update multi below — no labels on comboboxes); the swap CTA
         rides the right column spanning BOTH rows (row-span-2,
         vertically centered) — it exchanges preview ↔ update, enabled
         only while the update side holds exactly one language. -->
    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2.5">
      <ComboSelect
        class="min-w-0 w-full"
        mode="single"
        value={previewLang}
        onChange={(v) => { previewLang = (Array.isArray(v) ? v[0] : v) as UiLang; }}
        options={langOptions}
        valueField="code"
        labelField="label"
        flagField="flag"
        searchable={false}
        placeholder={$t('app.common.translations.preview')}
        data-testid="i18n-editor-preview-lang"
      />
      <Button
        variant="ghost"
        size="icon"
        class="row-span-2 size-8 shrink-0 self-center"
        disabled={!canSwap}
        title={$t('app.common.translations.swap')}
        aria-label={$t('app.common.translations.swap')}
        onclick={swapLangs}
        data-testid="i18n-editor-swap"
      >
        <ArrowUpDown class="size-4 text-primary" />
      </Button>
      <ComboSelect
        class="min-w-0 w-full"
        mode="multi"
        bind:value={updateLangs}
        options={langOptions}
        valueField="code"
        labelField="label"
        flagField="flag"
        searchable={false}
        placeholder={$t('system.settings.translations.language')}
        data-testid="i18n-editor-update-langs"
      />
    </div>

    <!-- LINE 4 — "Traduzione di esempio": the preview picked in combobox 1
         rendered as a DISABLED field under PrimeField — same label
         anatomy as the editable fields; copy + flag ride the in-box
         chrome top-right, like the translate areas. -->
    {#if showPreview}
      <PrimeField id="i18n-editor-preview" label={$t('app.common.translations.preview_label')}>
        {#snippet control({ id })}
          <div class="relative">
            <Textarea
              {id}
              value={previewValue}
              disabled
              rows={2}
              data-testid="i18n-editor-base"
            />
            <div class="absolute right-1.5 top-1.5 flex items-center gap-0.5" data-testid="i18n-editor-base-icons">
              <CopyButton variant="ghost" size="icon" class="size-7" text={previewValue} data-testid="i18n-editor-base-copy" />
              <span class="fi fi-{UI_LANG_META[previewLang].flag} shrink-0 rounded-sm" aria-hidden="true"></span>
            </div>
          </div>
        {/snippet}
      </PrimeField>
    {/if}

    <!-- LINE 4.5 — POWERED context: the free-form MEANING hint the user
         can hand the instruct model; it rides the system prompt next to
         the automatic key/entity/facet context. Powered-only — the easy
         browser API has no context channel at all. -->
    {#if powered}
      <PrimeField
        id="i18n-editor-meaning-field"
        label={$t('app.common.translations.meaning_label')}
      >
        {#snippet control({ id })}
          <TextInput
            {id}
            bind:value={meaning}
            disabled={aiBusy}
            placeholder={$t('app.common.translations.meaning_hint')}
            clearLabel={$t('app.common.clear')}
            data-testid="i18n-editor-meaning"
          />
        {/snippet}
      </PrimeField>
    {/if}

    <!-- LINE 5 — "Traduzioni nelle lingue selezionate" caption, ONCE over
         the translate text areas (one editor per update language): the
         chrome lives INSIDE the box — status icon left-top, AI suggest +
         eraser + copy + flag right-top; the text starts on the line
         below. No-permission rows degrade to disabled. -->
    <!-- LINE 5 — "Traduzioni nelle lingue selezionate" rides the FIRST
         row's PrimeField label (the group caption is the form label);
         later rows are label-less — the flag inside the box identifies
         the language. `*` + help mark the group-level EN requirement. -->
    {#each updateLangs as l, i (l)}
      {@const meta = statusBadge[statusOf(l)]}
      {@const editable = editableOf(l)}
      <div class="space-y-1.5" data-testid="i18n-editor-row-{l}">
        <PrimeField
          id="i18n-editor-field-{l}"
          label={i === 0 ? $t('app.common.translations.update_label') : undefined}
          required={i === 0 && !hasEn}
          help={i === 0 && !hasEn
            ? { text: $t('app.common.translations.en_required'), priority: 'WARNING' }
            : undefined}
          data-testid={i === 0 ? 'i18n-editor-update-caption' : undefined}
        >
          {#snippet control({ id })}
            <div class="relative">
              <Textarea
                {id}
                bind:ref={valueRefs[l]}
                bind:value={
                  () => draft[l] ?? rowOf(l)?.value ?? '',
                  (v) => { draft[l] = v; }
                }
                disabled={!editable}
                rows={3}
                placeholder={$t('system.settings.translations.value')}
                class="pt-9"
                data-testid="i18n-editor-value-{l}"
              />
              <div class="absolute left-2 top-1.5 flex items-center gap-1">
                <Badge variant="outline" class="{meta.class} px-1.5 text-[10px]" data-testid="i18n-editor-status-{l}">
                  <meta.icon class="mr-0.5 size-3" />{$t(meta.label)}
                </Badge>
              </div>
              <div class="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                {#if suggestible(l)}
                  <button
                    type="button"
                    class={inputTrailingIconColorClasses}
                    tabindex={-1}
                    title={$t('app.common.translations.suggest')}
                    aria-label={$t('app.common.translations.suggest')}
                    onclick={() => void suggestLang(l)}
                    disabled={!canSuggest(l)}
                    data-testid="i18n-editor-ai-suggest-{l}"
                  >
                    <AiIcon size={16} />
                  </button>
                {/if}
                {#if editable}
                  <button
                    type="button"
                    class={inputTrailingIconColorClasses}
                    tabindex={-1}
                    title={$t('app.common.clear')}
                    aria-label={$t('app.common.clear')}
                    onclick={() => { draft[l] = ''; valueRefs[l]?.focus(); }}
                    disabled={langText(l).trim() === ''}
                    data-testid="i18n-editor-clear-{l}"
                  >
                    <Eraser class="size-4" />
                  </button>
                {/if}
                <CopyButton
                  variant="ghost"
                  size="icon"
                  class="size-7"
                  text={langText(l)}
                  data-testid="i18n-editor-copy-{l}"
                />
                <span class="fi fi-{UI_LANG_META[l].flag} shrink-0 rounded-sm" aria-hidden="true"></span>
              </div>
            </div>
          {/snippet}
        </PrimeField>

        <!-- AI suggestion preview for THIS language — a disabled surface;
             the text flows from char 0 and the flag + gradient-check apply
             ride INLINE at the end of the flow, wrapping only when the
             text itself reaches the right edge. -->
        {#if suggestions[l]}
          <div
            class="rounded-lg border bg-muted/50 px-2.5 py-2 text-sm text-muted-foreground cursor-not-allowed"
            data-testid="i18n-editor-suggestion-{l}"
          >
            {#if suggestions[l]!.text}
              {suggestions[l]!.text}
              <span class="float-right ml-1 inline-flex h-[1lh] items-center gap-0.5" data-testid="i18n-editor-suggestion-icons-{l}">
                <button
                  type="button"
                  class={inputTrailingIconColorClasses}
                  tabindex={-1}
                  title={$t('app.common.translations.accept')}
                  aria-label={$t('app.common.translations.accept')}
                  onclick={() => acceptSuggestion(l)}
                  data-testid="i18n-editor-suggestion-accept-{l}"
                >
                  <ThumbsUp class="size-4" />
                </button>
                <span class="fi fi-{UI_LANG_META[l].flag} shrink-0 rounded-sm" aria-hidden="true"></span>
              </span>
            {:else}
              <span class="italic">{$t('app.common.translations.ai_unavailable')}</span>
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    <!-- Generate-all results — review list; each row is accepted singly
         or all at once. Failed/unavailable langs stay visible, honest. -->
    {#if results.length > 0}
      <div class="rounded-md border border-border" data-testid="i18n-editor-results">
        <div class="flex items-center gap-2 border-b border-border bg-muted/40 px-2.5 py-1.5">
          <AiIcon size={16} />
          <span class="text-xs font-medium">{$t('app.common.translations.results_title')}</span>
          <div class="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" class="h-6 px-2 text-xs" onclick={acceptAllResults} disabled={aiBusy} data-testid="i18n-editor-accept-all">
              {$t('app.common.translations.accept_all')}
            </Button>
            <Button variant="ghost" size="icon" class="size-6" onclick={() => (results = [])} aria-label={$t('app.common.translations.dismiss')} data-testid="i18n-editor-results-dismiss">
              <X class="size-3.5" />
            </Button>
          </div>
        </div>
        <ul class="divide-y divide-border">
          {#each results as r (r.lang)}
            <li class="flex items-start gap-2 px-2.5 py-2" data-testid="i18n-editor-result-{r.lang}">
              <span class="fi fi-{UI_LANG_META[r.lang].flag} mt-0.5 shrink-0 rounded-sm" aria-hidden="true"></span>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-medium text-muted-foreground">{UI_LANG_META[r.lang].label}</div>
                {#if r.text}
                  <p class="text-sm">{r.text}</p>
                {:else}
                  <p class="text-xs italic text-muted-foreground">
                    {$t(r.error === 'unavailable' ? 'app.common.translations.ai_unavailable' : 'app.common.translations.ai_failed')}
                  </p>
                {/if}
              </div>
              {#if r.accepted}
                <Badge variant="outline" class="border-sky-500/30 bg-sky-500/10 px-1.5 text-[10px] text-sky-700 dark:text-sky-300">
                  <Clock class="mr-0.5 size-3" />{$t('app.common.translations.draft')}
                </Badge>
              {:else if r.text}
                <Button variant="outline" size="sm" class="h-6 shrink-0 px-2 text-xs" onclick={() => acceptResult(r.lang)} data-testid="i18n-editor-accept-{r.lang}">
                  {$t('app.common.translations.accept')}
                </Button>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- AI busy indicator — the canonical assistant anatomy (icon +
         `*.generating` status + typing dots); the pair/progress detail
         rides as the tail. When the op ends the suggestions/results
         render directly — no "here you go" line. -->
    {#if aiBusy}
      <div class="flex items-center gap-2" data-testid="i18n-editor-ai-busy">
        <AiIcon size={16} />
        <span class="text-xs text-muted-foreground" data-testid="i18n-editor-ai-status">
          {$t('app.common.translations.generating')}
        </span>
        <AiTypingDots class="text-primary" data-testid="i18n-editor-ai-dots" />
        {#if aiStep}
          <span class="font-mono text-xs text-muted-foreground" data-testid="i18n-editor-ai-step">{aiStep}</span>
        {/if}
      </div>
    {/if}
    {#if !aiSupported}
      <p class="text-xs italic text-muted-foreground" data-testid="i18n-editor-ai-unsupported">
        {$t('app.common.translations.ai_unavailable')}
      </p>
    {/if}
  </div>

  {#snippet footer()}
    <SheetPanelFooter>
      <Button onclick={save} disabled={!canSave} title={!canSave ? $t('app.common.translations.en_required') : undefined} data-testid="i18n-editor-save">
        {$t('app.common.save')}
      </Button>
    </SheetPanelFooter>
  {/snippet}
</SheetPanelLayout>
