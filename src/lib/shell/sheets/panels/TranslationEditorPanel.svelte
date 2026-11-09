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
   *   - AI (Browser Translator API, tier-0) suggests single-language text
   *     or fills every uncovered language — every AI output is reviewed
   *     per language (accept / accept-all), never auto-committed.
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
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { SheetPanelLayout, SheetPanelFooter, Button, Badge, ComboSelect, Textarea, AiIcon, CopyButton } from '@primebrick/ui';
  import { GradientIcon, GRADIENT_ICON_PATHS } from '$lib/components/ui/gradient-icon';
  import { Languages, LoaderCircle, Check, CircleCheck, Clock, CircleHelp, TriangleAlert, ArrowLeftRight, X, Eraser } from '@primebrick/ui/vendor/lucide';

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

  /** LINE 3a — which EN language feeds the preview (combobox, en-GB|en-US). */
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
  let aiSupported = browserTranslatorSupported();
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
  });

  const langOptions = orderLangEntriesByBrowser(
    UI_LANGS.map((l) => ({ code: l, label: UI_LANG_META[l].label, flag: UI_LANG_META[l].flag })),
    typeof navigator !== 'undefined' ? navigator.languages : null,
  );
  const enOptions = EN_LANGS.map((l) => ({ code: l, label: UI_LANG_META[l].label, flag: UI_LANG_META[l].flag }));

  const langText = (l: UiLang) => draft[l] ?? existing[l]?.value ?? '';

  /** The EN preview — the language picked in combobox 1 (draft or saved). */
  const previewValue = $derived(langText(previewLang));
  const showPreview = $derived(previewValue.trim() !== '');

  const hasEn = $derived(EN_LANGS.some((l) => langText(l).trim() !== ''));

  const missingLangs = $derived(UI_LANGS.filter((l) => langText(l).trim() === ''));
  const coveredCount = $derived(UI_LANGS.length - missingLangs.length);

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

  /** AI suggest source: always the EN preview (combobox 1). */
  const suggestible = (l: UiLang) =>
    aiSupported && !aiBusy && l !== previewLang && previewValue.trim() !== '';
  const canGenerateAll = $derived(
    aiSupported && !aiBusy && previewValue.trim() !== '' && missingLangs.length > 0,
  );

  const canSave = $derived(hasEn);

  async function suggestLang(l: UiLang) {
    const src = previewValue.trim();
    if (!suggestible(l) || !src) return;
    aiBusy = true;
    try {
      const availability = await browserPairAvailability(previewLang, l);
      if (availability === 'unavailable') {
        suggestions[l] = { text: '' };
        return;
      }
      const out = await translateBrowser(src, previewLang, l, (f) => {
        aiStep = `${toMtLang(previewLang)} → ${toMtLang(l)} · ${Math.min(100, Math.round(f * 100))}%`;
      });
      suggestions[l] = { text: out.trim() };
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
      <Badge
        variant="outline"
        class="ml-auto shrink-0 px-1.5 text-[10px] tabular-nums {coveredCount === UI_LANGS.length ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-destructive/30 bg-destructive/10 text-destructive'}"
        data-testid="i18n-editor-coverage"
      >
        {#if coveredCount === UI_LANGS.length}<CircleCheck class="mr-0.5 size-3" />{:else}<TriangleAlert class="mr-0.5 size-3" />{/if}
        {coveredCount}/{UI_LANGS.length}
      </Badge>
    </div>

    <!-- LINE 3 — two comboboxes: which EN language feeds the preview
         (single), and the update languages being edited (multi, 1..n),
         with a comparison glyph between them. -->
    <div class="flex items-center gap-2">
      <ComboSelect
        class="min-w-0 flex-1"
        mode="single"
        value={previewLang}
        onChange={(v) => { previewLang = (Array.isArray(v) ? v[0] : v) as UiLang; }}
        options={enOptions}
        valueField="code"
        labelField="label"
        flagField="flag"
        searchable={false}
        placeholder={$t('app.common.translations.base')}
        data-testid="i18n-editor-preview-lang"
      />
      <ArrowLeftRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <ComboSelect
        class="min-w-0 flex-1"
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

    <!-- LINE 4 — the EN preview picked in combobox 1: a plain DISABLED
         surface (gray box, muted text, not-a-field) — flag + copy sit
         right-top inside it. -->
    {#if showPreview}
      <div
        class="relative rounded-lg border bg-muted/50 px-2.5 pb-2 pt-8 text-sm text-muted-foreground cursor-not-allowed"
        data-testid="i18n-editor-base"
      >
        <span class="whitespace-pre-wrap" data-testid="i18n-editor-base-text">{previewValue}</span>
        <div class="absolute right-1.5 top-1.5 flex items-center gap-0.5">
          <CopyButton variant="ghost" size="icon" class="size-7" text={previewValue} data-testid="i18n-editor-base-copy" />
          <span class="fi fi-{UI_LANG_META[previewLang].flag} shrink-0 rounded-sm" aria-hidden="true"></span>
        </div>
      </div>
    {/if}

    <!-- LINE 5+ — one editor per update language: the chrome lives INSIDE
         the box — status icon left-top, AI suggest + eraser + copy + flag
         right-top; the text starts on the line below. No-permission rows
         degrade to disabled. -->
    {#each updateLangs as l (l)}
      {@const meta = statusBadge[statusOf(l)]}
      {@const editable = editableOf(l)}
      <div class="space-y-1.5" data-testid="i18n-editor-row-{l}">
        <div class="relative">
          <Textarea
            bind:ref={valueRefs[l]}
            bind:value={
              () => draft[l] ?? rowOf(l)?.value ?? '',
              (v) => { draft[l] = v; }
            }
            disabled={!editable}
            rows={3}
            placeholder={$t('system.settings.translations.value')}
            class="pt-9"
            aria-label={UI_LANG_META[l].label}
            data-testid="i18n-editor-value-{l}"
          />
          <div class="absolute left-2 top-1.5 flex items-center gap-1">
            <Badge variant="outline" class="{meta.class} px-1.5 text-[10px]" data-testid="i18n-editor-status-{l}">
              <meta.icon class="mr-0.5 size-3" />{$t(meta.label)}
            </Badge>
            {#if isEn(l) && !hasEn}
              <span class="text-[10px] text-destructive" title={$t('app.common.translations.en_required')} data-testid="i18n-editor-en-required-{l}">*</span>
            {/if}
          </div>
          <div class="absolute right-1.5 top-1.5 flex items-center gap-0.5">
            {#if suggestible(l)}
              <button
                type="button"
                class="rounded p-1 transition-colors hover:bg-accent disabled:opacity-50"
                title={$t('app.common.translations.suggest')}
                aria-label={$t('app.common.translations.suggest')}
                onclick={() => void suggestLang(l)}
                disabled={aiBusy}
                data-testid="i18n-editor-ai-suggest-{l}"
              >
                <AiIcon size={14} />
              </button>
            {/if}
            {#if editable}
              <button
                type="button"
                class="rounded p-1 transition-colors hover:bg-accent disabled:opacity-50"
                title={$t('app.common.clear')}
                aria-label={$t('app.common.clear')}
                onclick={() => { draft[l] = ''; valueRefs[l]?.focus(); }}
                disabled={langText(l).trim() === ''}
                data-testid="i18n-editor-clear-{l}"
              >
                <Eraser class="size-3.5" />
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
              <span class="inline-flex translate-y-0.5 items-center gap-0.5">
                <button
                  type="button"
                  class="rounded p-1 transition-colors hover:bg-accent"
                  title={$t('app.common.translations.accept')}
                  aria-label={$t('app.common.translations.accept')}
                  onclick={() => acceptSuggestion(l)}
                  data-testid="i18n-editor-suggestion-accept-{l}"
                >
                  <GradientIcon size={14} paths={GRADIENT_ICON_PATHS.check} />
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
          <AiIcon size={14} />
          <span class="text-xs font-medium">{$t('app.common.translations.results_title')}</span>
          <div class="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" class="h-6 px-2 text-xs" onclick={acceptAllResults} data-testid="i18n-editor-accept-all">
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

    {#if aiStep}
      <p class="font-mono text-xs text-muted-foreground" data-testid="i18n-editor-ai-step">{aiStep}</p>
    {/if}
    {#if !aiSupported}
      <p class="text-xs italic text-muted-foreground" data-testid="i18n-editor-ai-unsupported">
        {$t('app.common.translations.ai_unavailable')}
      </p>
    {/if}
  </div>

  {#snippet footer()}
    <SheetPanelFooter>
      {#if aiSupported}
        <Button
          variant="outline"
          onclick={() => void generateAll()}
          disabled={!canGenerateAll}
          data-testid="i18n-editor-generate-all"
        >
          {#if aiBusy}
            <LoaderCircle class="size-4 animate-spin" />
          {:else}
            <AiIcon size={14} />
          {/if}
          {$t('app.common.translations.generate_all')}
        </Button>
      {/if}
      <Button onclick={save} disabled={!canSave} title={!canSave ? $t('app.common.translations.en_required') : undefined} data-testid="i18n-editor-save">
        {$t('app.common.save')}
      </Button>
    </SheetPanelFooter>
  {/snippet}
</SheetPanelLayout>
