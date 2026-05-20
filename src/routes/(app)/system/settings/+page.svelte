<script lang="ts">
  import { t } from '$lib/i18n';
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

  let activeTab = $state('profile');

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
        <Tabs.List class="flex flex-col p-2 gap-1 w-full h-full">
          {#each tabs as tab (tab.id)}
            {@const Icon = tab.icon}
            <Tabs.Trigger value={tab.id} class="flex items-center gap-2 justify-start w-full px-4 py-2 rounded-md hover:bg-background/50 data-[state=active]:bg-background data-[state=active]:font-medium border border-transparent data-[state=active]:border-sky-200/80 dark:data-[state=active]:border-sky-900/55 data-[state=active]:text-primary">
              <Icon class="size-4" />
              <span>{tab.label}</span>
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
      </div>

      <div class="flex-1 overflow-auto p-6">
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
    </Tabs.Root>
  </div>
  <div class="bg-muted/50 shrink-0 border-t p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <Button type="submit">{$t('common.save')}</Button>
  </div>
</AppPageScaffold>
