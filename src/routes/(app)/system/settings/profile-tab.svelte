<script lang="ts">
  import { z } from 'zod';
  import { superForm, defaults } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { t } from '$lib/i18n';
  import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { FormField, FormLabel, FormControl, FormFieldErrors } from '$lib/components/ui/form';
  import { cn } from '$lib/utils';
  import { avatarFallbackChromeClasses, hashSeedToIndex, avatarChromePaletteToHex, getContrastTextColor } from '$lib/avatar-chrome-palette';
  import * as ColorPicker from '$lib/components/ui/color-picker';
  import * as Popover from '$lib/components/ui/popover';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Paintbrush } from 'lucide-svelte';
  import { CopyButton } from '$lib/components/ui/copy-button';
  import { apiFetch } from '$lib/api';
  import { onMount } from 'svelte';
  import { userProfileStore } from '$lib/user-profile-store.svelte';

  // Props
  let { onHasChange }: { onHasChange: (hasChanges: boolean) => void } = $props();

  // Zod schema for profile form
  const profileSchema = z.object({
    idp_code: z.string().optional(),
    idp_org: z.string().optional(),
    idp_username: z.string().optional(),
    display_name: z.string().min(1, 'Display name is required'),
    email: z.string().email('Invalid email address'),
    avatar_color: z.string().min(1, 'Color is required'),
  });

  type ProfileForm = z.infer<typeof profileSchema>;

  // Superforms in SPA mode
  const superFormObj = superForm(
    defaults(zod4(profileSchema)),
    {
      SPA: true,
      validators: zod4(profileSchema),
      invalidateAll: false,
      resetForm: false,
      async onUpdate({ form: updateForm, cancel }) {
        if (!updateForm.valid) return;

        try {
          // Exclude immutable IDP fields from PATCH request
          const { idp_code, idp_org, idp_username, ...requestData } = updateForm.data;
          const response = await apiFetch('/api/v1/auth/me', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to update profile:', errorData);
            cancel();
            return;
          }

          const data = await response.json();
          if (data.success && data.profile) {
            console.log('Profile updated successfully');
            console.log('[profile-tab] Response data:', data.profile);
            console.log('[profile-tab] avatar_color from response:', data.profile.avatar_color);
            
            // Update form with response data
            $form.idp_code = data.profile.idp_code || $form.idp_code;
            $form.idp_org = data.profile.idp_org || $form.idp_org;
            $form.idp_username = data.profile.idp_username || $form.idp_username;
            $form.display_name = data.profile.display_name || $form.display_name;
            $form.email = data.profile.email || $form.email;
            $form.avatar_color = data.profile.avatar_color || $form.avatar_color;
            
            // Update store (automatically refreshes AppSidebar)
            userProfileStore.set({
              idp_code: data.profile.idp_code,
              idp_org: data.profile.idp_org,
              idp_username: data.profile.idp_username,
              displayName: data.profile.display_name,
              email: data.profile.email,
              avatar_color: data.profile.avatar_color,
              // Audit fields
              uuid: data.profile.uuid,
              created_at: data.profile.created_at,
              created_by: data.profile.created_by,
              created_by_name: data.profile.created_by_name,
              updated_at: data.profile.updated_at,
              updated_by: data.profile.updated_by,
              updated_by_name: data.profile.updated_by_name,
              version: data.profile.version
            });
          }
        } catch (error) {
          console.error('Failed to update profile:', error);
          cancel();
        }
      }
    }
  );

  const { form, errors, enhance, tainted, isTainted } = superFormObj;

  const userAvatarSeed = 'PB';
  const avatarChromeFallbackClass = $derived(avatarFallbackChromeClasses(userAvatarSeed));

  const hasChanges = $derived(isTainted($tainted));

  // Notify parent when hasChanges changes
  $effect(() => {
    onHasChange(hasChanges);
  });

  function loadProfile() {
    const profile = userProfileStore.current;
    if (!profile) return;

    $form.idp_code = profile.idp_code || '';
    $form.idp_org = profile.idp_org || '';
    $form.idp_username = profile.idp_username || '';
    $form.display_name = profile.displayName || '';
    $form.email = profile.email || '';

    // If avatar_color is null, use the hex value from the palette
    const paletteIndex = hashSeedToIndex(userAvatarSeed, 10);
    $form.avatar_color = profile.avatar_color || avatarChromePaletteToHex(paletteIndex);
  }

  onMount(async () => {
    // Load from cache immediately so form is populated
    loadProfile();

    // Then refresh from server in the background
    try {
      const response = await apiFetch('/api/v1/auth/me');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.profile) {
          // Update store with fresh data from server
          userProfileStore.set({
            idp_code: data.profile.idp_code,
            idp_org: data.profile.idp_org,
            idp_username: data.profile.idp_username,
            displayName: data.profile.display_name,
            email: data.profile.email,
            avatar_color: data.profile.avatar_color,
            // Audit fields
            uuid: data.profile.uuid,
            created_at: data.profile.created_at,
            created_by: data.profile.created_by,
            created_by_name: data.profile.created_by_name,
            updated_at: data.profile.updated_at,
            updated_by: data.profile.updated_by,
            updated_by_name: data.profile.updated_by_name,
            version: data.profile.version
          });
          // Reload form with fresh data
          loadProfile();
        }
      }
    } catch (error) {
      console.error('Failed to refresh profile:', error);
      // Form already loaded from cache, no action needed
    }
  });
</script>

