<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { uiLang, setUiLang } from '$lib/i18n/store.svelte';
  import type { UiLang } from '$lib/i18n/languages';
  import { Check, ChevronDown } from 'lucide-svelte';

  const LANGS: Array<{ code: UiLang; label: string; flagCode: string }> = [
    { code: 'en-GB', label: 'English', flagCode: 'gb' },
    { code: 'it-IT', label: 'Italiano', flagCode: 'it' },
    { code: 'fr-FR', label: 'Français', flagCode: 'fr' },
    { code: 'es-ES', label: 'Español', flagCode: 'es' },
    { code: 'de-DE', label: 'Deutsch', flagCode: 'de' },
    { code: 'pt-PT', label: 'Português', flagCode: 'pt' }
  ];

  $: current = LANGS.find((l) => l.code === $uiLang) ?? LANGS[0];
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} type="button" variant="ghost" class="h-9 gap-2 px-2">
        <span class={`fi fi-${current.flagCode} rounded-sm`} aria-hidden="true"></span>
        <span class="text-xs font-semibold uppercase tracking-wide">{$uiLang}</span>
        <ChevronDown class="size-4 opacity-70" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="min-w-44">
    {#each LANGS as lang (lang.code)}
      <DropdownMenu.Item
        onSelect={() => setUiLang(lang.code)}
        closeOnSelect={true}
        class="flex items-center justify-between gap-2"
      >
        <span class="flex items-center gap-2">
          <span class={`fi fi-${lang.flagCode} rounded-sm`} aria-hidden="true"></span>
          <span>{lang.label}</span>
        </span>
        {#if lang.code === $uiLang}
          <Check class="size-4 opacity-70" />
        {/if}
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>

