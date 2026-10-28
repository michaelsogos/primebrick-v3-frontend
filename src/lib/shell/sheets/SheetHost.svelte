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

  import ErrorsPanel from '$lib/shell/sheets/panels/ErrorsPanel.svelte';
  import VersionsPanel from '$lib/shell/sheets/panels/VersionsPanel.svelte';
  import AiChatPanel from '$lib/shell/sheets/panels/AiChatPanel.svelte';
  import SearchInPanel from '$lib/entity-list/sheets/panels/SearchInPanel.svelte';
  import ColumnsPanel from '$lib/entity-list/sheets/panels/ColumnsPanel.svelte';
  import FiltersPanel from '$lib/entity-list/sheets/panels/FiltersPanel.svelte';
  import VersionHistoryPanel from '$lib/entity-list/sheets/panels/VersionHistoryPanel.svelte';
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

  const registry: Record<SheetPanelId, any> = {
    'shell.errors': ErrorsPanel,
    'shell.versions': VersionsPanel,
    'shell.aiChat': AiChatPanel,
    'entity.searchIn': SearchInPanel,
    'entity.columns': ColumnsPanel,
    'entity.filters': FiltersPanel,
    'entity.versionHistory': VersionHistoryPanel,
    'config.currencySelect': CurrencySelectPanel,
    'config.protocolSelect': ProtocolSelectPanel,
    'config.phonePrefixSelect': PhonePrefixSelectPanel,
    'config.regexFlags': RegexFlagsPanel,
    'config.regexAiChat': RegexAiChatPanel,
    'config.jsonAiChat': JsonConfigAiChatPanel,
    'json.aiChat': JsonAiChatPanel,
    'shell.aiGuide': GuideAiChatPanel,
    'config.badgeValueEdit': BadgeValuePanel,
    'shell.docs': DocsPanel
  };

  const panelId = $derived(sheetState.panelId);
  /**
   * Dispatch: host registry first, then a remote declaration — the key
   * passed `openSheet` validation so exactly one of them resolves. Remote
   * sheets mount through the same loader/ctx discipline as remote pages.
   */
  const Panel = $derived(
    panelId && panelId in registry ? (registry as Record<string, any>)[panelId] : null
  );
  const remoteDecl = $derived(Panel ? null : panelId ? resolveRemoteSheetDecl(panelId) : null);
  const panelProps = $derived((sheetState.props ?? {}) as Record<string, unknown>);

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
    closeSheet();
  }
</script>

<Sheet.Root open={sheetState.open} onOpenChange={onSheetOpenChange}>
  <Sheet.Content showClose={false} side={sheetState.side} class={cn(sheetState.contentClass, sheetState.expanded && "w-1/2 sm:max-w-none", "shadow-[4px_0_24px_-4px_rgba(0,0,0,0.3)]")} modal={sheetState.modal}>
    {#if Panel}
      <Panel {...panelProps} modal={sheetState.modal} />
    {:else if remoteDecl}
      <RemoteSheetMount decl={remoteDecl} props={panelProps} />
    {/if}
  </Sheet.Content>
</Sheet.Root>

