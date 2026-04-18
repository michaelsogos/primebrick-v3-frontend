<script lang="ts">
  import { browser } from '$app/environment';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { uiLang, setUiLang } from '$lib/i18n/store.svelte';
  import {
    orderLangEntriesByBrowser,
    type UiLang,
    uiLangTopBarTwoLetterSuffix
  } from '$lib/i18n/languages';
  import { ChevronDown } from 'lucide-svelte';

  const LANGS: Array<{ code: UiLang; label: string; flagCode: string }> = [
    { code: 'en-GB', label: 'British English', flagCode: 'gb' },
    { code: 'en-US', label: 'American English', flagCode: 'us' },
    { code: 'it-IT', label: 'Italiano', flagCode: 'it' },
    { code: 'fr-FR', label: 'Français', flagCode: 'fr' },
    { code: 'es-ES', label: 'Español', flagCode: 'es' },
    { code: 'de-DE', label: 'Deutsch', flagCode: 'de' },
    { code: 'pt-PT', label: 'Português', flagCode: 'pt' }
  ];

  $: sortedLangs = orderLangEntriesByBrowser(
    LANGS,
    browser && typeof navigator !== 'undefined' ? navigator.languages : null
  );

  $: current = LANGS.find((l) => l.code === $uiLang) ?? LANGS[0];
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        type="button"
        variant="ghost"
        class="h-9 max-w-[min(100%,14rem)] gap-2 px-2"
        title={$uiLang}
        aria-label={`Language: ${current.label}`}
      >
        <span class={`fi fi-${current.flagCode} shrink-0 rounded-sm`} aria-hidden="true"></span>
        <span class="w-6 shrink-0 text-center text-xs font-semibold">
          {uiLangTopBarTwoLetterSuffix(current.code)}
        </span>
        <ChevronDown class="size-4 shrink-0 opacity-70" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="min-w-52">
    {#each sortedLangs as lang (lang.code)}
      <DropdownMenu.Item
        onSelect={() => setUiLang(lang.code)}
        closeOnSelect={true}
        class="flex items-center gap-2"
      >
        <span class={`fi fi-${lang.flagCode} shrink-0 rounded-sm`} aria-hidden="true"></span>
        <span
          class="min-w-0 flex-1 truncate"
          class:font-semibold={lang.code === $uiLang}
        >
          {lang.label}
        </span>
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
