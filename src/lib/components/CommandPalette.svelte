<script lang="ts">
  import { browser } from '$app/environment';
  import { Dialog, Command } from 'bits-ui';
  import { cn } from '$lib/utils';
  import { t } from '$lib/i18n';
  import CalculatorIcon from '@lucide/svelte/icons/calculator';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import CreditCardIcon from '@lucide/svelte/icons/credit-card';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import SmileIcon from '@lucide/svelte/icons/smile';
  import UserIcon from '@lucide/svelte/icons/user';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  function isAppleOs(): boolean {
    if (!browser) return false;
    return /Mac|iPhone|iPad/i.test(navigator.userAgent);
  }

  /** Ctrl+K / ⌘K style shortcut label for sub-items (P, B, S, …). */
  function modShortcut(key: string): string {
    return `${isAppleOs() ? '⌘' : 'Ctrl+'}${key}`;
  }

  function onWindowKeydown(e: KeyboardEvent) {
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
</script>

<svelte:window onkeydown={onWindowKeydown} />

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-[200] bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class={cn(
        'fixed left-1/2 top-[min(30%,10rem)] z-[201] w-[min(100vw-2rem,28rem)] max-h-[min(70vh,24rem)] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-background p-0 shadow-lg outline-none',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95'
      )}
    >
      <Dialog.Title class="sr-only">{$t('shell.commandPalette.title')}</Dialog.Title>
      <Dialog.Description class="sr-only">{$t('shell.commandPalette.description')}</Dialog.Description>

      <Command.Root
        class="flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground"
        label={$t('shell.commandPalette.title')}
      >
        <Command.Input
          class="flex h-11 w-full border-b border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          placeholder={$t('shell.commandPalette.inputPlaceholder')}
        />
        <Command.List class="max-h-[min(50vh,18rem)] overflow-y-auto overflow-x-hidden p-2">
          <Command.Empty class="py-6 text-center text-sm text-muted-foreground">
            {$t('shell.commandPalette.empty')}
          </Command.Empty>

          <Command.Group value="suggestions" class="overflow-hidden p-1 text-foreground">
            <Command.GroupHeading
              class="px-2 py-1.5 text-xs font-medium text-muted-foreground"
            >
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
            <Command.GroupHeading
              class="px-2 py-1.5 text-xs font-medium text-muted-foreground"
            >
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
      </Command.Root>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
