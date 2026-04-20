<script lang="ts">
  import { browser } from '$app/environment';
  import { tick, onMount } from 'svelte';
  import { Command } from 'bits-ui';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import CalculatorIcon from '@lucide/svelte/icons/calculator';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import CreditCardIcon from '@lucide/svelte/icons/credit-card';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import SmileIcon from '@lucide/svelte/icons/smile';
  import UserIcon from '@lucide/svelte/icons/user';
  import CommandKeyGlyph from '@lucide/svelte/icons/command';
  import { Kbd } from '$lib/components/ui/kbd';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const listDomId = 'pb-command-palette-list';

  let rootEl = $state<HTMLDivElement | null>(null);
  let inputRef = $state<HTMLInputElement | null>(null);
  let listRef = $state<HTMLElement | null>(null);

  /** Subpixel / border-box rounding often makes scrollHeight > clientHeight by 1–2px with overflow-y-auto → useless scrollbar. */
  const LIST_SCROLL_TOLERANCE_PX = 2;

  function syncCommandListOverflow(el: HTMLElement) {
    const needScroll = el.scrollHeight > el.clientHeight + LIST_SCROLL_TOLERANCE_PX;
    el.style.overflowY = needScroll ? 'auto' : 'hidden';
  }

  function isAppleOs(): boolean {
    if (!browser) return false;
    return /Mac|iPhone|iPad/i.test(navigator.userAgent);
  }

  function modShortcut(key: string): string {
    return `${isAppleOs() ? '⌘' : 'Ctrl+'}${key}`;
  }

  function close() {
    open = false;
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open = !open;
      return;
    }

    if (e.altKey && (e.key === '\\' || e.code === 'Backslash')) {
      const el = e.target;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      open = !open;
    }
  }

  $effect(() => {
    if (open && inputRef) {
      void tick().then(() => inputRef?.focus());
    }
  });

  $effect(() => {
    if (!browser || !listRef) return;

    if (!open) {
      listRef.style.removeProperty('overflow-y');
      return;
    }

    const el = listRef;
    const run = () => {
      requestAnimationFrame(() => {
        if (!el.isConnected) return;
        syncCommandListOverflow(el);
      });
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => {
      ro.disconnect();
      el.style.removeProperty('overflow-y');
    };
  });

  onMount(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (!open) return;
      const t = e.target;
      if (t instanceof Node && rootEl?.contains(t)) return;
      close();
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  });
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<div class="relative w-full max-w-xs sm:max-w-sm" bind:this={rootEl}>
  <Command.Root
    class="w-full"
    label={$t('shell.commandPalette.title')}
  >
    <div class="relative">
      <!-- Real search field: always visible, never covered by the dropdown -->
      <!-- Chrome matches `$lib/components/ui/input` (wrapper carries border/bg/hover/focus; inner `Command.Input` is borderless). -->
      <div
        class={cn(
          'relative flex h-8 w-full items-center rounded-md border shadow-xs ring-offset-background transition-colors',
          open
            ? 'z-10 rounded-b-none border-border border-b-transparent bg-popover shadow-md'
            : 'border-input bg-background dark:bg-input/30 hover:border-ring/40 hover:bg-sky-50/45 dark:hover:border-ring/35 dark:hover:bg-input/38 focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]'
        )}
      >
        <span
          class="pointer-events-none absolute left-2 top-1/2 z-[1] -translate-y-1/2 rounded-sm bg-background/70 px-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          \
        </span>
        {#if browser}
          <div
            class="pointer-events-none absolute right-2 top-1/2 z-[1] flex -translate-y-1/2 items-center gap-0.5"
            aria-hidden="true"
          >
            {#if isAppleOs()}
              <Kbd size="icon" title="⌘K">
                <CommandKeyGlyph class="size-3.5" strokeWidth={2} />
              </Kbd>
              <Kbd size="key">K</Kbd>
            {:else}
              <Kbd size="modifier">Ctrl</Kbd>
              <Kbd size="key">K</Kbd>
            {/if}
          </div>
        {/if}
        <Command.Input
          bind:ref={inputRef}
          id="pb-command-palette-input"
          class={cn(
            'h-full min-h-0 w-full border-0 bg-transparent pl-8 pr-3 text-sm text-foreground outline-none',
            browser && 'pr-[5.25rem]',
            'placeholder:text-muted-foreground',
            'focus-visible:ring-0 focus-visible:ring-offset-0'
          )}
          placeholder={$t('shell.search.placeholder')}
          aria-expanded={open}
          aria-controls={open ? listDomId : undefined}
          aria-autocomplete="list"
          oninput={() => {
            open = true;
          }}
          onpointerdown={() => {
            open = true;
          }}
        />
      </div>

      <!-- Detached panel: overlays page below the top bar; input stays uncovered -->
      <div
        class={cn(
          'pointer-events-none absolute left-0 right-0 top-full z-[130] -mt-px pt-0',
          open && 'pointer-events-auto'
        )}
        style="perspective: 1100px; perspective-origin: 50% 0%;"
        aria-hidden={!open}
      >
        <div
          id={listDomId}
          class={cn('pb-cube-panel border border-t-0 border-border bg-popover text-popover-foreground shadow-xl')}
          data-state={open ? 'open' : 'closed'}
        >
          <Command.List
            bind:ref={listRef}
            class="max-h-[min(50vh,18rem)] overflow-x-hidden overflow-y-hidden p-2"
          >
            <Command.Empty class="py-6 text-center text-sm text-muted-foreground">
              {$t('shell.commandPalette.empty')}
            </Command.Empty>

            <Command.Group value="suggestions" class="overflow-hidden p-1 text-foreground">
              <Command.GroupHeading class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {$t('shell.commandPalette.groupSuggestions')}
              </Command.GroupHeading>
              <Command.GroupItems>
                <Command.Item
                  value="calendar"
                  class="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  <CalendarIcon />
                  <span>{$t('shell.commandPalette.itemCalendar')}</span>
                </Command.Item>
                <Command.Item
                  value="emoji"
                  class="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  <SmileIcon />
                  <span>{$t('shell.commandPalette.itemSearchEmoji')}</span>
                </Command.Item>
                <Command.Item
                  value="calculator"
                  disabled
                  class="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  <CalculatorIcon />
                  <span>{$t('shell.commandPalette.itemCalculator')}</span>
                </Command.Item>
              </Command.GroupItems>
            </Command.Group>

            <Command.Separator class="-mx-1 my-1 h-px bg-border" />

            <Command.Group value="settings" class="overflow-hidden p-1 text-foreground">
              <Command.GroupHeading class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {$t('shell.commandPalette.groupSettings')}
              </Command.GroupHeading>
              <Command.GroupItems>
                <Command.Item
                  value="profile"
                  class="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  <UserIcon />
                  <span>{$t('shell.commandPalette.itemProfile')}</span>
                  <span class="ms-auto text-xs text-muted-foreground">{modShortcut('P')}</span>
                </Command.Item>
                <Command.Item
                  value="billing"
                  class="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  <CreditCardIcon />
                  <span>{$t('shell.commandPalette.itemBilling')}</span>
                  <span class="ms-auto text-xs text-muted-foreground">{modShortcut('B')}</span>
                </Command.Item>
                <Command.Item
                  value="app-settings"
                  class="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  <SettingsIcon />
                  <span>{$t('shell.commandPalette.itemSettings')}</span>
                  <span class="ms-auto text-xs text-muted-foreground">{modShortcut('S')}</span>
                </Command.Item>
              </Command.GroupItems>
            </Command.Group>
          </Command.List>
        </div>
      </div>
    </div>
  </Command.Root>
</div>

<style>
  /* Vertical “card flip” — list hinges from the top like a cube face */
  .pb-cube-panel {
    transform-origin: top center;
    border-radius: 0 0 calc(var(--radius) - 2px) calc(var(--radius) - 2px);
    transform: rotateX(-86deg) translate3d(0, -6px, 0);
    opacity: 0;
    filter: blur(0.5px);
    transition:
      transform 420ms cubic-bezier(0.22, 1, 0.32, 1),
      opacity 260ms ease,
      filter 260ms ease;
    will-change: transform, opacity;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }

  .pb-cube-panel[data-state='open'] {
    transform: rotateX(0deg) translate3d(0, 0, 0);
    opacity: 1;
    filter: blur(0);
  }

  .pb-cube-panel[data-state='closed'] {
    pointer-events: none;
  }
</style>
