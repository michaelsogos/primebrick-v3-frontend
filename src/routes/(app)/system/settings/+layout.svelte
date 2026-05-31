<script lang="ts">
  import { t } from '$lib/i18n';
  import { User, ShieldCheck, Package, FileText, Building2, Users } from 'lucide-svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import type { AppBreadcrumbSegment } from '$lib/breadcrumb/types';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { page } from '$app/state';

  let { children } = $props();


  // Determine current tab from path
  const currentTab = $derived(page.url.pathname.split('/').pop() || 'profile');

  const tabs = [
    { id: 'profile', label: $t('shell.settings.tabs.profile'), icon: User, href: '/system/settings/profile' },
    { id: 'organizations', label: $t('shell.settings.tabs.organizations'), icon: Building2, href: '/system/settings/organizations' },
    { id: 'users', label: $t('shell.settings.tabs.users'), icon: Users, href: '/system/settings/users' },
    { id: 'security', label: $t('shell.settings.tabs.security'), icon: ShieldCheck, href: '/system/settings/security' },
    { id: 'modules', label: $t('shell.settings.tabs.modules'), icon: Package, href: '/system/settings/modules' },
    { id: 'templates', label: $t('shell.settings.tabs.templates'), icon: FileText, href: '/system/settings/templates' }
  ];

  const breadcrumbSegments: AppBreadcrumbSegment[] = $derived([
    { label: $t('shell.system') },
    { label: $t('shell.settings.title'), href: '/system/settings' },
    settingsTabMenuSegment({
      pathname: page.url.pathname,
      searchParams: new URLSearchParams(), // No longer used, but kept for compatibility
      t: (key) => $t(key)
    })
  ]);

</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb segments={breadcrumbSegments} />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.title')}</h1>
    </div>
  {/snippet}

  <div class="flex min-h-0 flex-1 flex-col gap-0">
    <div class="flex-1 overflow-hidden">
      <div class="flex w-full h-full gap-0">
        <!-- Tab Navigation -->
        <div class="flex flex-col w-1/5 h-full bg-muted/30 border-r">
          <nav class="flex flex-col p-2 gap-1 w-full h-full rounded-none">
            {#each tabs as tab (tab.id)}
              {@const Icon = tab.icon}
              {@const isActive = currentTab === tab.id}
              <a
                href={tab.href}
                class="flex items-center gap-2 justify-start w-full px-4 py-2 rounded-md hover:bg-background/50 {isActive ? 'bg-background font-medium border border-sky-200/80 dark:border-sky-900/55 text-primary' : 'border border-transparent'}"
              >
                <Icon class="size-4" />
                <span>{tab.label}</span>
              </a>
            {/each}
          </nav>
        </div>

        <!-- Content Area -->
        <div class="flex-1 flex flex-col min-h-0 overflow-auto">
          {@render children()}
        </div>
      </div>
    </div>
  </div>
</AppPageScaffold>
