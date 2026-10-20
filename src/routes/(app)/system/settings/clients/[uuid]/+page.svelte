<script lang="ts">
  import { orderedColumns } from '$lib/entity-list';
  import { page } from '$app/state';
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { TextInput } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import { Badge } from '$lib/components/ui/badge';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import FormPageLayout from '$lib/components/FormPageLayout.svelte';
  import {
    FormField,
    FormLabel,
    FormControl,
    TranslatedFormFieldErrors,
  } from '$lib/components/ui/form';
  import { superForm, defaults } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import { onMount } from 'svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { extJsonStringify } from '$lib/api-ext';
  import { useEntityMetadata, type EntityMetadata } from '$lib/composables/useEntityMetadata.svelte';
  import { entityPageTitle, resolvePageTitle } from '$lib/utils/entity-meta';
  import { useFormGuard } from '$lib/composables/useFormGuard.svelte';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
  import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
  import { buildAuditData } from '$lib/utils/audit-data';
  import { minMsg, maxMsg } from '$lib/validation/zod-messages';
  import { pushNotification } from '$lib/errors/app-errors';
  import Dices from '@lucide/svelte/icons/dices';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Copy from '@lucide/svelte/icons/copy';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';

  const uuid = $derived(page.params.uuid);

  const { notifyParentRefresh } = useSyncChannel('primebrick_client_registry_sync', { mode: 'sender' });

  const updateSchema = z.object({
    ua_prefix: z
      .string()
      .min(2, { message: minMsg(2) })
      .max(120, { message: maxMsg(120) })
      .regex(/^\S+$/, { message: 'app.common.validation.invalidFormat' }),
    client_key: z.string().max(256, { message: maxMsg(256) }).default(''),
    is_enabled: z.boolean().default(true),
  });

  let client = $state<{
    uuid: string;
    ua_prefix: string;
    source: 'manual' | 'registry';
    key_mode?: 'static' | 'derived';
    key_generation?: number;
    key_rotated_at?: string | null;
    is_enabled: boolean;
    version: number;
    created_at?: string;
    created_by?: string;
    created_by_name?: string;
    updated_at?: string;
    updated_by?: string;
    updated_by_name?: string;
  } | null>(null);

  /** `source='registry'` rows are lifecycle-owned — view only. */
  const readOnly = $derived(client?.source !== 'manual');

  let meta = $state<EntityMetadata | null>(null);
  let pageTitle = $state('');
  let loading = $state(true);
  let isCreatePage = $state(false);

  const entityMetadata = useEntityMetadata({
    endpoint: '/api/v1/entities/client_registry/meta',
    entityName: 'client_registry',
  });

  $effect(() => {
    if (entityMetadata.state.meta) {
      meta = entityMetadata.state.meta as EntityMetadata;
    }
  });

  function generateClientKey(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  }

  function generateKey() {
    $form.client_key = generateClientKey();
  }

  // --- Key rotation (B14) ---------------------------------------------------
  // manual → server-mints a key (shown once); derived → generation bump (the
  // BE pre-computes the next hash itself); static registry → requires an
  // explicit key that the admin also places in the service config.

  let issuedKey = $state<string | null>(null);
  let derivedSecret = $state<string | null>(null);
  let keyCopied = $state(false);
  let rotating = $state(false);
  let rotateKey = $state('');

  async function copyKey(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      keyCopied = true;
      setTimeout(() => (keyCopied = false), 1500);
    } catch {
      /* clipboard unavailable — the field stays selectable */
    }
  }

  async function rotateClientKey() {
    if (!client || rotating) return;
    rotating = true;
    try {
      const body: Record<string, unknown> = {};
      // Static registry rows must supply the new key explicitly (BE 422 otherwise).
      const explicit = rotateKey.trim();
      if (explicit) body.client_key = explicit;
      const res = await apiFetch(`/api/v1/entities/client_registry/${uuid}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: extJsonStringify(body),
      });
      if (!res.ok) throw new Error(`rotate failed (${res.status})`);
      const result = (await res.json()) as { client_key?: string };
      rotateKey = '';
      if (result.client_key) {
        issuedKey = result.client_key;
      } else {
        pushNotification({ impact: 'NONE', message: $t('system.entities.client_registry.form.rotate_key'), scope: 'client_registry' });
      }
      await loadClient();
      notifyParentRefresh();
    } catch (error) {
      console.error('Failed to rotate client key:', error);
    } finally {
      rotating = false;
    }
  }

  async function showDerivedSecret() {
    const res = await apiFetch(`/api/v1/entities/client_registry/${uuid}/derive-secret`);
    if (!res.ok) return;
    const data = (await res.json()) as { service_key_derivation_secret?: string };
    derivedSecret = data.service_key_derivation_secret ?? null;
  }

  const superFormObj = superForm(defaults(zod4(updateSchema)), {
    SPA: true,
    validators: zod4(updateSchema),
    validationMethod: 'oninput',
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid || !client) return;

      try {
        const entity: Record<string, unknown> = {
          ua_prefix: updateForm.data.ua_prefix.trim(),
          is_enabled: updateForm.data.is_enabled,
          version: client.version,
        };
        // Empty → keep current key; filled → rotate (BE stores only the hash).
        const newKey = updateForm.data.client_key.trim();
        if (newKey) entity.client_key = newKey;

        const response = await apiFetch(`/api/v1/entities/client_registry/${uuid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: extJsonStringify({ entity }),
        });

        if (!response.ok) {
          cancel();
          return;
        }
        await response.json();
        await loadClient();
        notifyParentRefresh();
        if (window.opener) window.close();
      } catch (error) {
        console.error('Failed to update client registry row:', error);
        cancel();
      }
    },
  });

  const { form, errors, enhance, reset, tainted, isTainted } = superFormObj;

  const formGuard = useFormGuard(
    () => $tainted,
    () => $errors as Record<string, unknown>,
    isTainted as (path?: unknown) => boolean,
  );

  async function loadClient() {
    loading = true;
    try {
      const response = await apiFetch(`/api/v1/entities/client_registry/${uuid}`);
      if (!response.ok) return;
      const data = await response.json();
      client = data;
      reset({
        data: {
          ua_prefix: data.ua_prefix ?? '',
          client_key: '',
          is_enabled: data.is_enabled ?? true,
        },
      });
      pageTitle = resolvePageTitle(
        meta,
        client as Record<string, unknown> | null,
        client?.ua_prefix || '',
      );
    } catch (error) {
      console.error('Failed to load client registry row:', error);
    } finally {
      loading = false;
    }
  }

  const auditData = $derived(buildAuditData(client));

  onMount(() => {
    void entityMetadata.loadMetadata();
    void loadClient();
  });

  const { handleBeforeUnload, handleCancel } = useUnsavedChangesGuard(
    () => formGuard.hasChanges,
    'system.settings.profile.unsavedChanges',
  );
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<FormPageLayout
  entity="client_registry"
  rowUuid={uuid || ''}
  meta={meta || undefined}
  auditData={auditData}
  auditingColumns={orderedColumns(meta?.columns).filter((c) => c.audited)}
  isCreatePage={isCreatePage}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          }),
          { label: $t('system.settings.tabs.clients'), href: '/system/settings/clients' },
          { label: pageTitle || entityPageTitle(meta, 'edit', $t) }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{entityPageTitle(meta, 'edit', $t)}</h1>
      {#if client}
        <Badge variant={client.source === 'registry' ? 'secondary' : 'outline'}>
          {$t(`system.entities.client_registry.source.${client.source}`)}
        </Badge>
      {/if}
    </div>
  {/snippet}

    <div class="flex-1 overflow-auto">
      {#if loading && !client}
        <p class="p-4 text-sm text-muted-foreground">{$t('app.common.loading')}</p>
      {/if}
      {#if readOnly}
        <div class="m-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <ShieldAlert class="h-4 w-4 shrink-0" />
          {$t('system.entities.client_registry.form.registry_readonly')}
        </div>
      {/if}
      <form id="client-registry-edit-form" use:enhance data-has-changes={formGuard.hasChanges}>
        <fieldset disabled={readOnly} class="grid grid-cols-1 gap-6 p-4 max-w-2xl border-0">
          <FormField form={superFormObj} name="ua_prefix">
            <FormControl>
              {#snippet children({ props })}
                <div class="space-y-2">
                  <FormLabel for={props.id}>{$t('system.entities.client_registry.fields.ua_prefix')}</FormLabel>
                  <TextInput
                    {...props}
                    bind:value={$form.ua_prefix}
                    data-testid="client-registry-ua-prefix"
                  />
                  <p class="text-xs text-muted-foreground">{$t('system.entities.client_registry.form.ua_prefix_hint')}</p>
                  <TranslatedFormFieldErrors />
                </div>
              {/snippet}
            </FormControl>
          </FormField>

          <FormField form={superFormObj} name="client_key">
            <FormControl>
              {#snippet children({ props })}
                <div class="space-y-2">
                  <FormLabel for={props.id}>{$t('system.entities.client_registry.fields.client_key')}</FormLabel>
                  <div class="flex items-center gap-2">
                    <TextInput
                      {...props}
                      bind:value={$form.client_key}
                      type="password"
                      autocomplete="off"
                      data-testid="client-registry-client-key"
                    />
                    <Button type="button" variant="outline" size="sm" onclick={generateKey}>
                      <Dices class="h-3.5 w-3.5" />
                      {$t('system.entities.client_registry.form.generate_key')}
                    </Button>
                  </div>
                  <p class="text-xs text-muted-foreground">{$t('system.entities.client_registry.form.rotate_hint')}</p>
                  <TranslatedFormFieldErrors />
                </div>
              {/snippet}
            </FormControl>
          </FormField>

          <FormField form={superFormObj} name="is_enabled">
            <FormControl>
              {#snippet children({ props })}
                <div class="flex items-center gap-3">
                  <Switch {...props} bind:checked={$form.is_enabled} data-testid="client-registry-is-enabled" />
                  <FormLabel for={props.id}>{$t('system.entities.client_registry.fields.is_enabled')}</FormLabel>
                </div>
              {/snippet}
            </FormControl>
          </FormField>
        </fieldset>
      </form>

      {#if issuedKey}
        <div class="m-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
          <div class="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <KeyRound class="h-4 w-4" />
            {$t('system.entities.client_registry.form.rotated_key_notice')}
          </div>
          <div class="flex items-center gap-2">
            <code class="flex-1 break-all rounded bg-background px-3 py-2 font-mono text-xs">{issuedKey}</code>
            <Button variant="outline" size="sm" onclick={() => copyKey(issuedKey ?? '')}>
              <Copy class="h-3.5 w-3.5" />
              {keyCopied ? '✓' : $t('app.common.copy')}
            </Button>
          </div>
          <div class="flex justify-end">
            <Button variant="secondary" size="sm" onclick={() => (issuedKey = null)}>
              {$t('app.common.close')}
            </Button>
          </div>
        </div>
      {/if}
      {#if derivedSecret}
        <div class="m-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
          <div class="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <KeyRound class="h-4 w-4" />
            {$t('system.entities.client_registry.form.derived_secret_notice')}
          </div>
          <div class="flex items-center gap-2">
            <code class="flex-1 break-all rounded bg-background px-3 py-2 font-mono text-xs">{derivedSecret}</code>
            <Button variant="outline" size="sm" onclick={() => copyKey(derivedSecret ?? '')}>
              <Copy class="h-3.5 w-3.5" />
              {keyCopied ? '✓' : $t('app.common.copy')}
            </Button>
          </div>
          <div class="flex justify-end">
            <Button variant="secondary" size="sm" onclick={() => (derivedSecret = null)}>
              {$t('app.common.close')}
            </Button>
          </div>
        </div>
      {/if}

      {#if client}
        <div class="m-4 max-w-2xl space-y-3 rounded-md border p-4">
          <div class="flex items-center gap-2 text-sm font-medium">
            <KeyRound class="h-4 w-4" />
            {$t('system.entities.client_registry.form.rotate_key')}
            {#if client.key_mode}
              <Badge variant="outline">{$t(`system.entities.client_registry.key_mode.${client.key_mode}`)}</Badge>
            {/if}
            {#if client.key_mode === 'derived'}
              <Badge variant="secondary">#{client.key_generation ?? 0}</Badge>
            {/if}
          </div>
          {#if client.key_mode === 'derived'}
            <p class="text-xs text-muted-foreground">{$t('system.entities.client_registry.form.rotate_derived_hint')}</p>
            <div class="flex items-center gap-2">
              <Button variant="outline" size="sm" onclick={rotateClientKey} disabled={rotating} data-testid="client-registry-rotate">
                <RefreshCw class="h-3.5 w-3.5" />
                {$t('system.entities.client_registry.form.rotate_key')}
              </Button>
              <Button variant="outline" size="sm" onclick={showDerivedSecret} data-testid="client-registry-derive-secret">
                <KeyRound class="h-3.5 w-3.5" />
                {$t('system.entities.client_registry.form.derive_secret')}
              </Button>
            </div>
          {:else}
            {#if client.source === 'registry'}
              <div class="flex items-center gap-2">
                <TextInput
                  bind:value={rotateKey}
                  type="password"
                  autocomplete="off"
                  placeholder={$t('system.entities.client_registry.fields.client_key')}
                  data-testid="client-registry-rotate-key"
                />
              </div>
            {/if}
            <Button variant="outline" size="sm" onclick={rotateClientKey} disabled={rotating} data-testid="client-registry-rotate">
              <RefreshCw class="h-3.5 w-3.5" />
              {$t('system.entities.client_registry.form.rotate_key')}
            </Button>
          {/if}
        </div>
      {/if}
    </div>

  {#snippet footerActions()}
    <div class="flex gap-2">
      <Button variant="outline" onclick={handleCancel} data-testid="client-registry-cancel">
        {$t('app.common.cancel')}
      </Button>
      {#if !readOnly}
        <Button
          type="submit"
          form="client-registry-edit-form"
          disabled={!formGuard.canSave}
          data-testid="client-registry-submit"
        >
          {$t('app.common.save')}
        </Button>
      {/if}
    </div>
  {/snippet}
</FormPageLayout>
