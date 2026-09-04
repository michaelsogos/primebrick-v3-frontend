<script lang="ts">
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { ConfigList } from '$lib/components/config-list';
  import {
    fetchConfigEntries,
    deleteConfigEntry,
    bulkDeleteConfigEntries,
  } from '$lib/api';
  import { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import DeleteDialog from '$lib/components/entity-list-table/dialogs/DeleteDialog.svelte';
  import MfaStepUpDialog from '$lib/components/auth/MfaStepUpDialog.svelte';
  import type { ConfigEntry } from '$lib/api-types';

  let entries = $state<ConfigEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Single delete state
  let deleteTarget = $state<ConfigEntry | null>(null);
  let deleteDialogOpen = $state(false);
  let isDeleting = $state(false);

  // Bulk delete state
  let bulkTargets = $state<ConfigEntry[]>([]);
  let bulkDeleteDialogOpen = $state(false);
  let isBulkDeleting = $state(false);

  const stepUp = useMfaStepUp();

  // Listen for refresh notifications from the create page (opened in _blank tab)
  useSyncChannel('primebrick_config_sync', {
    mode: 'receiver',
    onRefresh: () => void loadEntries(),
  });

  onMount(loadEntries);

  // Open the create config page in a new tab (same pattern as users/orgs create)
  function openNewConfig() {
    const url = '/system/settings/security/create';
    const childWindow = window.open(url, '_blank');
    if (childWindow) {
      childWindow.focus();
    }
  }

  async function loadEntries() {
    loading = true;
    error = null;
    try {
      entries = await fetchConfigEntries();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load config entries';
    } finally {
      loading = false;
    }
  }

  // handleSave is now a trigger to reload entries after bulk save in ConfigList
  async function handleSave(_entry: ConfigEntry, _value: string) {
    await loadEntries();
  }

  function handleDelete(entry: ConfigEntry) {
    deleteTarget = entry;
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    isDeleting = true;
    try {
      const resp = await stepUp.executeWithToken(
        (token) => deleteConfigEntry(deleteTarget!.uuid, token),
        { action: 'delete', target_resource: 'config_entries' },
      );
      if (resp.ok) {
        entries = entries.filter((e) => e.uuid !== deleteTarget!.uuid);
        pushNotification({
          impact: 'NONE',
          messageKey: 'app.common.deleteSuccess',
          scope: $t('system.settings.security.title'),
        });
        deleteDialogOpen = false;
        deleteTarget = null;
      } else {
        const errorData = await resp.json().catch(() => null);
        pushNotification({
          impact: 'HIGH',
          messageKey: 'app.common.deleteFailed',
          scope: $t('system.settings.security.title'),
          detail: errorData?.detail ?? `HTTP ${resp.status}`,
        });
      }
    } catch (err) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'app.common.deleteFailed',
        scope: $t('system.settings.security.title'),
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      isDeleting = false;
    }
  }

  function handleBulkDelete(selected: ConfigEntry[]) {
    bulkTargets = selected;
    bulkDeleteDialogOpen = true;
  }

  async function confirmBulkDelete() {
    if (bulkTargets.length === 0) return;
    isBulkDeleting = true;
    try {
      const uuids = bulkTargets.map((e) => e.uuid);
      const resp = await stepUp.executeWithToken(
        (token) => bulkDeleteConfigEntries(uuids, token),
        { action: 'bulk_delete', target_resource: 'config_entries' },
      );
      if (resp.ok) {
        const deletedUuids = new Set(uuids);
        entries = entries.filter((e) => !deletedUuids.has(e.uuid));
        pushNotification({
          impact: 'NONE',
          messageKey: 'app.common.deleteSuccess',
          scope: $t('system.settings.security.title'),
        });
        bulkDeleteDialogOpen = false;
        bulkTargets = [];
      } else {
        const errorData = await resp.json().catch(() => null);
        pushNotification({
          impact: 'HIGH',
          messageKey: 'app.common.deleteFailed',
          scope: $t('system.settings.security.title'),
          detail: errorData?.detail ?? `HTTP ${resp.status}`,
        });
      }
    } catch (err) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'app.common.deleteFailed',
        scope: $t('system.settings.security.title'),
        detail: err instanceof Error ? err.message : undefined,
      });
    } finally {
      isBulkDeleting = false;
    }
  }
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('app.system') },
          { label: $t('system.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key),
          }),
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">
        {$t('system.settings.security.title')}
      </h1>
      <p class="text-sm text-muted-foreground">
        {$t('system.settings.security.description')}
      </p>
    </div>
  {/snippet}

  <ConfigList
    {entries}
    {loading}
    {error}
    onSave={handleSave}
    onDelete={handleDelete}
    onBulkDelete={handleBulkDelete}
    onCreateAction={openNewConfig}
  />
</AppPageScaffold>

<DeleteDialog
  bind:open={deleteDialogOpen}
  onOpenChange={(open) => {
    deleteDialogOpen = open;
    if (!open) deleteTarget = null;
  }}
  isDeleting={isDeleting}
  onConfirm={confirmDelete}
  onCancel={() => {
    deleteDialogOpen = false;
    deleteTarget = null;
  }}
/>

<DeleteDialog
  bind:open={bulkDeleteDialogOpen}
  onOpenChange={(open) => {
    bulkDeleteDialogOpen = open;
    if (!open) bulkTargets = [];
  }}
  isDeleting={isBulkDeleting}
  onConfirm={confirmBulkDelete}
  onCancel={() => {
    bulkDeleteDialogOpen = false;
    bulkTargets = [];
  }}
/>

<MfaStepUpDialog
  bind:open={stepUp.dialogOpen}
  action={stepUp.pendingAction}
  target_resource={stepUp.pendingTargetResource}
  onauthorized={stepUp.handleAuthorized}
/>
