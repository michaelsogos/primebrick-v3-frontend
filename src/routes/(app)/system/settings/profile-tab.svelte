<script lang="ts">
  import { t } from '$lib/i18n';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { cn } from '$lib/utils';
  import { avatarFallbackChromeClasses } from '$lib/avatar-chrome-palette';
  import * as ColorPicker from '$lib/components/ui/color-picker';
  import * as Popover from '$lib/components/ui/popover';
  import { Paintbrush } from 'lucide-svelte';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';

  let displayName = $state('');
  let email = $state('');
  let idpCode = $state('');
  let popoverColor = $state('#3b82f6');

  const userAvatarSeed = 'PB';
  const avatarChromeFallbackClass = $derived(avatarFallbackChromeClasses(userAvatarSeed));

  async function loadProfile() {
    try {
      const res = await apiFetch('/api/v1/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.profile) {
          displayName = data.profile.displayName || '';
          email = data.profile.email || '';
          idpCode = data.profile.idpCode || '';
        }
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  }

  onMount(() => {
    loadProfile();
  });

  function handleSave() {
    // TODO: Implement save logic
    console.log('Saving profile:', { displayName, email, popoverColor });
  }
</script>

<div class="space-y-6">
  <h2 class="text-2xl font-semibold">{$t('shell.settings.profile.title')}</h2>

  <!-- Top Section: 2 columns 50/50 -->
  <div class="grid grid-cols-2 gap-6">
    <!-- Column 1: Avatar + Color Picker -->
    <div class="space-y-4">
      <!-- Avatar with displayname and email -->
      <div class="flex items-center gap-4">
        <Avatar class="size-20 rounded-none avatar-hex">
          <AvatarFallback class={cn('rounded-none text-2xl font-semibold', avatarChromeFallbackClass)}>
            {userAvatarSeed}
          </AvatarFallback>
        </Avatar>
        <div>
          <p class="font-medium">{displayName || $t('shell.settings.profile.displayNamePlaceholder')}</p>
          <p class="text-sm text-muted-foreground">{email || $t('shell.settings.profile.emailPlaceholder')}</p>
        </div>
      </div>

      <!-- Color Picker -->
      <div>
        <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {$t('shell.settings.profile.avatarColor')}
        </label>
        <div class="mt-2">
          <Popover.Root>
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="outline">
                  <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-full border shadow-sm" style="background-color: {popoverColor};"></div>
                    <Paintbrush class="mr-2 h-4 w-4" />
                    {popoverColor}
                  </div>
                </Button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content class="w-auto p-0">
              <div class="p-3">
                <ColorPicker.Root bind:value={popoverColor} />
              </div>
            </Popover.Content>
          </Popover.Root>
        </div>
      </div>
    </div>

    <!-- Column 2: Empty -->
    <div></div>
  </div>

  <!-- Form Fields Section: 2 columns 50/50 -->
  <div class="grid grid-cols-2 gap-6">
    <!-- Column 1: Display Name + Email -->
    <div class="space-y-4">
      <div>
        <label for="displayName" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {$t('shell.settings.profile.displayName')}
        </label>
        <Input
          id="displayName"
          type="text"
          bind:value={displayName}
          placeholder={$t('shell.settings.profile.displayNamePlaceholder')}
          class="mt-2"
        />
      </div>

      <div>
        <label for="email" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {$t('shell.settings.profile.email')}
        </label>
        <Input
          id="email"
          type="email"
          bind:value={email}
          placeholder={$t('shell.settings.profile.emailPlaceholder')}
          class="mt-2"
        />
      </div>
    </div>

    <!-- Column 2: idp_code -->
    <div class="space-y-4">
      <div>
        <label for="idpCode" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          IDP Code
        </label>
        <Input
          id="idpCode"
          type="text"
          bind:value={idpCode}
          readonly
          class="mt-2 bg-muted"
        />
      </div>
    </div>
  </div>
</div>
