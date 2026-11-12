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
   * Stack choreography — a single driver, zero per-pane animations.
   *
   * The sheet is right-anchored, so a `max-width` transition grows the
   * container toward the LEFT. The record pane sits at the container's
   * left edge and simply rides it — it never animates, it just moves in
   * tandem with the widening space. The new pane fills the right slot,
   * which emerges from the screen's right edge as the container widens —
   * visually identical to the standard `slide-in-from-right` (same
   * duration-500 / ease-in-out as the normal sheet open).
   *
   * POP is the mirror: keep both panes mounted while the container
   * shrinks for 300ms (standard close duration) — the record rides the
   * left edge back into the solo slot, the top pane's slot carries it
   * off-screen to the right (a free slide-out). Only then does the state
   * swap: the record becomes the primary pane at the exact screen
   * position the shrink just delivered it to.
   */
  let popping = $state(false);

  /** LIFO stack discipline: every close request unwinds the TOP pane
   *  first. While stacked the close plays the shrink animation for the
   *  standard close duration, then mutates — the record lands exactly
   *  where the solo pane should be. */
  function routeDialogClose() {
    if (popping) return;
    if (sheetState.secondary && !sheetState.expanded) {
      popping = true;
      const slot = sheetState.secondary;
      setTimeout(() => {
        popping = false;
        // A re-stack during the pop abandons the deferred close.
        if (sheetState.secondary === slot) closeSheet();
      }, 300);
      return;
    }
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
  <Sheet.Content showClose={false} side={sheetState.side} class={cn(sheetState.contentClass, sheetState.secondary && !popping && "sm:max-w-3xl", sheetState.expanded && "w-1/2 sm:max-w-none", "transition-[max-width] ease-in-out", popping ? "duration-300" : "duration-500", "shadow-[4px_0_24px_-4px_rgba(0,0,0,0.3)]")} modal={sheetState.modal} onEscapeKeydown={(e) => {
    // Stacked: Escape pops ONE pane — veto the internal close so the
    // container shrink plays out first.
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
        <!-- No animation of its own: the pane rides the container's left
             edge as it widens/shrinks. -->
        <div
          class="h-full w-96 shrink-0 border-r border-border"
          data-testid="sheet-secondary-pane"
        >
          {#if SecondaryPanel}
            <SecondaryPanel {...secondaryProps} modal={sheetState.modal} />
          {:else if secondaryRemoteDecl}
            <RemoteSheetMount decl={secondaryRemoteDecl} props={secondaryProps} />
          {/if}
        </div>
      {/if}
      <div class={cn("relative h-full", sheetState.secondary && !sheetState.expanded ? "w-96 shrink-0" : "min-w-0 flex-1")} data-testid="sheet-primary-pane">
        {#key sheetState.panelId}
          <div class="h-full">
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