<div class="space-y-6">
  <h2 class="text-2xl font-semibold">{$t('shell.settings.profile.title')}</h2>

  <!-- Top Section: 2 columns 50/50 -->
  <div class="grid grid-cols-2 gap-6">
    <!-- Column 1: Avatar + Color Picker -->
    <div class="space-y-4">
      <!-- Avatar with displayname and email -->
      <div class="flex items-center gap-4">
        <Avatar class="size-14 rounded-none avatar-hex">
          <AvatarFallback 
            class={cn(
              'rounded-none text-2xl font-semibold', 
              $form.avatar_color ? '' : avatarChromeFallbackClass
            )}
            style={$form.avatar_color 
              ? `background-color: ${$form.avatar_color}; color: ${getContrastTextColor($form.avatar_color)};` 
              : ''
            }
          >
            {userAvatarSeed}
          </AvatarFallback>
        </Avatar>
        <div>
          <p class="font-medium">{$form.display_name || $t('shell.settings.profile.displayNamePlaceholder')}</p>
          <p class="text-sm text-muted-foreground">{$form.email || $t('shell.settings.profile.emailPlaceholder')}</p>
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
                    <div class="w-5 h-5 rounded-full border shadow-sm" style="background-color: {$form.avatar_color};"></div>
                    <Paintbrush class="mr-2 h-4 w-4" />
                    {$form.avatar_color}
                  </div>
                </Button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content class="w-auto p-0">
              <div class="p-3">
                <ColorPicker.Root bind:value={$form.avatar_color} />
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
  <form use:enhance id="profile-form">
    <div class="grid grid-cols-2 gap-6">
      <!-- Column 1: Display Name + Email -->
      <div class="space-y-4">
        <FormField form={superFormObj} name="display_name">
          <FormControl>
            {#snippet children({ props })}
              <div class="space-y-2">
                <FormLabel for={props.id}>{$t('shell.settings.profile.displayName')}</FormLabel>
                <Input
                  type="text"
                  placeholder={$t('shell.settings.profile.displayNamePlaceholder')}
                  bind:value={$form.display_name}
                  autofocus
                  {...props}
                  class="mt-2"
                />
                <FormFieldErrors />
              </div>
            {/snippet}
          </FormControl>
        </FormField>

        <FormField form={superFormObj} name="email">
          <FormControl>
            {#snippet children({ props })}
              <div class="space-y-2">
                <FormLabel for={props.id}>{$t('shell.settings.profile.email')}</FormLabel>
                <Input
                  type="email"
                  placeholder={$t('shell.settings.profile.emailPlaceholder')}
                  bind:value={$form.email}
                  {...props}
                  class="mt-2"
                />
                <FormFieldErrors />
              </div>
            {/snippet}
          </FormControl>
        </FormField>
      </div>

      <!-- Column 2: idp_code, idp_org, idp_username (readonly) -->
      <div class="space-y-4">
        <FormField form={superFormObj} name="idp_code">
          <FormControl>
            {#snippet children({ props })}
              <div class="space-y-2">
                <FormLabel for={props.id}>{$t('shell.settings.profile.idpCode')}</FormLabel>
                <div class="relative">
                  <Input
                    type="text"
                    bind:value={$form.idp_code}
                    readonly
                    class="mt-2 bg-muted pr-10"
                    {...props}
                  />
                  {#if $form.idp_code}
                    <div class="absolute right-2 top-1/2 -translate-y-1/2">
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props: tooltipProps })}
                            <CopyButton
                              text={$form.idp_code || ''}
                              variant="ghost"
                              size="icon"
                              class="h-8 w-8 hover:bg-transparent"
                              animationDuration={2000}
                              {...tooltipProps}
                            />
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content>{$t('shell.settings.profile.copyIdpCode')}</Tooltip.Content>
                      </Tooltip.Root>
                    </div>
                  {/if}
                </div>
              </div>
            {/snippet}
          </FormControl>
        </FormField>

        <FormField form={superFormObj} name="idp_org">
          <FormControl>
            {#snippet children({ props })}
              <div class="space-y-2">
                <FormLabel for={props.id}>{$t('shell.settings.profile.idpOrg')}</FormLabel>
                <div class="relative">
                  <Input
                    type="text"
                    bind:value={$form.idp_org}
                    readonly
                    class="mt-2 bg-muted pr-10"
                    {...props}
                  />
                  {#if $form.idp_org}
                    <div class="absolute right-2 top-1/2 -translate-y-1/2">
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props: tooltipProps })}
                            <CopyButton
                              text={$form.idp_org || ''}
                              variant="ghost"
                              size="icon"
                              class="h-8 w-8 hover:bg-transparent"
                              animationDuration={2000}
                              {...tooltipProps}
                            />
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content>{$t('shell.settings.profile.copyIdpOrg')}</Tooltip.Content>
                      </Tooltip.Root>
                    </div>
                  {/if}
                </div>
              </div>
            {/snippet}
          </FormControl>
        </FormField>

        <FormField form={superFormObj} name="idp_username">
          <FormControl>
            {#snippet children({ props })}
              <div class="space-y-2">
                <FormLabel for={props.id}>{$t('shell.settings.profile.idpUsername')}</FormLabel>
                <div class="relative">
                  <Input
                    type="text"
                    bind:value={$form.idp_username}
                    readonly
                    class="mt-2 bg-muted pr-10"
                    {...props}
                  />
                  {#if $form.idp_username}
                    <div class="absolute right-2 top-1/2 -translate-y-1/2">
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props: tooltipProps })}
                            <CopyButton
                              text={$form.idp_username || ''}
                              variant="ghost"
                              size="icon"
                              class="h-8 w-8 hover:bg-transparent"
                              animationDuration={2000}
                              {...tooltipProps}
                            />
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content>{$t('shell.settings.profile.copyIdpUsername')}</Tooltip.Content>
                      </Tooltip.Root>
                    </div>
                  {/if}
                </div>
              </div>
            {/snippet}
          </FormControl>
        </FormField>
      </div>
    </div>
  </form>
</div>
