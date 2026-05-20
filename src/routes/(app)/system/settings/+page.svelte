<script lang="ts">
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import { User, Shield, Package, FileText } from 'lucide-svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import type { AppBreadcrumbSegment } from '$lib/shell/crm-breadcrumb';
  import ProfileTab from './profile-tab.svelte';
  import SecurityTab from './security-tab.svelte';
  import ModulesTab from './modules-tab.svelte';
  import TemplatesTab from './templates-tab.svelte';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';

  let activeTab = $state('profile');

  let createdAt = $state('');
  let createdBy = $state('');
  let updatedAt = $state('');
  let updatedBy = $state('');
  let version = $state(0);

  async function loadAuditData() {
    try {
      const res = await apiFetch('/api/v1/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile) {
          createdAt = data.profile.createdAt ? formatUiDateTime(data.profile.createdAt, $uiLang) : '';
          createdBy = data.profile.createdBy || '';
          updatedAt = data.profile.updatedAt ? formatUiDateTime(data.profile.updatedAt, $uiLang) : '';
          updatedBy = data.profile.updatedBy || '';
          version = data.profile.version || 0;
        }
      }
    } catch (error) {
      console.error('Failed to load audit data:', error);
    }
  }

  onMount(() => {
    loadAuditData();
  });

  const tabs = [
    { id: 'profile', label: $t('shell.settings.tabs.profile'), icon: User },
    { id: 'security', label: $t('shell.settings.tabs.security'), icon: Shield },
    { id: 'modules', label: $t('shell.settings.tabs.modules'), icon: Package },
    { id: 'templates', label: $t('shell.settings.tabs.templates'), icon: FileText }
  ];

  const breadcrumbSegments: AppBreadcrumbSegment[] = [
    { label: $t('shell.system') },
    { label: $t('shell.settings.title') }
  ];
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb segments={breadcrumbSegments} />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.title')}</h1>
    </div>
  {/snippet}

  <div class="flex min-h-0 flex-1">
    <Tabs.Root value={activeTab} onValueChange={(v) => activeTab = v} orientation="vertical" class="flex w-full h-full">
      <div class="flex flex-col w-1/5 border-r h-full bg-muted/30">
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
          <div class="p-6">
            <Tabs.Content value="profile" class="space-y-3">
              <ProfileTab />
            </Tabs.Content>

            <Tabs.Content value="security" class="space-y-3">
              <SecurityTab />
            </Tabs.Content>

            <Tabs.Content value="modules" class="space-y-3">
              <ModulesTab />
            </Tabs.Content>

            <Tabs.Content value="templates" class="space-y-3">
              <TemplatesTab />
            </Tabs.Content>
          </div>
        </div>

        <!-- Audit Bar -->
        <div class="bg-muted/50 border-t p-4">
          <div class="text-xs">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              {#if version}
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
                <span class="italic text-muted-foreground">{createdBy || '-'}</span>
              </div>
              <div class="flex items-center gap-x-2">
                <span class="text-primary">{$t('shell.settings.profile.updatedAt')}:</span>
                <span class="italic text-muted-foreground">{updatedAt || '-'}</span>
              </div>
              <div class="flex items-center gap-x-2">
                <span class="text-primary">{$t('shell.settings.profile.updatedBy')}:</span>
                <span class="italic text-muted-foreground">{updatedBy || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Tabs.Root>
  </div>
  <div class="bg-muted/50 shrink-0 border-t p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <Button type="submit">{$t('common.save')}</Button>
  </div>
</AppPageScaffold>
