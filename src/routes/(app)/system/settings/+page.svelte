<script lang="ts">
  import { t } from '$lib/i18n';
  import * as Tabs from '$lib/components/ui/tabs';
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

  <Tabs.Root value={activeTab} onValueChange={(v) => activeTab = v}>
    <Tabs.List class="grid w-full grid-cols-4">
      {#each tabs as tab (tab.id)}
        {@const Icon = tab.icon}
        <Tabs.Trigger value={tab.id} class="flex items-center gap-2">
          <Icon class="size-4" />
          <span>{tab.label}</span>
        </Tabs.Trigger>
      {/each}
    </Tabs.List>

    <Tabs.Content value="profile" class="mt-6">
      <ProfileTab />
    </Tabs.Content>

    <Tabs.Content value="security" class="mt-6">
      <SecurityTab />
    </Tabs.Content>

    <Tabs.Content value="modules" class="mt-6">
      <ModulesTab />
    </Tabs.Content>

    <Tabs.Content value="templates" class="mt-6">
      <TemplatesTab />
    </Tabs.Content>
  </Tabs.Root>
</AppPageScaffold>
