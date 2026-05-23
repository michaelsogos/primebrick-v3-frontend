<script lang="ts">
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import { User, Shield, Package, FileText, Building2 } from 'lucide-svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import type { AppBreadcrumbSegment } from '$lib/shell/crm-breadcrumb';
  import ProfileTab from './profile-tab.svelte';
  import OrganizationsTab from './organizations-tab.svelte';
  import SecurityTab from './security-tab.svelte';
  import ModulesTab from './modules-tab.svelte';
  import TemplatesTab from './templates-tab.svelte';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { beforeNavigate } from '$app/navigation';
  import { userProfileStore } from '$lib/user-profile-store.svelte';

  let activeTab = $state('profile');

  let hasAudit = $state(false);
  let hasChanges = $state(false);

  // Reactive derived values from store
  const profile = $derived(userProfileStore.current);
  const createdAt = $derived.by(() => profile?.created_at ? formatUiDateTime(profile.created_at, $uiLang) : '');
  const createdBy = $derived(profile?.created_by || '');
  const createdByName = $derived(profile?.created_by_name || '');
  const updatedAt = $derived.by(() => profile?.updated_at ? formatUiDateTime(profile.updated_at, $uiLang) : '');
  const updatedBy = $derived(profile?.updated_by || '');
  const updatedByName = $derived(profile?.updated_by_name || '');
  const version = $derived(profile?.version || 0);
  const userUuid = $derived(profile?.idp_code || '');

  async function loadEntityMetadata() {
    try {
      const res = await apiFetch('/api/v1/entities/user_profiles/meta');
      if (res.ok) {
        const data = await res.json();
        hasAudit = !!data.list?.auditingColumns?.length;
      }
    } catch (error) {
      console.error('Failed to load entity metadata:', error);
    }
  }

  function openVersionHistory() {
    openSheet(
      'entity.versionHistory',
      {
        entity: 'user_profiles',
        rowUuid: userUuid
      }
    );
  }

  function openNewOrganization() {
    const url = '/organizations/create';
    const childWindow = window.open(url, '_blank');
    if (childWindow) {
      childWindow.focus();
    } else {
      alert('Popup bloccato dal browser! Controlla le impostazioni.');
    }
  }

  // Block internal navigation when there are changes
  beforeNavigate((navigation) => {
    if (hasChanges) {
      const confirmLeave = confirm('Hai delle modifiche non salvate. Vuoi davvero uscire?');
      if (!confirmLeave) {
        navigation.cancel();
      }
    }
  });

  // Block external navigation (tab close, browser back/forward)
  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (hasChanges) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  onMount(() => {
    loadEntityMetadata();
  });

  const tabs = [
    { id: 'profile', label: $t('shell.settings.tabs.profile'), icon: User },
    { id: 'organizations', label: $t('shell.settings.tabs.organizations'), icon: Building2 },
    { id: 'security', label: $t('shell.settings.tabs.security'), icon: Shield },
    { id: 'modules', label: $t('shell.settings.tabs.modules'), icon: Package },
    { id: 'templates', label: $t('shell.settings.tabs.templates'), icon: FileText }
  ];

  const breadcrumbSegments: AppBreadcrumbSegment[] = [
    { label: $t('shell.system') },
    { label: $t('shell.settings.title') }
  ];

  // Expose function for profile tab to set dirty state
  function setHasChanges(value: boolean) {
    hasChanges = value;
  }

  // Memoize callback to prevent unnecessary re-renders
  const handleHasChange = $derived.by(() => setHasChanges);
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb segments={breadcrumbSegments} />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.title')}</h1>
    </div>
  {/snippet}

  <div class="flex min-h-0 flex-1 gap-0">
    <Tabs.Root value={activeTab} onValueChange={(v) => activeTab = v} orientation="vertical" class="flex w-full h-full gap-0">
      <div class="flex flex-col w-1/5 h-full bg-muted/30">
        <Tabs.List class="flex flex-col p-2 gap-1 w-full h-full rounded-none">
          {#each tabs as tab (tab.id)}
            {@const Icon = tab.icon}
            <Tabs.Trigger value={tab.id} class="flex items-center gap-2 justify-start w-full px-4 py-2 rounded-md hover:bg-background/50 data-[state=active]:bg-background data-[state=active]:font-medium border border-transparent data-[state=active]:border-sky-200/80 dark:data-[state=active]:border-sky-900/55 data-[state=active]:text-primary">
              <Icon class="size-4" />
              <span>{tab.label}</span>
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
      </div>

      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex-1 overflow-auto">
          <Tabs.Content value="profile" class="p-6 space-y-3">
            <ProfileTab onHasChange={handleHasChange} />
          </Tabs.Content>

          <Tabs.Content value="organizations" class="h-full">
            <OrganizationsTab />
          </Tabs.Content>

          <Tabs.Content value="security" class="p-6 space-y-3">
            <SecurityTab />
          </Tabs.Content>

          <Tabs.Content value="modules" class="p-6 space-y-3">
            <ModulesTab />
          </Tabs.Content>

          <Tabs.Content value="templates" class="p-6 space-y-3">
            <TemplatesTab />
          </Tabs.Content>
        </div>

        <!-- Audit Bar (only for profile) -->
        {#if activeTab === 'profile'}
          <div class="bg-muted/50 border-t p-4">
            <div class="text-xs">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                {#if version && hasAudit}
                  <Badge
                    class={cn("text-xs font-semibold border border-sky-600 dark:border-sky-400 cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-950/20")}
                    variant="outline"
                    onclick={openVersionHistory}
                  >
                    v{version}
                  </Badge>
                {:else if version}
                  <Badge class={cn("text-xs font-semibold border border-sky-600 dark:border-sky-400")} variant="outline">
                    v{version}
                  </Badge>
                {/if}
                <div class="flex items-center gap-x-2">
                  <span class="text-primary">{$t('shell.settings.profile.createdAt')}:</span>
                  <span class="italic text-muted-foreground">{createdAt || '-'}</span>
                </div>
                <div class="flex items-center gap-x-2">
                  <span class="text-primary">{$t('shell.settings.profile.createdBy')}:</span>
                  <span class="italic text-muted-foreground">{createdByName || createdBy || '-'}</span>
                </div>
                <div class="flex items-center gap-x-2">
                  <span class="text-primary">{$t('shell.settings.profile.updatedAt')}:</span>
                  <span class="italic text-muted-foreground">{updatedAt || '-'}</span>
                </div>
                <div class="flex items-center gap-x-2">
                  <span class="text-primary">{$t('shell.settings.profile.updatedBy')}:</span>
                  <span class="italic text-muted-foreground">{updatedByName || updatedBy || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </Tabs.Root>
  </div>
  <div class="bg-muted/50 shrink-0 border-t p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    {#if activeTab === 'profile'}
      <Button type="submit" form="profile-form" disabled={!hasChanges}>{$t('common.save')}</Button>
    {:else if activeTab === 'organizations'}
      <Button onclick={openNewOrganization}>{$t('common.new')}</Button>
    {/if}
  </div>
</AppPageScaffold>
