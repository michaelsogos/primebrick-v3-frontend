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
  import { UI_LANGS, UI_LANG_META, DEFAULT_LANG, orderLangEntriesByBrowser, type UiLang } from '$lib/i18n/languages';
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
  import { Languages, LoaderCircle, Check, Clock, CircleHelp, X } from '@primebrick/ui/vendor/lucide';

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

  let selectedLang = $state<UiLang>(get(uiLang));

  let aiBusy = $state(false);
  let aiStep = $state('');
  let aiSupported = browserTranslatorSupported();
  /** Single-language AI suggestion pending review. */
  let suggestion = $state<{ lang: UiLang; text: string } | null>(null);
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
      // Selector default (approved): EN when nothing EN exists, else the app language.
      if (!hasEn) selectedLang = 'en-GB';
    });
  });

  const langOptions = orderLangEntriesByBrowser(
    UI_LANGS.map((l) => ({ code: l, label: UI_LANG_META[l].label, flag: UI_LANG_META[l].flag })),
    typeof navigator !== 'undefined' ? navigator.languages : null,
  );

  const langText = (l: UiLang) => draft[l] ?? existing[l]?.value ?? '';

  /** The EN base — first EN language holding any text (saved or draft). */
  const baseLang = $derived(EN_LANGS.find((l) => langText(l).trim() !== '') ?? DEFAULT_LANG);
  const baseValue = $derived(langText(baseLang));
  /** LINE 3 visible only when there IS a base and it isn't the selected row. */
  const showBase = $derived(baseValue.trim() !== '' && selectedLang !== baseLang);

  const hasEn = $derived(EN_LANGS.some((l) => langText(l).trim() !== ''));

  const missingLangs = $derived(UI_LANGS.filter((l) => langText(l).trim() === ''));
  const coveredCount = $derived(UI_LANGS.length - missingLangs.length);

  const selectedRow = $derived(existing[selectedLang]);
  const selectedSaved = $derived(selectedRow != null);
  const selectedIsEn = $derived(EN_LANGS.includes(selectedLang));
  /** Editable: missing rows always; saved rows need the update perm AND a
   *  CAS identity (rows read via the flat-dict fallback carry none →
   *  read-only, an honest degradation — never a phantom update). */
  const selectedEditable = $derived(
    !selectedSaved || (canUpdateT && selectedRow?.uuid != null && selectedRow?.version != null),
  );
  const selectedDirty = $derived(
    draft[selectedLang] !== undefined && draft[selectedLang].trim() !== (selectedRow?.value ?? ''),
  );
  const selectedStatus = $derived.by((): 'saved' | 'modified' | 'missing' | 'draft' => {
    if (selectedSaved) return selectedDirty ? 'modified' : 'saved';
    return draft[selectedLang]?.trim() ? 'draft' : 'missing';
  });

  /** AI suggest source: always the EN base the user sees on LINE 3. */
  const canSuggest = $derived(
    aiSupported && !aiBusy && selectedLang !== baseLang && baseValue.trim() !== '',
  );
  const canGenerateAll = $derived(
    aiSupported && !aiBusy && baseValue.trim() !== '' && missingLangs.length > 0,
  );

  const canSave = $derived(hasEn);

  async function suggestSelected() {
    const src = baseValue.trim();
    if (!canSuggest || !src) return;
    aiBusy = true;
    try {
      const availability = await browserPairAvailability(baseLang, selectedLang);
      if (availability === 'unavailable') {
        suggestion = { lang: selectedLang, text: '' };
        return;
      }
      const out = await translateBrowser(src, baseLang, selectedLang, (f) => {
        aiStep = `${toMtLang(baseLang)} → ${toMtLang(selectedLang)} · ${Math.min(100, Math.round(f * 100))}%`;
      });
      suggestion = out.trim() ? { lang: selectedLang, text: out } : { lang: selectedLang, text: '' };
    } catch {
      suggestion = { lang: selectedLang, text: '' };
    } finally {
      aiBusy = false;
      aiStep = '';
    }
  }

  async function generateAll() {
    const src = baseValue.trim();
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
        const pair = `${toMtLang(baseLang)} → ${toMtLang(lang)} (${step}/${missing.length})`;
        aiStep = pair;
        const availability = await browserPairAvailability(baseLang, lang);
        if (availability === 'unavailable') {
          results.push({ lang, error: 'unavailable' });
          continue;
        }
        try {
          const out = await translateBrowser(src, baseLang, lang, (f) => {
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

  function acceptSuggestion() {
    if (!suggestion?.text) return;
    draft[suggestion.lang] = suggestion.text;
    suggestion = null;
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

  const statusBadge: Record<string, { label: string; class: string; icon: typeof Check }> = {
    saved: {
      label: 'app.common.translations.saved',
      class: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      icon: Check,
    },
    modified: {
      label: 'app.common.translations.modified',
      class: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      icon: Clock,
    },
    draft: {
      label: 'app.common.translations.draft',
      class: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      icon: Clock,
    },
    missing: {
      label: 'app.common.translations.missing',
      class: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      icon: CircleHelp,
    },
  };
  const statusMeta = $derived(statusBadge[selectedStatus]);
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

    <!-- LINE 2 — coverage: covered/total ratio + the untranslated-language
         list as clickable flag chips (click jumps the selector). -->
    <div class="flex items-center gap-2">
      <Badge variant="outline" class="shrink-0 px-1.5 text-[10px] tabular-nums" data-testid="i18n-editor-coverage">
        {coveredCount}/{UI_LANGS.length}
      </Badge>
      {#each missingLangs as l (l)}
        <button
          type="button"
          class="rounded-sm transition-opacity hover:opacity-70"
          title={UI_LANG_META[l].label}
          aria-label={UI_LANG_META[l].label}
          onclick={() => { selectedLang = l; }}
          data-testid="i18n-editor-missing-{l}"
        >
          <span class="fi fi-{UI_LANG_META[l].flag} rounded-sm" aria-hidden="true"></span>
        </button>
      {/each}
    </div>

    <!-- LINE 3 — EN base preview (hidden while the selected row IS the base,
         or when no EN text exists yet): flag + label meta row, read-only
         muted textarea with the copy button inside — no wrapping card. -->
    {#if showBase}
      <div data-testid="i18n-editor-base">
        <div class="mb-1 flex items-center gap-2">
          <span class="fi fi-{UI_LANG_META[baseLang].flag} shrink-0 rounded-sm" aria-hidden="true"></span>
          <span class="text-xs font-medium text-muted-foreground">{UI_LANG_META[baseLang].label}</span>
          <Badge variant="outline" class="border-sky-500/30 bg-sky-500/10 px-1 text-[10px] text-sky-700 dark:text-sky-300">
            {$t('app.common.translations.base')}
          </Badge>
        </div>
        <div class="relative">
          <Textarea value={baseValue} readonly rows={2} class="resize-none bg-muted/40 pr-10 text-sm" data-testid="i18n-editor-base-text" />
          <CopyButton class="absolute right-1.5 top-1.5 size-7" variant="ghost" size="icon" text={baseValue} data-testid="i18n-editor-base-copy" />
        </div>
      </div>
    {/if}

    <!-- LINE 4 — language selector (native labels + flags, browser order). -->
    <ComboSelect
      class="min-w-0 flex-1"
      mode="single"
      value={selectedLang}
      onChange={(v) => { selectedLang = (Array.isArray(v) ? v[0] : v) as UiLang; suggestion = null; }}
      options={langOptions}
      valueField="code"
      labelField="label"
      flagField="flag"
      searchable={false}
      data-testid="i18n-editor-lang"
    />

    <!-- LINE 5 — selected language editor: flag + label + status badge;
         textarea editable (input-bordered) or read-only without the
         update permission; AI + copy overlay top-right. -->
    <div>
      <div class="mb-1 flex items-center gap-2">
        <span class="fi fi-{UI_LANG_META[selectedLang].flag} shrink-0 rounded-sm" aria-hidden="true"></span>
        <span class="text-xs font-medium text-muted-foreground">
          {UI_LANG_META[selectedLang].label}{#if selectedIsEn && !hasEn}<span class="text-destructive" title={$t('app.common.translations.en_required')}>*</span>{/if}
        </span>
        <Badge variant="outline" class="{statusMeta.class} px-1.5 text-[10px]" data-testid="i18n-editor-status">
          <statusMeta.icon class="mr-0.5 size-3" />{$t(statusMeta.label)}
        </Badge>
        {#if selectedIsEn && !hasEn}
          <span class="text-[10px] text-destructive" data-testid="i18n-editor-en-required">
            {$t('app.common.translations.en_required')}
          </span>
        {/if}
      </div>
      <div class="relative">
        <Textarea
          bind:value={
            () => draft[selectedLang] ?? selectedRow?.value ?? '',
            (v) => { draft[selectedLang] = v; }
          }
          readonly={!selectedEditable}
          rows={3}
          placeholder={$t('system.settings.translations.value')}
          class={selectedEditable ? 'pr-16' : 'resize-none bg-muted/40'}
          data-testid="i18n-editor-value"
        />
        <div class="absolute right-1.5 top-1.5 flex items-center gap-0.5">
          {#if canSuggest}
            <button
              type="button"
              class="rounded p-1 transition-colors hover:bg-accent disabled:opacity-50"
              title={$t('app.common.translations.suggest')}
              aria-label={$t('app.common.translations.suggest')}
              onclick={() => void suggestSelected()}
              disabled={aiBusy}
              data-testid="i18n-editor-ai-suggest"
            >
              <AiIcon size={14} />
            </button>
          {/if}
          <CopyButton
            variant="ghost"
            size="icon"
            class="size-7"
            text={langText(selectedLang)}
            data-testid="i18n-editor-copy"
          />
        </div>
      </div>
    </div>

    <!-- Single-language AI suggestion — review card, accept fills the
         textarea (draft), reject discards. -->
    {#if suggestion}
      <div class="rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5" data-testid="i18n-editor-suggestion">
        {#if suggestion.text}
          <p class="text-sm">
            <span class="fi fi-{UI_LANG_META[suggestion.lang].flag} mr-1.5 rounded-sm" aria-hidden="true"></span>{suggestion.text}
            <button
              type="button"
              class="ml-1.5 inline-flex translate-y-0.5 rounded p-0.5 transition-colors hover:bg-accent"
              title={$t('app.common.translations.accept')}
              aria-label={$t('app.common.translations.accept')}
              onclick={acceptSuggestion}
              data-testid="i18n-editor-suggestion-accept"
            >
              <GradientIcon size={14} paths={GRADIENT_ICON_PATHS.check} />
            </button>
          </p>
        {:else}
          <p class="text-xs italic text-muted-foreground">{$t('app.common.translations.ai_unavailable')}</p>
        {/if}
      </div>
    {/if}

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
