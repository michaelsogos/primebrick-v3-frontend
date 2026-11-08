<script lang="ts">
  /**
   * TranslationEditorPanel — `i18n.translationEditor` sheet: create
   * translation rows for ONE i18n key, per UI language.
   *
   * Create-only contract ("users create, admins curate"):
   *   - languages that already hold a row render their value READ-ONLY —
   *     editing existing values is the Translations admin page's job;
   *   - empty languages get a textarea — values queue into the standard
   *     pending-translations store and flush with the owning page's save;
   *   - the EN row is shown as the base/example for other languages;
   *   - the AI CTA fills EMPTY languages from the text the user is
   *     looking at, via the browser Translator API (tier-0) — zero-cost
   *     where available, honestly absent elsewhere.
   */
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { UI_LANGS, DEFAULT_LANG, type UiLang } from '$lib/i18n/languages';
  import { fetchModuleTranslations } from '$lib/api';
  import {
    addPendingTranslation,
    dropPendingTranslation,
    getPendingTranslation,
  } from '$lib/i18n/pending-translations.svelte';
  import {
    browserPairAvailability,
    browserTranslatorSupported,
    toMtLang,
    translateBrowser,
  } from '$lib/ai/browser-translator';
  import { closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { SheetPanelLayout, SheetPanelFooter, Button, Badge, ComboSelect, Textarea } from '@primebrick/ui';
  import { Languages, Sparkles, LoaderCircle } from '@primebrick/ui/vendor/lucide';

  let { i18n_key }: { i18n_key: string } = $props();

  /** The owning translations schema — `custom.*` → custom, `app.*` → app, … */
  const keyModule = $derived(i18n_key.split('.')[0]);

  const EN_LANGS: UiLang[] = ['en-GB', 'en-US'];

  let selectedLang = $state<UiLang>(get(uiLang));
  /** Server rows per language — `undefined` = no row yet (createable). */
  let existing = $state<Partial<Record<UiLang, string>>>({});
  const fetched = new SvelteSet<UiLang>();
  /** Editable creates — prefilled from the pending queue on mount. */
  let draft = $state<Record<string, string>>({});

  let aiBusy = $state(false);
  let aiStep = $state('');
  let aiFailed = $state<UiLang[]>([]);
  const aiSupported = browserTranslatorSupported();

  async function loadLang(lang: UiLang) {
    if (fetched.has(lang)) return;
    fetched.add(lang);
    try {
      const dict = await fetchModuleTranslations(keyModule, lang);
      existing[lang] = dict[i18n_key];
    } catch {
      // A missing dict degrades to createable textareas — the failure is
      // already surfaced by the i18n loader's notification discipline.
    }
  }

  onMount(() => {
    draft = { ...(getPendingTranslation(i18n_key) ?? {}) };
    for (const l of EN_LANGS) void loadLang(l);
  });

  $effect(() => {
    void loadLang(selectedLang);
  });

  const langOptions = UI_LANGS.map((l) => ({
    lang: l,
    flag: l.split('-').pop()!.toLowerCase(),
  }));

  /** The EN example — the "base" shown while editing another language. */
  const baseLang = $derived(EN_LANGS.find((l) => (existing[l] ?? draft[l])) ?? DEFAULT_LANG);
  const baseValue = $derived(existing[baseLang] ?? draft[baseLang] ?? '');
  const selectedExisting = $derived(existing[selectedLang]);
  const selectedIsEn = $derived(EN_LANGS.includes(selectedLang));
  /** The text the AI translates from — what the user is looking at. */
  const sourceText = $derived(draft[selectedLang] ?? selectedExisting ?? '');
  const missingCount = $derived(
    UI_LANGS.filter((l) => l !== selectedLang && !existing[l] && !draft[l]?.trim()).length,
  );
  const canGenerate = $derived(
    aiSupported && !aiBusy && sourceText.trim() !== '' && missingCount > 0,
  );

  async function generate() {
    const src = sourceText.trim();
    if (!src) return;
    aiBusy = true;
    aiFailed = [];
    try {
      // Load every language dict first — a not-yet-fetched row must not
      // read as "missing" and queue a conflicting create.
      await Promise.all(UI_LANGS.map((l) => loadLang(l)));
      const missing = UI_LANGS.filter(
        (l) => l !== selectedLang && !existing[l] && !draft[l]?.trim(),
      );
      let step = 0;
      for (const lang of missing) {
        aiStep = `${toMtLang(selectedLang)} → ${toMtLang(lang)} (${++step}/${missing.length})`;
        const availability = await browserPairAvailability(selectedLang, lang);
        if (availability === 'unavailable') {
          aiFailed.push(lang);
          continue;
        }
        try {
          const out = await translateBrowser(src, selectedLang, lang);
          if (out.trim()) draft[lang] = out;
        } catch {
          aiFailed.push(lang);
        }
      }
    } finally {
      aiBusy = false;
      aiStep = '';
    }
  }

  function save() {
    const clean: Record<string, string> = {};
    for (const [lang, v] of Object.entries(draft)) {
      if (v.trim()) clean[lang] = v.trim();
    }
    if (Object.keys(clean).length > 0) addPendingTranslation(i18n_key, clean);
    else dropPendingTranslation(i18n_key);
    closeSheet();
  }
</script>

<SheetPanelLayout contentClass="p-3">
  {#snippet icon()}
    <Languages class="size-4" />
  {/snippet}
  {#snippet title()}
    {$t('system.settings.translations.title')}
  {/snippet}
  {#snippet toolbar()}
    <ComboSelect
      mode="single"
      value={selectedLang}
      onChange={(v) => { selectedLang = (Array.isArray(v) ? v[0] : v) as UiLang; }}
      options={langOptions}
      valueField="lang"
      labelField="lang"
      flagField="flag"
      searchable={false}
      data-testid="i18n-editor-lang"
    />
  {/snippet}

  <div class="space-y-3">
    <div class="truncate font-mono text-xs text-muted-foreground" title={i18n_key}>{i18n_key}</div>

    {#if !selectedIsEn && baseValue}
      <div class="rounded-md border border-border bg-muted/40 p-2.5">
        <div class="mb-1 text-xs font-medium text-muted-foreground">
          {$t('app.common.translations.base')} · {baseLang}
        </div>
        <p class="text-sm">{baseValue}</p>
      </div>
    {/if}

    {#if selectedExisting !== undefined}
      <div class="rounded-md border border-border bg-muted/40 p-2.5">
        <div class="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{selectedLang}</span>
          <Badge variant="outline" class="text-[10px]">{$t('app.common.translations.managed')}</Badge>
        </div>
        <p class="text-sm">{selectedExisting}</p>
      </div>
    {:else}
      <div>
        <div class="mb-1 text-xs font-medium text-muted-foreground">{selectedLang}</div>
        <Textarea
          bind:value={draft[selectedLang]}
          rows={3}
          placeholder={$t('system.settings.translations.value')}
          data-testid="i18n-editor-value"
        />
      </div>
    {/if}

    {#if aiSupported}
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" onclick={() => void generate()} disabled={!canGenerate} data-testid="i18n-editor-ai-generate">
          {#if aiBusy}
            <LoaderCircle class="size-4 animate-spin" />
          {:else}
            <Sparkles class="size-4" />
          {/if}
          {aiBusy ? $t('app.common.translations.generating') : $t('app.common.translations.generate')}
        </Button>
        {#if aiStep}
          <span class="font-mono text-xs text-muted-foreground">{aiStep}</span>
        {/if}
      </div>
      {#if aiFailed.length}
        <p class="text-xs text-muted-foreground">
          {$t('app.common.translations.aiSkipped', { langs: aiFailed.join(', ') })}
        </p>
      {/if}
    {:else}
      <p class="text-xs italic text-muted-foreground" data-testid="i18n-editor-ai-unsupported">
        {$t('app.common.translations.aiUnavailable')}
      </p>
    {/if}
  </div>

  {#snippet footer()}
    <SheetPanelFooter>
      <Button variant="ghost" onclick={closeSheet}>{$t('app.common.cancel')}</Button>
      <Button onclick={save} data-testid="i18n-editor-save">{$t('app.common.save')}</Button>
    </SheetPanelFooter>
  {/snippet}
</SheetPanelLayout>
