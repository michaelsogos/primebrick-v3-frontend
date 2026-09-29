<script lang="ts">
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { TextInput } from '$lib/components/ui/input';
  import { PrimeField } from '$lib/components/ui/form';
  import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import FormPageLayout from '$lib/components/FormPageLayout.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import { updateService, fetchModuleConfig, updateModuleConfigKey } from '$lib/api';
  import type { ServiceInfo, ModuleConfigEntry, IconType } from '$lib/api-types';

  let { data } = $props();
  // svelte-ignore state_referenced_locally
  // service is local mutable state initialized from the SvelteKit load prop.
  // It is reassigned on save (handleSaveServiceInfo), so $derived cannot be used.
  let service = $state<ServiceInfo>(data.service);

  // svelte-ignore state_referenced_locally
  // formData is local form state initialized from service fields.
  // It is mutated via bind:value in the form, so $derived cannot be used.
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
        messageKey: 'app.common.saveSuccess',
        scope: $t('system.settings.modules.config.serviceInfo'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'app.common.saveFailed',
        scope: $t('system.settings.modules.config.serviceInfo'),
        detail: e instanceof Error ? e.message : undefined,
      });
    } finally {
      isSavingServiceInfo = false;
    }
  }

  async function handleSaveConfigKey(entry: ModuleConfigEntry, newValue: string) {
    try {
      await updateModuleConfigKey(service.code, entry.uuid, newValue, entry.version);
      configEntries = configEntries.map((e) =>
        e.key === entry.key ? { ...e, value: newValue } : e,
      );
      pushNotification({
        impact: 'NONE',
        messageKey: 'app.common.saveSuccess',
        scope: $t('system.settings.modules.config.moduleConfig'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'app.common.saveFailed',
        scope: $t('system.settings.modules.config.moduleConfig'),
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
          { label: $t('app.system') },
          { label: $t('system.settings.title'), href: '/system/settings/modules' },
          { label: $t('system.settings.modules.title'), href: '/system/settings/modules' },
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
            {$t('system.settings.modules.config.serviceInfo')}
          </TabsTrigger>
          <TabsTrigger value="module-config">
            {$t('system.settings.modules.config.moduleConfig')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="service-info" class="flex-1 overflow-y-auto p-4">
          <form id="service-info-form" onsubmit={(e) => { e.preventDefault(); handleSaveServiceInfo(); }}>
            <div class="grid grid-cols-2 gap-6">
              <PrimeField id="name" label={$t('system.settings.modules.config.name')}>
                {#snippet control({ id })}
                  <TextInput {id} bind:value={formData.name} />
                {/snippet}
              </PrimeField>

              <PrimeField id="base_url" label={$t('system.settings.modules.config.baseUrl')}>
                {#snippet control({ id })}
                  <TextInput {id} bind:value={formData.base_url} />
                {/snippet}
              </PrimeField>

              <PrimeField id="description" class="col-span-2" label={$t('system.settings.modules.config.description')}>
                {#snippet control({ id })}
                  <TextInput {id} bind:value={formData.description} />
                {/snippet}
              </PrimeField>

              <PrimeField id="icon" label={$t('system.settings.modules.config.icon')}>
                {#snippet control({ id })}
                  <TextInput {id} bind:value={formData.icon} placeholder={$t('system.settings.modules.config.iconPlaceholder')} />
                {/snippet}
              </PrimeField>

              <PrimeField id="icon_type" label={$t('system.settings.modules.config.iconType')}>
                {#snippet control({ id })}
                  <select {id} bind:value={formData.icon_type} class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs">
                    <option value="icon">{$t('system.settings.modules.config.iconTypeIcon')}</option>
                    <option value="url">{$t('system.settings.modules.config.iconTypeUrl')}</option>
                    <option value="svg">{$t('system.settings.modules.config.iconTypeSvg')}</option>
                    <option value="base64">{$t('system.settings.modules.config.iconTypeBase64')}</option>
                  </select>
                {/snippet}
              </PrimeField>

              <PrimeField id="author" label={$t('system.settings.modules.config.author')}>
                {#snippet control({ id })}
                  <TextInput {id} bind:value={formData.author} />
                {/snippet}
              </PrimeField>

              <PrimeField id="github_repo_url" label={$t('system.settings.modules.config.githubRepoUrl')}>
                {#snippet control({ id })}
                  <TextInput {id} bind:value={formData.github_repo_url} />
                {/snippet}
              </PrimeField>

              <div class="col-span-2 space-y-2">
                <span class="inline-flex items-center gap-1 text-sm font-medium">
                  {$t('system.settings.modules.config.serviceVersion')}
                  <FormLabelWithPriorityHelp
                    text={$t('system.settings.modules.config.serviceVersionHint')}
                    priority="INFORMATION"
                  />
                </span>
                <div class="flex items-center gap-2">
                  {#if service.service_version}
                    <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                      v{service.service_version}
                    </Badge>
                  {:else}
                    <span class="text-sm text-muted-foreground">—</span>
                  {/if}
                </div>
              </div>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="module-config" class="flex-1 overflow-y-auto p-4">
          {#if configLoading}
            <div class="text-sm text-muted-foreground">{$t('app.common.loading')}</div>
          {:else if configError}
            <div class="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <p class="text-sm text-muted-foreground">
                {$t('system.settings.modules.config.configNotAvailable')}
              </p>
            </div>
          {:else if configEntries.length === 0}
            <div class="text-sm text-muted-foreground">
              {$t('system.settings.modules.config.noConfigEntries')}
            </div>
          {:else}
            <div class="space-y-4">
              {#each configEntries as entry (entry.key)}
                <PrimeField
                  id="cfg-{entry.key}"
                  label={entry.label_key ? $t(entry.label_key) : entry.key}
                  help={entry.description_key
                    ? { text: $t(entry.description_key), priority: 'INFORMATION' }
                    : undefined}
                >
                  {#snippet control({ id })}
                    <TextInput
                      {id}
                      value={entry.value || ''}
                      onchange={(e) => {
                        const target = e.target as HTMLInputElement;
                        handleSaveConfigKey(entry, target.value);
                      }}
                    />
                  {/snippet}
                </PrimeField>
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
          {$t('app.common.saving')}
        {:else}
          {$t('app.common.save')}
        {/if}
      </Button>
    {/if}
  {/snippet}
</FormPageLayout>
