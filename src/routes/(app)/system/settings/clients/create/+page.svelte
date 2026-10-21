<script lang="ts">
  import { page } from '$app/state';
  import { onMount, tick } from 'svelte';
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { TextInput } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
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
  import { moduleBreadcrumbSegments } from '$lib/breadcrumb/module-breadcrumb';
  import { apiFetch } from '$lib/api';
  import { extJsonStringify } from '$lib/api-ext';
  import { useFormGuard } from '$lib/composables/useFormGuard.svelte';
  import { useSyncChannel } from '$lib/composables/useSyncChannel.svelte';
  import { useUnsavedChangesGuard } from '$lib/composables/useUnsavedChangesGuard.svelte';
  import { buildAuditData } from '$lib/utils/audit-data';
  import { minMsg, maxMsg } from '$lib/validation/zod-messages';
  import { pushNotification } from '$lib/errors/app-errors';
  import Dices from '@lucide/svelte/icons/dices';
  import Copy from '@lucide/svelte/icons/copy';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';

  const { notifyParentRefresh } = useSyncChannel('primebrick_client_registry_sync', { mode: 'sender' });

  const createSchema = z.object({
    ua_prefix: z
      .string()
      .min(2, { message: minMsg(2) })
      .max(120, { message: maxMsg(120) })
      .regex(/^\S+$/, { message: 'app.common.validation.invalidFormat' })
      .default(''),
    client_key: z.string().max(256, { message: maxMsg(256) }).default(''),
    is_enabled: z.boolean().default(true),
  });

  /** Base64url random key — same strength as the BE-side generator. */
  function generateClientKey(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
  }

  /**
   * Server-generated key returned by the BE when `client_key` was left
   * empty — shown once, never stored in the UI after dismissal.
   */
  let issuedKey = $state<string | null>(null);
  let keyCopied = $state(false);

  function generateKey() {
    $form.client_key = generateClientKey();
  }

  async function copyKey(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      keyCopied = true;
      setTimeout(() => (keyCopied = false), 1500);
    } catch {
      /* clipboard unavailable — the field stays selectable */
    }
  }

  const superFormObj = superForm(defaults(zod4(createSchema)), {
    SPA: true,
    validators: zod4(createSchema),
    validationMethod: 'oninput',
    invalidateAll: false,
    resetForm: false,
    async onUpdate({ form: updateForm, cancel }) {
      if (!updateForm.valid) return;
      try {
        const entity: Record<string, unknown> = {
          ua_prefix: updateForm.data.ua_prefix.trim(),
          is_enabled: updateForm.data.is_enabled,
        };
        // Empty → let the BE generate and echo once.
        if (updateForm.data.client_key.trim()) {
          entity.client_key = updateForm.data.client_key.trim();
        }
        const res = await apiFetch('/api/v1/entities/client_registry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: extJsonStringify({ entity }),
        });
        if (!res.ok) throw new Error(`client_registry create failed (${res.status})`);
        const created = (await res.json()) as { client_key?: string };

        notifyParentRefresh();
        reset({ data: $form });

        // Server-generated key → surface it once instead of closing.
        if (created.client_key) {
          issuedKey = created.client_key;
          updateForm.data.client_key = '';
          return;
        }

        pushNotification({
          impact: 'NONE',
          message: $t('system.entities.client_registry.new.title'),
          scope: 'client_registry',
        });
        if (window.opener) window.close();
      } catch (error) {
        console.error('Failed to create client registry row:', error);
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

  const { handleBeforeUnload, handleCancel } = useUnsavedChangesGuard(
    () => formGuard.hasChanges,
    'system.settings.profile.unsavedChanges',
  );

  onMount(async () => {
    await new Promise((r) => requestAnimationFrame(r));
    await tick();
    reset({ data: $form });
    form.update((f) => f, { taint: 'untaint-all' });
  });

  const isCreatePage = $derived(true);
  const auditData = $derived(buildAuditData());
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<FormPageLayout
  entity="client_registry"
  rowUuid=""
  auditData={auditData}
  auditingColumns={[]}
  isCreatePage={isCreatePage}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          ...moduleBreadcrumbSegments({ pathname: page.url.pathname, t: (key) => $t(key) }),
          { label: $t('system.entities.client_registry.new.title') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('system.entities.client_registry.new.title')}</h1>
    </div>
  {/snippet}

    <div class="flex-1 overflow-auto">
      {#if issuedKey}
        <div class="m-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
          <div class="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <ShieldCheck class="h-4 w-4" />
            {$t('system.entities.client_registry.form.key_once_notice')}
          </div>
          <div class="flex items-center gap-2">
            <code class="flex-1 break-all rounded bg-background px-3 py-2 font-mono text-xs">{issuedKey}</code>
            <Button variant="outline" size="sm" onclick={() => copyKey(issuedKey ?? '')}>
              <Copy class="h-3.5 w-3.5" />
              {keyCopied ? '✓' : $t('app.common.copy')}
            </Button>
          </div>
          <div class="flex justify-end">
            <Button variant="secondary" size="sm" onclick={() => { issuedKey = null; if (window.opener) window.close(); }}>
              {$t('app.common.close')}
            </Button>
          </div>
        </div>
      {/if}
      <form id="client-registry-create-form" use:enhance data-has-changes={formGuard.hasChanges}>
        <div class="grid grid-cols-1 gap-6 p-4 max-w-2xl">
          <FormField form={superFormObj} name="ua_prefix">
            <FormControl>
              {#snippet children({ props })}
                <div class="space-y-2">
                  <FormLabel for={props.id}>{$t('system.entities.client_registry.fields.ua_prefix')}</FormLabel>
                  <TextInput
                    {...props}
                    bind:value={$form.ua_prefix}
                    placeholder="postman/"
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
                  <p class="text-xs text-muted-foreground">{$t('system.entities.client_registry.form.key_hint')}</p>
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
        </div>
      </form>
    </div>

  {#snippet footerActions()}
    <div class="flex gap-2">
      <Button variant="outline" onclick={handleCancel} data-testid="client-registry-cancel">
        {$t('app.common.cancel')}
      </Button>
      <Button
        type="submit"
        form="client-registry-create-form"
        disabled={!formGuard.canSave}
        data-testid="client-registry-submit"
      >
        {$t('app.common.save')}
      </Button>
    </div>
  {/snippet}
</FormPageLayout>
