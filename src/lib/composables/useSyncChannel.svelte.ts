/**
 * useSyncChannel — composable that encapsulates the BroadcastChannel
 * synchronization pattern used between child form pages (senders) and
 * parent list pages (receivers).
 *
 * Sender mode: creates the channel in onMount, cleans up on unmount,
 *   exposes `notifyParentRefresh()` to post 'refresh' messages.
 * Receiver mode: creates the channel immediately (if browser), cleans up
 *   on destroy, calls `onRefresh` when 'refresh' message is received.
 *
 * The channel name is entity-specific (e.g. 'primebrick_users_sync'),
 * passed as an argument — this is a parameter, not a duplication.
 */
import { onMount, onDestroy } from "svelte";
import { browser } from "$app/environment";

type SyncChannelOptions =
  | { mode: "sender" }
  | { mode: "receiver"; onRefresh: () => void };

export function useSyncChannel(
  channelName: string,
  options: SyncChannelOptions,
) {
  let syncChannel: BroadcastChannel | null = null;

  if (options.mode === "sender") {
    onMount(() => {
      syncChannel = new BroadcastChannel(channelName);
      return () => {
        syncChannel?.close();
        syncChannel = null;
      };
    });
  } else {
    if (browser) {
      syncChannel = new BroadcastChannel(channelName);
      syncChannel.onmessage = (event) => {
        if (event.data === "refresh") options.onRefresh();
      };
    }
    onDestroy(() => {
      syncChannel?.close();
      syncChannel = null;
    });
  }

  function notifyParentRefresh() {
    if (!syncChannel) return;
    try {
      syncChannel.postMessage("refresh");
    } catch (e) {
      console.warn(
        `[${channelName}] Channel not ready, skipping refresh notification:`,
        e,
      );
    }
  }

  return { notifyParentRefresh };
}
