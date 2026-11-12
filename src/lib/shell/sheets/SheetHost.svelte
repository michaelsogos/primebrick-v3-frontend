<script lang="ts">
  import { Sheet } from "@primebrick/ui";
  import {
    closeSheet,
    sheetState,
    shouldSuppressSheetDialogClose,
    type SheetPanelId
  } from '$lib/shell/sheets/sheet-manager.svelte';
  import { resolveRemoteSheetDecl } from '$lib/shell/modules-shell.svelte';
  import RemoteSheetMount from '$lib/components/remote-page/RemoteSheetMount.svelte';
  import { cn } from '$lib/utils';
  import type { Component } from 'svelte';

  import ErrorsPanel from '$lib/shell/sheets/panels/ErrorsPanel.svelte';
  import VersionsPanel from '$lib/shell/sheets/panels/VersionsPanel.svelte';
  import AiChatPanel from '$lib/shell/sheets/panels/AiChatPanel.svelte';
  import SearchInPanel from '$lib/entity-list/sheets/panels/SearchInPanel.svelte';
  import ColumnsPanel from '$lib/entity-list/sheets/panels/ColumnsPanel.svelte';
  import FiltersPanel from '$lib/entity-list/sheets/panels/FiltersPanel.svelte';
  import DatetimeIanaPanel from '$lib/entity-list/sheets/panels/DatetimeIanaPanel.svelte';
  import VersionHistoryPanel from '$lib/entity-list/sheets/panels/VersionHistoryPanel.svelte';
  import JsonViewerPanel from '$lib/entity-list/sheets/panels/JsonViewerPanel.svelte';
  import EntityRecordSheet from '$lib/entity-list/sheets/panels/EntityRecordSheet.svelte';
  import CurrencySelectPanel from '$lib/shell/sheets/panels/CurrencySelectPanel.svelte';
  import ProtocolSelectPanel from '$lib/shell/sheets/panels/ProtocolSelectPanel.svelte';
  import PhonePrefixSelectPanel from '$lib/shell/sheets/panels/PhonePrefixSelectPanel.svelte';
  import RegexFlagsPanel from '$lib/components/ui/smart-regex-input/regex-flags-panel.svelte';
  import RegexAiChatPanel from '$lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte';
  import JsonConfigAiChatPanel from '$lib/components/ui/smart-json-config/json-config-ai-chat-panel.svelte';
  import JsonAiChatPanel from '$lib/components/ui/smart-json-assistant/json-ai-chat-panel.svelte';
  import GuideAiChatPanel from '$lib/components/ui/smart-guide/guide-ai-chat-panel.svelte';
  import BadgeValuePanel from '$lib/shell/sheets/panels/BadgeValuePanel.svelte';
  import DocsPanel from '$lib/shell/sheets/panels/DocsPanel.svelte';
  import TranslationEditorPanel from '$lib/shell/sheets/panels/TranslationEditorPanel.svelte';
  import { cubicOut } from 'svelte/easing';

  /**
   * Heterogeneous panel registry — each panel declares its own props contract,
   * so a static `Component<Props>` union cannot type the dispatch. The
   * SheetPanelId key is the dispatch contract; `any` props are the runtime
   * spread boundary (`sheetState.props`).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registry: Record<SheetPanelId, Component<any>> = {
    'shell.errors': ErrorsPanel,
    'shell.versions': VersionsPanel,
    'shell.aiChat': AiChatPanel,
    'entity.searchIn': SearchInPanel,
    'entity.columns': ColumnsPanel,
    'entity.filters': FiltersPanel,
    'entity.datetimeIana': DatetimeIanaPanel,
    'entity.versionHistory': VersionHistoryPanel,
    'entity.jsonViewer': JsonViewerPanel,
    'entity.record': EntityRecordSheet,
    'config.currencySelect': CurrencySelectPanel,
    'config.protocolSelect': ProtocolSelectPanel,
    'config.phonePrefixSelect': PhonePrefixSelectPanel,
    'config.regexFlags': RegexFlagsPanel,
    'config.regexAiChat': RegexAiChatPanel,
    'config.jsonAiChat': JsonConfigAiChatPanel,
    'json.aiChat': JsonAiChatPanel,
    'shell.aiGuide': GuideAiChatPanel,
    'config.badgeValueEdit': BadgeValuePanel,
    'shell.docs': DocsPanel,
    'i18n.translationEditor': TranslationEditorPanel
  };

  const panelId = $derived(sheetState.panelId);
  /**
   * Dispatch: host registry first, then a remote declaration — the key
   * passed `openSheet` validation so exactly one of them resolves. Remote
   * sheets mount through the same loader/ctx discipline as remote pages.
   */
  const Panel = $derived(
    panelId && panelId in registry ? registry[panelId as SheetPanelId] : null
  );
  const remoteDecl = $derived(Panel ? null : panelId ? resolveRemoteSheetDecl(panelId) : null);
  const panelProps = $derived((sheetState.props ?? {}) as Record<string, unknown>);

  /** Two-sheet stack — the left (secondary) pane resolves through the
   *  same host-registry → remote-decl dispatch as the right one. */
  const secondaryId = $derived(sheetState.secondary?.panelId ?? null);
  const SecondaryPanel = $derived(
    secondaryId && secondaryId in registry ? registry[secondaryId as SheetPanelId] : null
  );
  const secondaryRemoteDecl = $derived(
    SecondaryPanel ? null : secondaryId ? resolveRemoteSheetDecl(secondaryId) : null
  );
  const secondaryProps = $derived((sheetState.secondary?.props ?? {}) as Record<string, unknown>);

  /**
   * Stack slide — pure translateX choreography, never a resize: panes are
   * fixed-width halves of the (instantly widened) container, and only the
   * transform animates.
   *
   *   PUSH  (secondary mounts): the record pane is born at +384px — its old
   *         position — and slides LEFT into the left half, while the new
   *         panel slides in from +384px (offscreen right). Both move the
   *         same direction = "history pushes the record left".
   *   POP   (secondary unmounts): instant — the primary swap carries the
   *         motion: history slides out to +384px (offscreen right) while
   *         the record slides back in from -384px (the left slot it came
   *         from). Both move right = reverse push.
   *
   *   `dir:0` skips the animation (the outgoing record on push — the
   *   secondary ghost already covers that move).
   */
  const PANE_W = 384;
  function paneSlide(
    _node: HTMLElement,
    { dir, duration = 300, abs = false }: { dir: number; duration?: number; abs?: boolean }
  ) {
    return {
      duration: dir === 0 ? 0 : duration,
      easing: cubicOut,
      css: (t: number) =>
        `${abs ? 'position:absolute;inset:0;' : ''}transform:translateX(${(1 - t) * dir}px);`
    };
  }

  /** LIFO stack discipline: every close request pops the TOP pane first —
   *  the left (secondary) pane can never outlive the right one. A close
   *  affordance rendered inside the left pane also unwinds the top sheet;
   *  the record only becomes closable once it is alone on the stack. */
  function routeDialogClose() {
    closeSheet();
  }

  /**
   * Controlled dialog: `bind:open` keeps `sheetState.open` in sync with
   * internal closes (Escape/X/outside all funnel through here).
   * While stacked, a close request only pops ONE pane — the binding
   * already wrote open=false, so re-assert true or the content would
   * unmount even though the sheet must survive.
   * Ignore a spurious `false` right after `openSheet()` (see `shouldSuppressSheetDialogClose`).
   */
  function onSheetOpenChange(next: boolean) {
    if (next) {
      sheetState.open = true;
      return;
    }
    if (shouldSuppressSheetDialogClose()) {
      sheetState.open = true;
      return;
    }
    const wasStacked = sheetState.secondary !== null;
    routeDialogClose();
    if (wasStacked) sheetState.open = true;
  }
