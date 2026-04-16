<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n';
  import { Moon, Sun } from 'lucide-svelte';

  const STORAGE_KEY = 'pb.theme';

  let mounted = false;
  let theme: 'light' | 'dark' = 'light';

  function apply(next: 'light' | 'dark') {
    theme = next;
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem(STORAGE_KEY, next);
  }

  onMount(() => {
    mounted = true;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      apply(saved);
      return;
    }
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
    apply(prefersDark ? 'dark' : 'light');
  });
</script>

<Button
  type="button"
  variant="ghost"
  size="icon"
  class="relative"
  aria-label={mounted && theme === 'dark' ? $t('shell.theme.light') : $t('shell.theme.dark')}
  onclick={() => apply(theme === 'dark' ? 'light' : 'dark')}
>
  {#if mounted && theme === 'dark'}
    <Sun class="size-4" />
  {:else}
    <Moon class="size-4" />
  {/if}
</Button>

