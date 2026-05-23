<script lang="ts">
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { User, Shield, Package, FileText, Building2 } from 'lucide-svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import type { AppBreadcrumbSegment } from '$lib/shell/crm-breadcrumb';
  import { settingsTabMenuSegment } from '$lib/shell/crm-breadcrumb';
  import { page } from '$app/state';
  import { userProfileStore } from '$lib/user-profile-store.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';

  let { children } = $props();

  // Reactive derived values from store (for audit bar in profile)
  const profile = $derived(userProfileStore.current);
  const createdAt = $derived.by(() => profile?.created_at ? formatUiDateTime(profile.created_at, $uiLang) : '');
  const createdBy = $derived(profile?.created_by || '');
  const createdByName = $derived(profile?.created_by_name || '');
  const updatedAt = $derived.by(() => profile?.updated_at ? formatUiDateTime(profile.updated_at, $uiLang) : '');
  const updatedBy = $derived(profile?.updated_by || '');
  const updatedByName = $derived(profile?.updated_by_name || '');
  const version = $derived(profile?.version || 0);
  const userUuid = $derived(profile?.idp_code || '');

  // Determine current tab from path
  const currentTab = $derived(page.url.pathname.split('/').pop() || 'profile');

  const tabs = [
    { id: 'profile', label: $t('shell.settings.tabs.profile'), icon: User, href: '/system/settings/profile' },
    { id: 'organizations', label: $t('shell.settings.tabs.organizations'), icon: Building2, href: '/system/settings/organizations' },
    { id: 'security', label: $t('shell.settings.tabs.security'), icon: Shield, href: '/system/settings/security' },
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

  function openVersionHistory() {
    openSheet(
      'entity.versionHistory',
      {
        entity: 'user_profiles',
        rowUuid: userUuid
      }
    );
  }
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
        <div class="flex flex-col w-1/5 h-full bg-muted/30">
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
        <div class="flex-1 flex flex-col min-h-0">
          <div class="flex-1 overflow-auto">
            {@render children()}
          </div>

          <!-- Audit Bar (only for profile) -->
          {#if currentTab === 'profile'}
            <div class="bg-muted/50 border-t p-4">
              <div class="text-xs">
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {#if version}
                    <Badge
                      class={cn("text-xs font-semibold border border-sky-600 dark:border-sky-400 cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-950/20")}
                      variant="outline"
                      onclick={openVersionHistory}
                    >
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
      </div>
    </div>

    <!-- Footer -->
    <div class="bg-muted/50 shrink-0 border-t p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <!-- Footer content will be provided by child pages -->
    </div>
  </div>
</AppPageScaffold>
