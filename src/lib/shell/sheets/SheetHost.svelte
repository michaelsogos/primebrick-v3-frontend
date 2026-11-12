<script lang="ts">
  import { Sheet } from "@primebrick/ui";
  import {
    closeSecondarySheet,
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

  /** Which pane the last pointer interaction happened in — set on
   *  pointerdown capture (fires before the pane's Sheet.Close click and
   *  before the dialog close request), consumed by onSheetOpenChange.
   *  It routes the close to the interacted pane instead of always
   *  popping the right one: X in the left pane closes the left pane. */
  let closeTargetSecondary = $state(false);

  /**
   * Controlled dialog: keep `open` in sync with `sheetState.open`.
   * Ignore a spurious `false` right after `openSheet()` (see `shouldSuppressSheetDialogClose`).
   */
  function onSheetOpenChange(next: boolean) {
    if (next) {
      sheetState.open = true;
      return;
    }
    if (shouldSuppressSheetDialogClose()) return;
    if (sheetState.secondary && closeTargetSecondary) {
      closeTargetSecondary = false;
      closeSecondarySheet();
      return;
    }
    closeSheet();
  }
</script>

<Sheet.Root open={sheetState.open} onOpenChange={onSheetOpenChange}>
  <Sheet.Content showClose={false} side={sheetState.side} class={cn(sheetState.contentClass, sheetState.secondary && "sm:max-w-3xl", sheetState.expanded && "w-1/2 sm:max-w-none", "shadow-[4px_0_24px_-4px_rgba(0,0,0,0.3)]")} modal={sheetState.modal}>
    {#if sheetState.secondary && !sheetState.expanded}
      <!-- svelte-ignore a11y_no_static_element_interactions — pointerdown
           capture only records WHICH pane was last touched so the dialog
           close can route to it; it is not itself an interaction. -->
      <div class="flex h-full min-h-0" onpointerdowncapture={() => (closeTargetSecondary = false)}>
        <div
          class="min-w-0 flex-1 border-r border-border"
          onpointerdowncapture={() => (closeTargetSecondary = true)}
          data-testid="sheet-secondary-pane"
        >
          {#if SecondaryPanel}
            <SecondaryPanel {...secondaryProps} modal={sheetState.modal} />
          {:else if secondaryRemoteDecl}
            <RemoteSheetMount decl={secondaryRemoteDecl} props={secondaryProps} />
          {/if}
        </div>
        <div class="min-w-0 flex-1" data-testid="sheet-primary-pane">
          {#if Panel}
            <Panel {...panelProps} modal={sheetState.modal} />
          {:else if remoteDecl}
            <RemoteSheetMount decl={remoteDecl} props={panelProps} />
          {/if}
        </div>
      </div>
    {:else if Panel}
      <Panel {...panelProps} modal={sheetState.modal} />
    {:else if remoteDecl}
      <RemoteSheetMount decl={remoteDecl} props={panelProps} />
    {/if}
  </Sheet.Content>
</Sheet.Root>

