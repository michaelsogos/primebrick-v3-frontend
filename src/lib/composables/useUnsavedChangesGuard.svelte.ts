/**
 * useUnsavedChangesGuard — composable that consolidates the unsaved-changes
 * navigation guards duplicated across all 5 settings form pages.
 *
 * Registers `beforeNavigate` internally (must be called at component top-level)
 * and returns `handleBeforeUnload` and `handleCancel` functions for the page
 * to wire into `<svelte:window onbeforeunload={...}>` and footer Cancel button.
 *
 * The confirm channel is module-level state rendered by ONE
 * `<UnsavedChangesGuardHost>` mounted in `(app)/+layout.svelte` — the
 * governed anatomy exists by construction; `confirm()`/`alert()`/`prompt()`
 * are banned by the `no-native-dialog` rule. `beforeunload` keeps the
 * browser's native prompt (the only surface that can block a real unload).
 *
 * @param hasChanges Reactive getter returning whether the form has unsaved changes
 * @param confirmKey i18n key for the confirmation dialog message
 */
import { beforeNavigate, goto } from "$app/navigation";
import { get } from "svelte/store";
import { t } from "$lib/i18n";

/** Module-level confirm channel — one pending guard at a time: a second
 *  request while a confirm is open resolves `false` (fail-closed). */
export const unsavedGuardState = $state<{
  confirm: { confirmKey: string; resolve: (ok: boolean) => void } | null;
}>({ confirm: null });

export function settleUnsavedGuardConfirm(ok: boolean): void {
  const req = unsavedGuardState.confirm;
  unsavedGuardState.confirm = null;
  req?.resolve(ok);
}

function askGuardConfirm(confirmKey: string): Promise<boolean> {
  if (unsavedGuardState.confirm) return Promise.resolve(false);
  return new Promise((resolve) => {
    unsavedGuardState.confirm = { confirmKey, resolve };
  });
}

export function useUnsavedChangesGuard(
  hasChanges: () => boolean,
  confirmKey: string,
) {
  beforeNavigate((navigation) => {
    if (!hasChanges()) return;
    navigation.cancel();
    const target = navigation.to?.url;
    void askGuardConfirm(confirmKey).then((ok) => {
      if (ok && target) void goto(target);
    });
  });

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (hasChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  async function handleCancel() {
    if (hasChanges()) {
      const ok = await askGuardConfirm(confirmKey);
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
