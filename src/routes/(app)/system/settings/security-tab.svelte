<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { ShieldAlert } from 'lucide-svelte';

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');

  let oidcIssuer = $state('');
  let oidcClientId = $state('');
  let oidcClientSecret = $state('');

  let showDeleteWarning = $state(false);

  function handlePasswordChange() {
    // TODO: Implement password change logic
    console.log('Changing password');
  }

  function handleDeleteAccount() {
    // TODO: Implement account deletion (oblio) logic
    console.log('Deleting account');
  }

  function handleOidcSave() {
    // TODO: Implement OIDC params save logic
    console.log('Saving OIDC params:', { oidcIssuer, oidcClientId, oidcClientSecret });
  }
</script>

<div class="space-y-6">
  <h2 class="text-2xl font-semibold">{$t('shell.settings.security.title')}</h2>

  <!-- Change Password -->
  <div class="space-y-4 rounded-lg border p-4">
    <h3 class="text-lg font-medium">{$t('shell.settings.security.changePassword')}</h3>
    
    <div>
      <label for="currentPassword" class="text-sm font-medium leading-none">{$t('shell.settings.security.currentPassword')}</label>
      <Input
        id="currentPassword"
        type="password"
        bind:value={currentPassword}
        placeholder={$t('shell.settings.security.currentPasswordPlaceholder')}
        class="mt-2"
      />
    </div>

    <div>
      <label for="newPassword" class="text-sm font-medium leading-none">{$t('shell.settings.security.newPassword')}</label>
      <Input
        id="newPassword"
        type="password"
        bind:value={newPassword}
        placeholder={$t('shell.settings.security.newPasswordPlaceholder')}
        class="mt-2"
      />
    </div>

    <div>
      <label for="confirmPassword" class="text-sm font-medium leading-none">{$t('shell.settings.security.confirmPassword')}</label>
      <Input
        id="confirmPassword"
        type="password"
        bind:value={confirmPassword}
        placeholder={$t('shell.settings.security.confirmPasswordPlaceholder')}
        class="mt-2"
      />
    </div>

    <Button onclick={handlePasswordChange}>{$t('shell.settings.security.changePasswordButton')}</Button>
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
      <Input
        id="oidcClientSecret"
        type="password"
        bind:value={oidcClientSecret}
        placeholder="your-client-secret"
        class="mt-2"
      />
    </div>

    <Button onclick={handleOidcSave}>{$t('shell.settings.security.oidcSaveButton')}</Button>
  </div>

  <!-- Delete Account -->
  <div class="space-y-4 rounded-lg border border-destructive/50 p-4">
    <h3 class="text-lg font-medium text-destructive">{$t('shell.settings.security.deleteAccount')}</h3>
    
    {#if !showDeleteWarning}
      <Button variant="destructive" onclick={() => showDeleteWarning = true}>
        {$t('shell.settings.security.deleteAccountButton')}
      </Button>
    {:else}
      <Alert variant="destructive">
        <ShieldAlert class="size-4" />
        <AlertDescription>
          {$t('shell.settings.security.deleteAccountWarning')}
        </AlertDescription>
      </Alert>
      <div class="flex gap-2">
        <Button variant="outline" onclick={() => showDeleteWarning = false}>
          {$t('common.cancel')}
        </Button>
        <Button variant="destructive" onclick={handleDeleteAccount}>
          {$t('shell.settings.security.confirmDeleteAccount')}
        </Button>
      </div>
    {/if}
  </div>
</div>
