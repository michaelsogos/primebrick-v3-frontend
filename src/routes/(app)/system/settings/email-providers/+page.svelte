<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Password from '$lib/components/ui/password';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { apiFetchExt } from '$lib/api-ext';
  import { ApiUnreachableError } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import Mail from '@lucide/svelte/icons/mail';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Save from '@lucide/svelte/icons/save';
  import X from '@lucide/svelte/icons/x';
  import Loader2 from '@lucide/svelte/icons/loader-2';

  interface EmailProvider {
    uuid: string;
    provider: string;
    api_key?: string;
    api_endpoint?: string | null;
    from_email?: string | null;
    from_name?: string | null;
    reply_to?: string | null;
    version?: number;
  }

  let providers = $state<EmailProvider[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let editingUuid = $state<string | null>(null);
  let isCreating = $state(false);
  let confirmDeleteUuid = $state<string | null>(null);

  let formData = $state({
    provider: '',
    api_key: '',
    api_endpoint: '',
    from_email: '',
    from_name: '',
    reply_to: '',
  });

  let errors = $state<Record<string, string>>({});

  const PROXY_BASE = '/ws/EMAILSENDER/api/v1/entities/providers';

  async function loadProviders() {
    loading = true;
    try {
      const data = await apiFetchExt<{ providers: EmailProvider[] }>(`${PROXY_BASE}/list`, { method: 'GET' });
      providers = data.providers || [];
    } catch (err) {
      if (err instanceof ApiUnreachableError && err.alreadyNotified) {
        // RFC 7807 notification already pushed by apiFetch — skip generic toast
      } else {
        pushNotification({
          impact: 'HIGH',
          message: err instanceof Error ? err.message : 'Failed to load email providers',
          scope: 'email-providers',
        });
      }
      providers = [];
    } finally {
      loading = false;
    }
  }

  function resetForm() {
    formData = {
      provider: '',
      api_key: '',
      api_endpoint: '',
      from_email: '',
      from_name: '',
      reply_to: '',
    };
    errors = {};
  }

  function startCreate() {
    resetForm();
    isCreating = true;
    editingUuid = null;
  }

  function startEdit(provider: EmailProvider) {
    formData = {
      provider: provider.provider,
      api_key: '',
      api_endpoint: provider.api_endpoint || '',
      from_email: provider.from_email || '',
      from_name: provider.from_name || '',
      reply_to: provider.reply_to || '',
    };
    errors = {};
    editingUuid = provider.uuid;
    isCreating = false;
  }

  function cancelForm() {
    isCreating = false;
    editingUuid = null;
    resetForm();
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!formData.provider.trim()) {
      e.provider = $t('shell.settings.emailProviders.errors.providerRequired');
    }
    if (isCreating && !formData.api_key.trim()) {
      e.api_key = $t('shell.settings.emailProviders.errors.apiKeyRequired');
    }
    if (formData.from_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.from_email)) {
      e.from_email = $t('shell.settings.emailProviders.errors.invalidEmail');
    }
    if (formData.reply_to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.reply_to)) {
      e.reply_to = $t('shell.settings.emailProviders.errors.invalidEmail');
    }
    errors = e;
    return Object.keys(e).length === 0;
  }

  async function saveProvider() {
    if (!validate()) return;
    saving = true;
    try {
      const payload: Record<string, unknown> = {
        provider: formData.provider.trim(),
        api_endpoint: formData.api_endpoint.trim() || null,
        from_email: formData.from_email.trim() || null,
        from_name: formData.from_name.trim() || null,
        reply_to: formData.reply_to.trim() || null,
      };
      // Only send api_key if it was filled in (don't blank it on edit)
      if (formData.api_key.trim()) {
        payload.api_key = formData.api_key.trim();
      }

      if (isCreating) {
        payload.api_key = formData.api_key.trim();
        await apiFetchExt(PROXY_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        pushNotification({
          impact: 'NONE',
          message: $t('shell.settings.emailProviders.notifications.created'),
          scope: 'email-providers',
        });
      } else if (editingUuid) {
        await apiFetchExt(`${PROXY_BASE}/${editingUuid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        pushNotification({
          impact: 'NONE',
          message: $t('shell.settings.emailProviders.notifications.updated'),
          scope: 'email-providers',
        });
      }
      cancelForm();
      await loadProviders();
    } catch (err) {
      if (err instanceof ApiUnreachableError && err.alreadyNotified) {
        // RFC 7807 notification already pushed by apiFetch — skip generic toast
      } else {
        pushNotification({
          impact: 'HIGH',
          message: err instanceof Error ? err.message : 'Failed to save provider',
          scope: 'email-providers',
        });
      }
    } finally {
      saving = false;
    }
  }

  async function deleteProvider(uuid: string) {
    saving = true;
    try {
      await apiFetchExt(`${PROXY_BASE}/${uuid}`, { method: 'DELETE' });
      pushNotification({
        impact: 'NONE',
        message: $t('shell.settings.emailProviders.notifications.deleted'),
        scope: 'email-providers',
      });
      confirmDeleteUuid = null;
      await loadProviders();
    } catch (err) {
      if (err instanceof ApiUnreachableError && err.alreadyNotified) {
        // RFC 7807 notification already pushed by apiFetch — skip generic toast
      } else {
        pushNotification({
          impact: 'HIGH',
          message: err instanceof Error ? err.message : 'Failed to delete provider',
          scope: 'email-providers',
        });
      }
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    loadProviders();
  });
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.emailProviders.title')}</h1>
    </div>
  {/snippet}

  <div class="flex-1 overflow-auto p-4">
    <div class="space-y-6">
      <div class="flex items-center justify-end">
        {#if !isCreating && !editingUuid}
          <Button onclick={startCreate}>
            <Plus class="size-4" />
            {$t('shell.settings.emailProviders.addProvider')}
          </Button>
        {/if}
      </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Loader2 class="size-6 animate-spin text-muted-foreground" />
    </div>
  {:else if isCreating || editingUuid}
    <!-- Create/Edit Form -->
    <div class="space-y-4 rounded-lg border p-6">
      <h3 class="text-lg font-medium">
        {isCreating
          ? $t('shell.settings.emailProviders.createProvider')
          : $t('shell.settings.emailProviders.editProvider')}
      </h3>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label for="provider">{$t('shell.settings.emailProviders.providerName')}</Label>
          <Input id="provider" bind:value={formData.provider} placeholder="brevo" />
          {#if errors.provider}
            <p class="text-sm text-destructive">{errors.provider}</p>
          {/if}
        </div>

        <div class="space-y-2">
          <Label for="api_key">{$t('shell.settings.emailProviders.apiKey')}</Label>
          <Password.PasswordInput id="api_key" bind:value={formData.api_key}
            placeholder={editingUuid ? $t('shell.settings.emailProviders.apiKeyLeaveBlank') : ''} />
          {#if errors.api_key}
            <p class="text-sm text-destructive">{errors.api_key}</p>
          {/if}
        </div>

        <div class="space-y-2">
          <Label for="api_endpoint">{$t('shell.settings.emailProviders.apiEndpoint')}</Label>
          <Input id="api_endpoint" bind:value={formData.api_endpoint}
            placeholder="https://api.brevo.com/v1" />
        </div>

        <div class="space-y-2">
          <Label for="from_email">{$t('shell.settings.emailProviders.fromEmail')}</Label>
          <Input id="from_email" type="email" bind:value={formData.from_email}
            placeholder="noreply@example.com" />
          {#if errors.from_email}
            <p class="text-sm text-destructive">{errors.from_email}</p>
          {/if}
        </div>

        <div class="space-y-2">
          <Label for="from_name">{$t('shell.settings.emailProviders.fromName')}</Label>
          <Input id="from_name" bind:value={formData.from_name}
            placeholder="My Company" />
        </div>

        <div class="space-y-2">
          <Label for="reply_to">{$t('shell.settings.emailProviders.replyTo')}</Label>
          <Input id="reply_to" type="email" bind:value={formData.reply_to}
            placeholder="support@example.com" />
          {#if errors.reply_to}
            <p class="text-sm text-destructive">{errors.reply_to}</p>
          {/if}
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Button onclick={saveProvider} disabled={saving}>
          {#if saving}
            <Loader2 class="size-4 animate-spin" />
          {:else}
            <Save class="size-4" />
          {/if}
          {$t('shell.settings.emailProviders.save')}
        </Button>
        <Button variant="outline" onclick={cancelForm} disabled={saving}>
          <X class="size-4" />
          {$t('shell.settings.emailProviders.cancel')}
        </Button>
      </div>
    </div>
  {:else if providers.length === 0}
    <div class="text-center py-12 text-muted-foreground">
      <Mail class="size-12 mx-auto mb-3 opacity-50" />
      <p>{$t('shell.settings.emailProviders.noProviders')}</p>
    </div>
  {:else}
    <!-- Providers List -->
    <div class="space-y-3">
      {#each providers as p (p.uuid)}
        <div class="rounded-lg border p-4">
          {#if confirmDeleteUuid === p.uuid}
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium">
                {$t('shell.settings.emailProviders.confirmDelete')}
              </p>
              <div class="flex items-center gap-2">
                <Button variant="destructive" size="sm" onclick={() => deleteProvider(p.uuid)} disabled={saving}>
                  {#if saving}
                    <Loader2 class="size-4 animate-spin" />
                  {/if}
                  {$t('shell.settings.emailProviders.confirm')}
                </Button>
                <Button variant="outline" size="sm" onclick={() => confirmDeleteUuid = null}>
                  {$t('shell.settings.emailProviders.cancel')}
                </Button>
              </div>
            </div>
          {:else}
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Mail class="size-5" />
                <div>
                  <div class="flex items-center gap-2">
                    <p class="font-medium">{p.provider}</p>
                    <Badge variant="outline">v{p.version}</Badge>
                  </div>
                  <p class="text-sm text-muted-foreground">
                    {p.from_email || '—'}
                    {#if p.from_name} · {p.from_name}{/if}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Button variant="ghost" size="icon" onclick={() => startEdit(p)}>
                  <Pencil class="size-4" />
                </Button>
                <Button variant="ghost" size="icon" onclick={() => confirmDeleteUuid = p.uuid}>
                  <Trash2 class="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
    </div>
  </div>
</AppPageScaffold>
