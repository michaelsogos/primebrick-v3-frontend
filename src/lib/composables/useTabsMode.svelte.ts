/**
 * useTabsMode — composable that manages the global tabs display mode preference.
 *
 * The mode controls how `AnchorTabs` renders its content:
 *   - 'show-all' (default): all tab contents are stacked, triggers are anchor
 *     links with smooth-scroll, active trigger follows scroll via
 *     IntersectionObserver.
 *   - 'hide': standard tabs behavior (only the selected tab's content is
 *     visible).
 *
 * The preference is global (shared across all pages that use `AnchorTabs`),
 * persisted in `localStorage` under `pb.tabs.mode`.
 *
 * Module-level state: all callers share the SAME reactive state instance, so
 * a mode change in one component immediately reflects in all others.
 *
 * Follows the composable state exposure pattern from AGENTS.md:
 *   - _state is internal (underscore prefix)
 *   - Exposed via get state() returning DeepReadonly
 *   - Mutations only through the setMode() mutator
 */
import type { DeepReadonly } from "$lib/types/deep-readonly";

export type TabsMode = "hide" | "show-all";

const STORAGE_KEY = "pb.tabs.mode";
const DEFAULT_MODE: TabsMode = "show-all";

function readStoredMode(): TabsMode {
  if (typeof localStorage === "undefined") return DEFAULT_MODE;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "hide" || stored === "show-all") return stored;
  return DEFAULT_MODE;
}

// Module-level singleton state — shared across all useTabsMode() callers.
const _state = $state({ mode: readStoredMode() });

export function useTabsMode() {
  function setMode(mode: TabsMode): void {
    _state.mode = mode;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, mode);
    }
  }

  function toggle(): void {
    setMode(_state.mode === "show-all" ? "hide" : "show-all");
  }

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    get mode(): TabsMode {
      return _state.mode;
    },
    setMode,
    toggle,
  };
}
