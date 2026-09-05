<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { type UiLang, UI_LANGS, uiLangRegionSuffix } from '$lib/i18n/languages';
  import { pushNotification } from '$lib/errors/app-errors';
  import {
    fetchModules,
    fetchTranslationList,
    createTranslation,
    updateTranslation,
    deleteTranslation,
    restoreTranslation,
  } from '$lib/api';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { page as appPage } from '$app/state';

  type TranslationRow = {
    uuid: string;
    key: string;
    language: string;
    value: string;
    updated_at?: string;
    version?: number;
  };

  let modules = $state<string[]>([]);
  let selectedModule = $state<string>('app');
  let selectedLanguage = $state<UiLang>(get(uiLang) ?? 'en-GB');
  let rows = $state<TranslationRow[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Edit/Create dialog state
  let editingRow = $state<TranslationRow | null>(null);
  let isCreating = $state(false);
  let editKey = $state('');
  let editLanguage = $state('');
  let editValue = $state('');
  let saving = $state(false);

  async function loadModules() {
    try {
      // Static translation modules (always available — not in service_registry)
      const staticModules = ['app', 'system'];
      // US microservice modules from the existing /api/v1/modules endpoint
      const serviceModules = (await fetchModules())
        .map(m => m.id.toLowerCase())
        .filter(id => !staticModules.includes(id));
      modules = [...staticModules, ...serviceModules];
    } catch (e) {
      // Fall back to static modules only if the modules endpoint fails
      modules = ['app', 'system'];
      pushNotification({ impact: 'MEDIUM', message: 'Failed to load service modules, showing static modules only', scope: 'translations', detail: String(e) });
    }
  }

  async function loadRows() {
    loading = true;
    error = null;
    try {
      const result = await fetchTranslationList(selectedModule, {
        page: 1,
        page_size: 100,
        language: selectedLanguage,
      });
      rows = result.rows as TranslationRow[];
    } catch (e) {
      error = String(e);
      pushNotification({ impact: 'HIGH', message: 'Failed to load translations', scope: 'translations', detail: String(e) });
    } finally {
      loading = false;
    }
  }

  function openCreate() {
    isCreating = true;
    editingRow = null;
    editKey = '';
    editLanguage = selectedLanguage;
    editValue = '';
  }

  function openEdit(row: TranslationRow) {
    isCreating = false;
    editingRow = row;
    editKey = row.key;
    editLanguage = row.language;
    editValue = row.value;
  }

  function closeDialog() {
    editingRow = null;
    isCreating = false;
  }

  async function save() {
    if (!editKey || !editLanguage || !editValue) return;
    saving = true;
    try {
      if (isCreating) {
        await createTranslation(selectedModule, { key: editKey, language: editLanguage, value: editValue });
        pushNotification({ impact: 'NONE', message: 'Translation created', scope: 'translations' });
      } else if (editingRow) {
        await updateTranslation(selectedModule, editingRow.uuid, { key: editKey, language: editLanguage, value: editValue });
        pushNotification({ impact: 'NONE', message: 'Translation updated', scope: 'translations' });
      }
      closeDialog();
      await loadRows();
    } catch (e) {
      pushNotification({ impact: 'HIGH', message: 'Failed to save translation', scope: 'translations', detail: String(e) });
    } finally {
      saving = false;
    }
  }

  async function remove(row: TranslationRow) {
    if (!confirm(`Delete translation "${row.key}" (${row.language})?`)) return;
    try {
      await deleteTranslation(selectedModule, row.uuid);
      pushNotification({ impact: 'NONE', message: 'Translation deleted', scope: 'translations' });
      await loadRows();
    } catch (e) {
      pushNotification({ impact: 'HIGH', message: 'Failed to delete translation', scope: 'translations', detail: String(e) });
    }
  }

  async function restore(row: TranslationRow) {
    try {
      await restoreTranslation(selectedModule, row.uuid);
      pushNotification({ impact: 'NONE', message: 'Translation restored', scope: 'translations' });
      await loadRows();
    } catch (e) {
      pushNotification({ impact: 'HIGH', message: 'Failed to restore translation', scope: 'translations', detail: String(e) });
    }
  }

  onMount(async () => {
    await loadModules();
    await loadRows();
  });

  // Reload when module or language changes
  $effect(() => {
    selectedModule;
    selectedLanguage;
    if (modules.length > 0) {
      loadRows();
    }
  });
</script>

<AppPageScaffold>
  <AppPageBreadcrumb
    segments={[
      { label: $t('app.system') },
      { label: $t('system.settings.title'), href: '/system/settings/profile' },
      settingsTabMenuSegment({
        pathname: appPage.url.pathname,
        searchParams: appPage.url.searchParams,
        t: (key) => $t(key)
      })
    ]}
  />

  <div class="translations-admin">
    <div class="translations-admin__toolbar">
      <h1>{$t('system.settings.translations.title')}</h1>

      <div class="translations-admin__selectors">
        <label>
          <span>{$t('system.settings.translations.module')}</span>
          <select bind:value={selectedModule}>
            {#each modules as mod}
              <option value={mod}>{mod}</option>
            {/each}
          </select>
        </label>

        <label>
          <span>{$t('system.settings.translations.language')}</span>
          <select bind:value={selectedLanguage}>
            {#each UI_LANGS as lang}
              <option value={lang}>{uiLangRegionSuffix(lang)}</option>
            {/each}
          </select>
        </label>

        <button class="translations-admin__create" onclick={openCreate}>
          {$t('system.settings.translations.create')}
        </button>
      </div>
    </div>

    {#if loading}
      <p>{$t('app.common.loading')}</p>
    {:else if error}
      <p class="translations-admin__error">{error}</p>
    {:else}
      <table class="translations-admin__table">
        <thead>
          <tr>
            <th>{$t('system.settings.translations.key')}</th>
            <th>{$t('system.settings.translations.language')}</th>
            <th>{$t('system.settings.translations.value')}</th>
            <th>{$t('system.settings.translations.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.uuid)}
            <tr>
              <td>{row.key}</td>
              <td>{row.language}</td>
              <td>{row.value}</td>
              <td class="translations-admin__actions">
                <button onclick={() => openEdit(row)}>{$t('app.common.edit')}</button>
                <button onclick={() => remove(row)}>{$t('app.common.delete')}</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if editingRow || isCreating}
      <div
        class="translations-admin__dialog-overlay"
        role="button"
        tabindex="-1"
        aria-label="Close dialog"
        onclick={closeDialog}
        onkeydown={(e) => e.key === 'Escape' && closeDialog()}
      ></div>
      <div class="translations-admin__dialog">
        <h2>{isCreating ? $t('system.settings.translations.create') : $t('system.settings.translations.edit')}</h2>
        <label>
          <span>{$t('system.settings.translations.key')}</span>
          <input type="text" bind:value={editKey} disabled={!isCreating} />
        </label>
        <label>
          <span>{$t('system.settings.translations.language')}</span>
          <input type="text" bind:value={editLanguage} disabled={!isCreating} />
        </label>
        <label>
          <span>{$t('system.settings.translations.value')}</span>
          <textarea bind:value={editValue}></textarea>
        </label>
        <div class="translations-admin__dialog-actions">
          <button onclick={closeDialog}>{$t('app.common.cancel')}</button>
          <button onclick={save} disabled={saving || !editKey || !editLanguage || !editValue}>
            {saving ? $t('app.common.loading') : $t('app.common.save')}
          </button>
        </div>
      </div>
    {/if}
  </div>
</AppPageScaffold>

<style>
  .translations-admin__toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  .translations-admin__selectors {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
  }
  .translations-admin__selectors label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .translations-admin__table {
    width: 100%;
    border-collapse: collapse;
  }
  .translations-admin__table th,
  .translations-admin__table td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border, #e2e8f0);
  }
  .translations-admin__actions {
    display: flex;
    gap: 0.5rem;
  }
  .translations-admin__dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 50;
  }
  .translations-admin__dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg, white);
    padding: 1.5rem;
    border-radius: 0.5rem;
    z-index: 51;
    min-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .translations-admin__dialog label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .translations-admin__dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .translations-admin__error {
    color: var(--error, red);
  }
</style>
