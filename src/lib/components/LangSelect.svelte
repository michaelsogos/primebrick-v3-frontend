<script lang="ts">
  import { browser } from '$app/environment';
  import { Button } from '@primebrick/ui';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { dropdownMenuItemWithSelectedClass } from '$lib/components/ui/dropdown-menu/dropdown-menu-item-selected';
  import { uiLang, setUiLang } from '$lib/i18n/store.svelte';
  import {
    orderLangEntriesByBrowser,
    UI_LANG_META,
    UI_LANGS,
    uiLangTopBarTwoLetterSuffix
  } from '$lib/i18n/languages';
  import { ChevronDown } from '@primebrick/ui/vendor/lucide';

  const LANGS = UI_LANGS.map((code) => ({
    code,
    label: UI_LANG_META[code].label,
    flagCode: UI_LANG_META[code].flag
  }));

  const sortedLangs = $derived(
    orderLangEntriesByBrowser(
      LANGS,
      browser && typeof navigator !== 'undefined' ? navigator.languages : null
    )
  );

  const current = $derived(LANGS.find((l) => l.code === $uiLang) ?? LANGS[0]);
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
        class={dropdownMenuItemWithSelectedClass('flex items-center gap-2', lang.code === $uiLang)}
      >
        <span class={`fi fi-${lang.flagCode} shrink-0 rounded-sm`} aria-hidden="true"></span>
        <span class="min-w-0 flex-1 truncate">
          {lang.label}
        </span>
      </DropdownMenu.Item>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
