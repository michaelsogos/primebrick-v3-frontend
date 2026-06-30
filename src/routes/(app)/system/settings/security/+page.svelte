<script lang="ts">
  import { t, formatUiDateTime } from '$lib/i18n';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Password from '$lib/components/ui/password';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';
  import { useEntityMetadata } from '$lib/composables/useEntityMetadata.svelte';

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');

  let oidcIssuer = $state('');
  let oidcClientId = $state('');
  let oidcClientSecret = $state('');

  let showDeleteWarning = $state(false);

  const metadata = useEntityMetadata({
    endpoint: '/api/v1/entities/security_settings/meta',
    entityName: 'security_settings'
  });

  // Audit state
  let auditInfo = $state({
    uuid: 'current', // Security settings use 'current' as UUID
    version: 0,
    createdAt: '',
    createdBy: '',
    createdByName: '',
    updatedAt: '',
    updatedBy: '',
    updatedByName: '',
    lastSyncedAt: ''
  });

  const hasAudit = $derived(!!metadata.state.meta?.list?.auditingColumns?.length);

  let hasChanges = $state(false);

  function openVersionHistory() {
    openSheet('entity.versionHistory', { entity: 'security_settings', rowUuid: 'current' });
  }

  function handleSubmit() {
    // TODO: Implement unified submit for password + OIDC
    console.log('Submitting security settings');
  }

  function handleDeleteAccount() {
    // TODO: Implement account deletion (oblio) logic
    console.log('Deleting account');
  }

  onMount(() => {
    void metadata.loadMetadata();
  });
</script>

<!-- FORM CONTENT -->
<div class="flex-1 overflow-auto">
  <form id="security-form" onsubmit={handleSubmit}>
    <div class="space-y-6">
      <h2 class="text-2xl font-semibold">{$t('shell.settings.security.title')}</h2>

      <!-- Change Password -->
      <div class="space-y-4 rounded-lg border p-4">
        <h3 class="text-lg font-medium">{$t('shell.settings.security.changePassword')}</h3>
        
        <div>
          <label for="currentPassword" class="text-sm font-medium leading-none">{$t('shell.settings.security.currentPassword')}</label>
          <Password.PasswordInput
            id="currentPassword"
            bind:value={currentPassword}
            placeholder={$t('shell.settings.security.currentPasswordPlaceholder')}
            class="mt-2"
          />
        </div>

        <div>
          <label for="newPassword" class="text-sm font-medium leading-none">{$t('shell.settings.security.newPassword')}</label>
          <Password.PasswordInput
            id="newPassword"
            bind:value={newPassword}
            placeholder={$t('shell.settings.security.newPasswordPlaceholder')}
            class="mt-2"
          />
        </div>

        <div>
          <label for="confirmPassword" class="text-sm font-medium leading-none">{$t('shell.settings.security.confirmPassword')}</label>
          <Password.PasswordInput
            id="confirmPassword"
            bind:value={confirmPassword}
            placeholder={$t('shell.settings.security.confirmPasswordPlaceholder')}
            class="mt-2"
          />
        </div>
      </div>

      <!-- OIDC Parameters -->
      <div class="space-y-4 rounded-lg border p-4">
        <h3 class="text-lg font-medium">{$t('shell.settings.security.oidcParams')}</h3>
        
        <div>
          <label for="oidcIssuer" class="text-sm font-medium leading-none">{$t('shell.settings.security.oidcIssuer')}</label>
          <Input
            id="oidcIssuer"
            type="url"
            bind:value={oidcIssuer}
            placeholder="https://your-idp.example.com"
            class="mt-2"
          />
        </div>

        <div>
          <label for="oidcClientId" class="text-sm font-medium leading-none">{$t('shell.settings.security.oidcClientId')}</label>
          <Input
            id="oidcClientId"
            type="text"
            bind:value={oidcClientId}
            placeholder="your-client-id"
            class="mt-2"
          />
        </div>

        <div>
          <label for="oidcClientSecret" class="text-sm font-medium leading-none">{$t('shell.settings.security.oidcClientSecret')}</label>
          <Password.PasswordInput
            id="oidcClientSecret"
            bind:value={oidcClientSecret}
            placeholder="your-client-secret"
            class="mt-2"
          />
        </div>
      </div>
    </div>
  </form>
</div>

<!-- COMBINED FOOTER BAR -->
<div class="bg-muted/50 shrink-0 border-t p-4">
  <div class="flex items-center justify-between gap-4">
    <!-- Left: Audit info (60%) -->
    <div class="flex-1">
      <div class="text-xs">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          {#if auditInfo.version && hasAudit}
            <Badge
              class="text-xs font-semibold border border-primary cursor-pointer hover:bg-primary/10"
              variant="outline"
              onclick={openVersionHistory}
            >
              v{auditInfo.version}
            </Badge>
          {:else if auditInfo.version}
            <Badge class="text-xs font-semibold border border-primary" variant="outline">
              v{auditInfo.version}
            </Badge>
          {/if}
          {#if auditInfo.uuid}
            <div class="flex items-center gap-x-2">
              <span class="text-primary">{$t('shell.settings.audit.id')}:</span>
              <span class="italic text-muted-foreground">{auditInfo.uuid}</span>
            </div>
          {/if}
          <div class="flex items-center gap-x-2">
            <span class="text-primary">{$t('shell.settings.audit.createdAt')}:</span>
            <span class="italic text-muted-foreground">{auditInfo.createdAt || '-'}</span>
          </div>
          <div class="flex items-center gap-x-2">
            <span class="text-primary">{$t('shell.settings.audit.createdBy')}:</span>
            <span class="italic text-muted-foreground">{auditInfo.createdByName || auditInfo.createdBy || '-'}</span>
          </div>
          <div class="flex items-center gap-x-2">
            <span class="text-primary">{$t('shell.settings.audit.updatedAt')}:</span>
            <span class="italic text-muted-foreground">{auditInfo.updatedAt || '-'}</span>
          </div>
          <div class="flex items-center gap-x-2">
            <span class="text-primary">{$t('shell.settings.audit.updatedBy')}:</span>
            <span class="italic text-muted-foreground">{auditInfo.updatedByName || auditInfo.updatedBy || '-'}</span>
          </div>
          <div class="flex items-center gap-x-2">
            <span class="text-primary">{$t('shell.settings.audit.lastSyncedAt')}:</span>
            <span class="italic text-muted-foreground">{auditInfo.lastSyncedAt || '-'}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: CTA (40%) -->
    <div class="shrink-0 flex items-center gap-2">
      {#if !showDeleteWarning}
        <Button variant="destructive" onclick={() => showDeleteWarning = true}>
          {$t('shell.settings.security.deleteAccountButton')}
        </Button>
      {:else}
        <Button variant="outline" onclick={() => showDeleteWarning = false}>
          {$t('common.cancel')}
        </Button>
        <Button variant="destructive" onclick={handleDeleteAccount}>
          {$t('shell.settings.security.confirmDeleteAccount')}
            </Button>
      {/if}
      <Button type="submit" form="security-form" disabled={!hasChanges}>
        {$t('common.save')}
      </Button>
    </div>
  </div>
</div>
