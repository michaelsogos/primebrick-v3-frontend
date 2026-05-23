<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import { Building2 } from 'lucide-svelte';
  import { onDestroy } from 'svelte';

  const SYNC_CHANNEL_NAME = 'primebrick_organizations_sync';
  let syncChannel: BroadcastChannel | null = null;

  syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);

  function handleSave() {
    // TODO: Implement save logic
    // Notify parent window to refresh
    syncChannel?.postMessage('refresh');
    // Close the window
    window.close();
  }

  function handleCancel() {
    window.close();
  }

  onDestroy(() => {
    if (syncChannel) {
      syncChannel.close();
    }
  });
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          {
            label: $t('shell.settings.tabs.organizations'),
            href: '/system/settings'
          },
          {
            label: $t('common.new')
          }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('entities.organization.singular')} - {$t('common.new')}</h1>
    </div>
  {/snippet}

  <div class="flex min-h-0 flex-1 flex-col overflow-auto">
    <div class="shrink-0 space-y-2">
      <h2 class="text-lg font-semibold">{$t('entities.organization.create.title')}</h2>
      <p class="text-sm text-muted-foreground">{$t('entities.organization.create.description')}</p>
    </div>
    <div class="min-h-0 flex-1 space-y-3 overflow-auto text-sm text-muted-foreground">
      <p>{$t('entities.organization.create.body1')}</p>
      <p>{$t('entities.organization.create.body2')}</p>
      <ul class="list-inside list-disc space-y-1 pl-1">
        <li>{$t('entities.organization.create.fake1')}</li>
        <li>{$t('entities.organization.create.fake2')}</li>
        <li>{$t('entities.organization.create.fake3')}</li>
      </ul>
    </div>
  </div>

  <div class="bg-muted/50 shrink-0 border-t p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <button onclick={handleCancel} class="px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground">
      {$t('common.cancel')}
    </button>
    <button onclick={handleSave} class="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
      {$t('common.save')}
    </button>
  </div>
</AppPageScaffold>
