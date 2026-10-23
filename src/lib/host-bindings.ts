/**
 * host-bindings — binds the HOST realm slots of `@primebrick/ui` at app
 * boot. Imported for side effects at the top of the root layout so every
 * ui component/composable sees bound bridges before first render.
 *
 * - `i18n` ← the real `t` Readable — ui call sites keep `$t(key)` with full
 *   reactivity (language switch + BE dict merges).
 * - `sheet` ← the real `openSheet` (validated host registry).
 * - `serviceApi 'host'` ← `apiFetch` full-path (BE-owned `/api/v1/…`).
 * - `serviceApi 'ai'` ← `apiFetch` prefixed with `/ws/ai` — the same
 *   ws-proxy path `useAiModels` et al. call today.
 *
 * The remote realm binds its own vendored copy via `bindRemoteCtx(ctx)` —
 * these bindings never cross the boundary.
 */
import { bindI18n, bindNotify, bindServiceApi, bindSheet } from '@primebrick/ui';
import { apiFetch } from '$lib/api';
import { t } from '$lib/i18n';
import { uiLang } from '$lib/i18n/store.svelte';
import { uiLocaleTag } from '@primebrick/ui';
import { pushNotification } from '$lib/errors/app-errors';
import { get } from 'svelte/store';
import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';

bindI18n(t, () => uiLocaleTag(get(uiLang)));
bindSheet(openSheet as (panelKey: string, props?: Record<string, unknown>, options?: Record<string, unknown>) => void);
bindNotify(pushNotification);
bindServiceApi('host', apiFetch);
bindServiceApi('ai', (path, init) => apiFetch(`/ws/ai${path}`, init));
