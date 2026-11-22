/**
 * useUnsavedChangesGuard — composable that consolidates the unsaved-changes
 * navigation guards duplicated across all 5 settings form pages.
 *
 * Registers `beforeNavigate` internally (must be called at component top-level)
 * and returns `handleBeforeUnload` and `handleCancel` functions for the page
 * to wire into `<svelte:window onbeforeunload={...}>` and footer Cancel button.
 *
 * The confirm is the NATIVE `window.confirm` — by explicit decision: the
 * synchronous browser lock is required because an in-app dialog lets the
 * user interact with the page while the guard is open (race window: a
 * second nav/close attempt lands before the first resolves). `confirm()`
 * blocks the JS thread — no overlap is physically possible. `beforeunload`
 * keeps the browser's own native prompt for real unloads (close tab /
 * reload), the only surface that can block them.
 *
 * `no-native-dialog` is exempted for THIS file alone in
 * `.devin/check-standards.json` — everywhere else entity confirms keep the
 * governed invoker anatomy (DeleteDialog-family, pushNotification).
 *
 * @param hasChanges Reactive getter returning whether the form has unsaved changes
 * @param confirmKey i18n key for the confirmation dialog message
 */
import { beforeNavigate } from "$app/navigation";
import { get } from "svelte/store";
import { t } from "$lib/i18n";

/** Shared confirm primitive — the sheet close-guard and the surface's
 *  discard path reuse the SAME native lock (no overlap by construction:
 *  the call blocks the thread until the user answers). */
export function guardConfirm(confirmKey: string): boolean {
  return window.confirm(get(t)(confirmKey));
}

export function useUnsavedChangesGuard(
  hasChanges: () => boolean,
  confirmKey: string,
  /** Runs ONLY on a confirmed leave — the caller's stale-state cleanup
   *  (draft slot clear). A declined guard never reaches it. */
  onConfirmLeave?: () => void,
) {
  beforeNavigate((navigation) => {
    if (!hasChanges()) return;
    // Native lock — the answer is synchronous; a declined guard cancels,
    // a confirmed one lets the navigation proceed untouched.
    if (!guardConfirm(confirmKey)) {
      navigation.cancel();
      return;
    }
    onConfirmLeave?.();
  });

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (hasChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  function handleCancel() {
    if (hasChanges()) {
      if (!guardConfirm(confirmKey)) return;
      onConfirmLeave?.();
    }
    if (window.opener) {
      window.close();
    } else {
      history.back();
    }
  }

  return { handleBeforeUnload, handleCancel };
}
