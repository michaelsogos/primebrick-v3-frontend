/**
 * useUnsavedChangesGuard — composable that consolidates the unsaved-changes
 * navigation guards duplicated across all 5 settings form pages.
 *
 * Registers `beforeNavigate` internally (must be called at component top-level)
 * and returns `handleBeforeUnload` and `handleCancel` functions for the page
 * to wire into `<svelte:window onbeforeunload={...}>` and footer Cancel button.
 *
 * @param hasChanges Reactive getter returning whether the form has unsaved changes
 * @param confirmKey i18n key for the confirmation dialog message
 */
import { beforeNavigate } from "$app/navigation";
import { get } from "svelte/store";
import { t } from "$lib/i18n";

export function useUnsavedChangesGuard(
  hasChanges: () => boolean,
  confirmKey: string,
) {
  beforeNavigate((navigation) => {
    if (hasChanges()) {
      const confirmLeave = confirm(get(t)(confirmKey));
      if (!confirmLeave) {
        navigation.cancel();
      }
    }
  });

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (hasChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  function handleCancel() {
    if (hasChanges()) {
      const ok = confirm(get(t)(confirmKey));
      if (!ok) return;
    }
    if (window.opener) {
      window.close();
    } else {
      history.back();
    }
  }

  return { handleBeforeUnload, handleCancel };
}
