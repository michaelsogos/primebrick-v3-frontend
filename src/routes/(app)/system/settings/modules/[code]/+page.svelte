<script lang="ts">
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import FormPageLayout from '$lib/components/FormPageLayout.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import { updateService, fetchModuleConfig, updateModuleConfigKey } from '$lib/api';
  import type { ServiceInfo, ModuleConfigEntry, IconType } from '$lib/api-types';

  let { data } = $props();
  let service = $state<ServiceInfo>(data.service);

  let formData = $state({
    name: service.name || '',
    description: service.description || '',
    base_url: service.base_url,
    icon: service.icon || '',
    icon_type: (service.icon_type || 'icon') as IconType,
    author: service.author || '',
    github_repo_url: service.github_repo_url || '',
  });

  let configEntries = $state<ModuleConfigEntry[]>([]);
  let configLoading = $state(false);
  let configError = $state<string | null>(null);
  let configLoaded = $state(false);
  let activeTab = $state('service-info');
  let isSavingServiceInfo = $state(false);

  async function loadConfig() {
    configLoading = true;
    configError = null;
    try {
      configEntries = await fetchModuleConfig(service.code);
      configLoaded = true;
    } catch (e) {
      configError = e instanceof Error ? e.message : 'Failed to load config';
      configLoaded = true;
    } finally {
      configLoading = false;
    }
  }

  $effect(() => {
    if (activeTab === 'module-config' && !configLoaded && !configLoading) {
      loadConfig();
    }
  });

  async function handleSaveServiceInfo() {
    isSavingServiceInfo = true;
    try {
      const updated = await updateService(service.code, {
        name: formData.name,
        description: formData.description,
        base_url: formData.base_url,
        icon: formData.icon,
        icon_type: formData.icon_type,
        author: formData.author,
        github_repo_url: formData.github_repo_url,
      });
      service = updated;
      pushNotification({
        impact: 'NONE',
        messageKey: 'common.saveSuccess',
        scope: $t('shell.settings.modules.config.serviceInfo'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'common.saveFailed',
        scope: $t('shell.settings.modules.config.serviceInfo'),
        detail: e instanceof Error ? e.message : undefined,
      });
    } finally {
      isSavingServiceInfo = false;
    }
  }

  async function handleSaveConfigKey(entry: ModuleConfigEntry, newValue: string) {
    try {
      await updateModuleConfigKey(service.code, entry.uuid, newValue);
      configEntries = configEntries.map((e) =>
        e.key === entry.key ? { ...e, value: newValue } : e,
      );
      pushNotification({
        impact: 'NONE',
        messageKey: 'common.saveSuccess',
        scope: $t('shell.settings.modules.config.moduleConfig'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'common.saveFailed',
        scope: $t('shell.settings.modules.config.moduleConfig'),
        detail: e instanceof Error ? e.message : undefined,
      });
    }
  }
</script>

<svelte:window onbeforeunload={(e) => { if (isSavingServiceInfo) { e.preventDefault(); e.returnValue = ''; } }} />

<FormPageLayout
  entity="service_registry"
  rowUuid={service.code}
  auditData={{}}
  auditingColumns={[]}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/modules' },
          { label: $t('shell.settings.modules.title'), href: '/system/settings/modules' },
          { label: service.name || service.code },
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">
        {service.name || service.code}
      </h1>
    </div>
  {/snippet}

  {#snippet children()}
    <div class="flex-1 overflow-auto p-4">
      <Tabs bind:value={activeTab}>
        <TabsList>
          <TabsTrigger value="service-info">
            {$t('shell.settings.modules.config.serviceInfo')}
          </TabsTrigger>
          <TabsTrigger value="module-config">
            {$t('shell.settings.modules.config.moduleConfig')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="service-info" class="flex-1 overflow-y-auto p-4">
          <form id="service-info-form" onsubmit={(e) => { e.preventDefault(); handleSaveServiceInfo(); }}>
            <div class="grid grid-cols-2 gap-6">
              <div class="space-y-2">
                <label for="name" class="text-sm font-medium">{$t('shell.settings.modules.config.name')}</label>
                <Input id="name" bind:value={formData.name} />
              </div>

              <div class="space-y-2">
                <label for="base_url" class="text-sm font-medium">{$t('shell.settings.modules.config.baseUrl')}</label>
                <Input id="base_url" bind:value={formData.base_url} />
              </div>

              <div class="col-span-2 space-y-2">
                <label for="description" class="text-sm font-medium">{$t('shell.settings.modules.config.description')}</label>
                <Input id="description" bind:value={formData.description} />
              </div>

              <div class="space-y-2">
                <label for="icon" class="text-sm font-medium">{$t('shell.settings.modules.config.icon')}</label>
                <Input id="icon" bind:value={formData.icon} placeholder={$t('shell.settings.modules.config.iconPlaceholder')} />
              </div>

              <div class="space-y-2">
                <label for="icon_type" class="text-sm font-medium">{$t('shell.settings.modules.config.iconType')}</label>
                <select id="icon_type" bind:value={formData.icon_type} class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs">
                  <option value="icon">{$t('shell.settings.modules.config.iconTypeIcon')}</option>
                  <option value="url">{$t('shell.settings.modules.config.iconTypeUrl')}</option>
                  <option value="svg">{$t('shell.settings.modules.config.iconTypeSvg')}</option>
                  <option value="base64">{$t('shell.settings.modules.config.iconTypeBase64')}</option>
                </select>
              </div>

              <div class="space-y-2">
                <label for="author" class="text-sm font-medium">{$t('shell.settings.modules.config.author')}</label>
                <Input id="author" bind:value={formData.author} />
              </div>

              <div class="space-y-2">
                <label for="github_repo_url" class="text-sm font-medium">{$t('shell.settings.modules.config.githubRepoUrl')}</label>
                <Input id="github_repo_url" bind:value={formData.github_repo_url} />
              </div>

              <div class="col-span-2 space-y-2">
                <label class="text-sm font-medium">{$t('shell.settings.modules.config.serviceVersion')}</label>
                <div class="flex items-center gap-2">
                  {#if service.service_version}
                    <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                      v{service.service_version}
                    </Badge>
                  {:else}
                    <span class="text-sm text-muted-foreground">—</span>
                  {/if}
                  <span class="text-xs text-muted-foreground">{$t('shell.settings.modules.config.serviceVersionHint')}</span>
                </div>
              </div>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="module-config" class="flex-1 overflow-y-auto p-4">
          {#if configLoading}
            <div class="text-sm text-muted-foreground">{$t('common.loading')}</div>
          {:else if configError}
            <div class="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <p class="text-sm text-muted-foreground">
                {$t('shell.settings.modules.config.configNotAvailable')}
              </p>
            </div>
          {:else if configEntries.length === 0}
            <div class="text-sm text-muted-foreground">
              {$t('shell.settings.modules.config.noConfigEntries')}
            </div>
          {:else}
            <div class="space-y-4">
              {#each configEntries as entry (entry.key)}
                <div class="space-y-2">
                  <label class="text-sm font-medium">
                    {entry.label_key ? $t(entry.label_key) : entry.key}
                  </label>
                  {#if entry.description_key}
                    <p class="text-xs text-muted-foreground">{$t(entry.description_key)}</p>
                  {/if}
                  <Input
                    value={entry.value || ''}
                    onchange={(e) => {
                      const target = e.target as HTMLInputElement;
                      handleSaveConfigKey(entry, target.value);
                    }}
                  />
                </div>
              {/each}
            </div>
          {/if}
        </TabsContent>
      </Tabs>
    </div>
  {/snippet}

  {#snippet footerActions()}
    {#if activeTab === 'service-info'}
      <Button type="submit" form="service-info-form" disabled={isSavingServiceInfo}>
        {#if isSavingServiceInfo}
          {$t('common.saving')}
        {:else}
          {$t('common.save')}
        {/if}
      </Button>
    {/if}
  {/snippet}
</FormPageLayout>
