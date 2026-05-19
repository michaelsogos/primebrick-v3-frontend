<script lang="ts">
  import { t } from '$lib/i18n';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { cn } from '$lib/utils';
  import { avatarFallbackChromeClasses } from '$lib/avatar-chrome-palette';

  let displayName = $state('');
  let email = $state('');
  let avatarColor = $state('blue');

  const avatarColors = [
    { id: 'blue', class: 'bg-blue-500' },
    { id: 'green', class: 'bg-green-500' },
    { id: 'red', class: 'bg-red-500' },
    { id: 'purple', class: 'bg-purple-500' },
    { id: 'orange', class: 'bg-orange-500' },
    { id: 'pink', class: 'bg-pink-500' }
  ];

  const userAvatarSeed = 'PB';
  const avatarChromeFallbackClass = $derived(avatarFallbackChromeClasses(userAvatarSeed));

  function handleSave() {
    // TODO: Implement save logic
    console.log('Saving profile:', { displayName, email, avatarColor });
  }
</script>

<div class="space-y-6">
  <h2 class="text-2xl font-semibold">{$t('shell.settings.profile.title')}</h2>

  <div class="space-y-4">
    <!-- Avatar Color Picker -->
    <div>
      <label class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {$t('shell.settings.profile.avatarColor')}
      </label>
      <div class="mt-2 flex gap-2">
        {#each avatarColors as color (color.id)}
          <button
            type="button"
            class={cn(
              'size-10 rounded-full transition-all hover:scale-110',
              color.class,
              avatarColor === color.id ? 'ring-2 ring-offset-2 ring-primary' : 'opacity-70'
            )}
            onclick={() => avatarColor = color.id}
            aria-label={$t('shell.settings.profile.selectColor', { color: color.id })}
          ></button>
        {/each}
      </div>
    </div>

    <!-- Avatar Preview -->
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

    <!-- Display Name -->
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

    <!-- Email -->
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

    <!-- Save Button -->
    <Button onclick={handleSave}>{$t('common.save')}</Button>
  </div>
</div>