</script>

<Sheet.Root bind:open={sheetState.open} onOpenChange={onSheetOpenChange}>
  <Sheet.Content showClose={false} side={sheetState.side} class={cn(sheetState.contentClass, sheetState.secondary && "sm:max-w-3xl", sheetState.expanded && "w-1/2 sm:max-w-none", "shadow-[4px_0_24px_-4px_rgba(0,0,0,0.3)]")} modal={sheetState.modal} onEscapeKeydown={(e) => {
    // Stacked: Escape pops ONE pane — veto the internal close so the
    // left pane slides back in place (pushPane outro).
    if (!sheetState.secondary) return;
    e.preventDefault();
    routeDialogClose();
  }} onInteractOutside={(e) => {
    // Stacked: an outside click also pops ONE pane instead of closing
    // both panes together.
    if (!sheetState.secondary) return;
    e.preventDefault();
    routeDialogClose();
  }}>
    <div class="flex h-full min-h-0 overflow-hidden">
      {#if sheetState.secondary && !sheetState.expanded}
        <div
          in:paneSlide={{ dir: PANE_W }}
          class="h-full w-1/2 min-w-0 shrink-0 border-r border-border"
          data-testid="sheet-secondary-pane"
        >
          {#if SecondaryPanel}
            <SecondaryPanel {...secondaryProps} modal={sheetState.modal} />
          {:else if secondaryRemoteDecl}
            <RemoteSheetMount decl={secondaryRemoteDecl} props={secondaryProps} />
          {/if}
        </div>
      {/if}
      <div class="relative h-full min-w-0 flex-1" data-testid="sheet-primary-pane">
        {#key sheetState.panelId}
          <div
            in:paneSlide={{ dir: sheetState.stackAnim === 'push' ? PANE_W : sheetState.stackAnim === 'pop' ? -PANE_W : 0, abs: true }}
            out:paneSlide={{ dir: sheetState.stackAnim === 'pop' ? PANE_W : 0, abs: true }}
            class="h-full"
          >
            {#if Panel}
              <Panel {...panelProps} modal={sheetState.modal} />
            {:else if remoteDecl}
              <RemoteSheetMount decl={remoteDecl} props={panelProps} />
            {/if}
          </div>
        {/key}
      </div>
    </div>
  </Sheet.Content>
</Sheet.Root>

