/**
 * use-entity-op — the governed invoker for entity ops.
 *
 * ONE construction point for entity write actions: any component firing
 * an `entity_op`-family action calls `runEntityOp` instead of
 * hand-rolling `apiFetch`. The invoker owns:
 *
 *   - **the mandatory confirm gate** — `delete.*`/`purge.*`/`restore.*`
 *     ops, any op whose declared `endpoint.method === 'DELETE'`, and any
 *     op whose `meta.actions[op].confirm_key` is set CANNOT run
 *     unconfirmed: `runEntityOp` awaits the shared dialog and refuses
 *     (returns `false`) on cancel. The confirm channel is module-level
 *     state rendered by ONE `<EntityOpConfirmHost>` mounted in
 *     `(app)/+layout.svelte` — the channel exists by construction, not
 *     by per-page wiring (the dict page's missing `dialogs` composable
 *     is exactly how a raw DELETE once shipped unconfirmed).
 *   - **endpoint resolution** from `meta.actions` (`findActionEndpoint`
 *     + `fillActionPath`), with the `/api/v1/entities/{entity}`
 *     convention fallback for stale/mocked metas;
 *   - **MFA step-up** on every request — `executeWithToken` wraps the
 *     call uniformly (previously only dict deletes had it; standard ELT
 *     deletes would have failed opaquely on a step-up requirement);
 *   - **RFC7807 failure → pushNotification** and the convention toasts
 *     (delete success toast; restore succeeds silently) + `onDone`.
 *
 * Severity comes from the op's own chrome (`ActionColor`): delete/purge
 * default `destructive`, restore `warning` — the same closed vocabulary
 * `entity-confirm-dialogs` documents.
 *
 * Callers with no declared endpoint (e.g. dict `restore.bulk` = per-row
 * loop — the entity-router exposes no bulk restore) pass an explicit
 * `execute` executor; the gate still applies. Local-only drops
 * (`dict-pending-delete`) never call this — there is no request to guard.
 */
import { get } from 'svelte/store';
import { t } from '$lib/i18n';
import { apiFetch, entityApiBase, serviceApiPrefix } from '$lib/api';
import { extJsonParse, extJsonStringify } from '$lib/api-ext';
import { useMfaStepUp } from '$lib/composables/useMfaStepUp.svelte';
import { pushNotification } from '$lib/errors/app-errors';
import { findActionEndpoint, fillActionPath } from './action-endpoints';
import type { EntityAction, EntityActionEndpoint, EntityMeta } from './types';

/** Chrome fields an op may override via `meta.actions[op]` — the shape
 *  the confirm dialogs already consume (ELT's `ActionChrome`). */
export type EntityOpChrome = Pick<EntityAction, 'label_key' | 'icon' | 'color' | 'confirm_key' | 'busy_key'>;

export type EntityOpFamily = 'delete' | 'restore' | 'generic';
export type EntityOpScope = 'single' | 'bulk';

export interface EntityOpConfirmRequest {
  family: EntityOpFamily;
  scope: EntityOpScope;
  entity: string;
  entities_ns?: string;
  recordName?: string;
  count?: number;
  chrome?: EntityOpChrome;
  /** Bulk scope choicebox — when present the bulk dialogs render the
   *  selected/all Choicebox bound to the caller's scope state. */
  scopeChoice?: {
    readonly value: 'selected' | 'all';
    onChange: (v: 'selected' | 'all') => void;
  };
  /** Rows matching the current filters — the 'all' scope count. */
  totalCount?: bigint;
  resolve: (confirmed: boolean) => void;
}

/** Module-level confirm channel — the host binds to this state. One
 *  gate at a time: a second `runEntityOp` while a confirm is open is
 *  refused (fail-closed, never a silent delete). */
export const entityOpState = $state<{
  confirm: EntityOpConfirmRequest | null;
  busy: boolean;
}>({ confirm: null, busy: false });

/** The step-up driver is global too — `EntityOpConfirmHost` mounts the
 *  ONE `<MfaStepUpDialog>`; pages stop carrying per-page instances for
 *  entity ops. */
const stepUp = useMfaStepUp();
export const entityOpMfa = stepUp;

/** Host callback — confirm resolves the pending promise; cancel clears
 *  immediately. On confirm the request stays mounted so the dialog's
 *  busy state is visible until the op settles (ELT's isDeleting
 *  convention); `runEntityOp` clears it in `finally`. */
export function settleEntityOpConfirm(confirmed: boolean): void {
  const req = entityOpState.confirm;
  if (!req) return;
  if (confirmed) {
    req.resolve(true);
    return;
  }
  if (entityOpState.busy) return; // mid-request dismiss is not a cancel
  entityOpState.confirm = null;
  req.resolve(false);
}

export interface RunEntityOpArgs {
  /** `meta.actions` op name — `delete.single`, `restore.bulk`, custom … */
  op: string;
  entity: string;
  meta?: EntityMeta | null;
  /** single-scope target (delete.single / restore.single / custom row ops) */
  row?: Record<string, unknown>;
  /** bulk-scope targets — also drives the dialog's selected count */
  rows?: readonly Record<string, unknown>[];
  /** Record display name for the confirm question (defaults: `code` →
   *  `display_field` → uid — `label_key` is never used as a name). */
  recordName?: string;
  /** Explicit executor for ops without a declared endpoint — receives
   *  the MFA token; return `Response` or `boolean`. */
  execute?: (token: string | null) => Promise<Response | boolean>;
  /** Post-success side effect (list refresh, selection clear, goto). */
  onDone?: () => void | Promise<void>;
  /** MFA action label override — defaults to the established standard-op
   *  names (`delete`, `bulk_delete`, `restore`, `bulk_restore`, `purge`)
   *  and the raw op name for custom ops (`action_name` convention). */
  mfaAction?: string;
  /** Bulk scope choicebox — bound to the caller's scope state; the bulk
   *  dialog's Choicebox reads `value` and writes through `onChange`. */
  scopeChoice?: {
    readonly value: 'selected' | 'all';
    onChange: (v: 'selected' | 'all') => void;
  };
  /** Rows matching the current filters — the 'all' scope count shown by
   *  the bulk dialogs' Choicebox. */
  totalCount?: bigint;
}

const DELETE_FAMILY = /^(?:delete|purge)\./;
const RESTORE_FAMILY = /^restore\./;

/** MFA action binding for standard ops — matches the names existing
 *  call-sites already minted (`configurations` delete/bulk_delete,
 *  dict delete/bulk_delete); a route that later declares `mfa` must
 *  find the same binding. Custom ops pass their op (= action_name). */
const STANDARD_MFA_ACTION: Record<string, string> = {
  'delete.single': 'delete',
  'delete.bulk': 'bulk_delete',
  'restore.single': 'restore',
  'restore.bulk': 'bulk_restore',
  'purge.single': 'purge',
};

function chromeOf(action?: EntityAction): EntityOpChrome | undefined {
  if (!action) return undefined;
  const { label_key, icon, color, confirm_key, busy_key } = action;
  if (!label_key && !icon && !color && !confirm_key && !busy_key) return undefined;
  return { label_key, icon, color, confirm_key, busy_key };
}

function defaultRecordName(row: Record<string, unknown>, meta?: EntityMeta | null, uid = 'uuid'): string | undefined {
  const candidate = row['code'] ?? (meta?.display_field ? row[meta.display_field] : undefined) ?? row[uid];
  return candidate === undefined || candidate === null ? undefined : String(candidate);
}

/** Custom executors may return a boolean — normalize to a Response so
 *  the step-up wrapper and the result path see one shape. */
function toResponse(r: Response | boolean): Response {
  return r instanceof Response ? r : new Response(null, { status: r ? 200 : 500 });
}

async function askConfirm(req: Omit<EntityOpConfirmRequest, 'resolve'>): Promise<boolean> {
  if (entityOpState.confirm) {
    if (import.meta.env.DEV) console.warn('[entityOp] confirm gate already open — refusing concurrent op');
    return false;
  }
  return new Promise((resolve) => {
    entityOpState.confirm = { ...req, resolve };
  });
}

function failKey(family: EntityOpFamily): string {
  return family === 'restore' ? 'app.common.restore_failed' : 'app.common.delete_failed';
}

/**
 * Run an entity op through the gate. `true` iff the request executed
 * and succeeded — cancel/fail/no-endpoint all resolve `false` (their
 * notifications already happened inside).
 */
export async function runEntityOp(args: RunEntityOpArgs): Promise<boolean> {
  const { op, entity, meta } = args;
  const uid = meta?.uid ?? 'uuid';
  const action = meta?.actions?.find((a) => a.op === op);
  const ep = findActionEndpoint(meta?.actions, op);
  const method = (ep?.method ?? '').toUpperCase();

  const family: EntityOpFamily = DELETE_FAMILY.test(op) || method === 'DELETE'
    ? 'delete'
    : RESTORE_FAMILY.test(op)
      ? 'restore'
      : 'generic';
  const scope: EntityOpScope = args.rows ? 'bulk' : 'single';
  const gated = family !== 'generic' || action?.confirm_key != null;

  if (gated) {
    const confirmed = await askConfirm({
      family,
      scope,
      entity,
      entities_ns: meta?.entities_ns,
      recordName: args.recordName ?? (args.row ? defaultRecordName(args.row, meta, uid) : undefined),
      count: args.rows?.length,
      chrome: chromeOf(action),
      scopeChoice: args.scopeChoice,
      totalCount: args.totalCount,
    });
    if (!confirmed) return false;
  }

  const request = args.execute ?? defaultRequest(args, ep, uid);
  if (!request) {
    pushNotification({
      type: '/errors/not-implemented',
      title: get(t)('app.common.errors.not_implemented.title'),
      status: 501,
      detail: get(t)('app.common.errors.not_implemented.detail', { action: op }),
      instance: `entityOp:${op}`,
      internal_code: 'ENTITY_OP_NO_ENDPOINT',
      severity: 'LOW',
    });
    entityOpState.confirm = null;
    return false;
  }

  entityOpState.busy = true;
  try {
    const res = await stepUp.executeWithToken(
      async (token) => toResponse(await request(token)),
      { action: args.mfaAction ?? STANDARD_MFA_ACTION[op] ?? op, target_resource: entity },
    );
    const ok = res.ok;
    if (ok) {
      if (family === 'delete') {
        pushNotification({ impact: 'NONE', messageKey: 'app.common.delete_success' });
      }
      await args.onDone?.();
      return true;
    }
    // extJsonParse (never res.json) — the RFC7807 body may carry bigint
    // fields (version, id) in `extra`; native JSON would silently lose them.
    const body = await res.text().then((txt) => (txt ? extJsonParse(txt) : null)).catch(() => null);
    pushNotification(
      body && typeof body === 'object' && 'type' in body
        ? (body as never)
        : { impact: 'HIGH', messageKey: failKey(family) },
    );
    return false;
  } finally {
    entityOpState.busy = false;
    entityOpState.confirm = null;
  }
}

/**
 * Endpoint dispatch for the standard gated ops — `restore.bulk` is the
 * one op with no router endpoint (per-row loop over `restore.single`,
 * the dict/ELT-shared convention). Anything else needs an explicit
 * `execute` until its surface converges.
 */
function defaultRequest(
  args: RunEntityOpArgs,
  ep: EntityActionEndpoint | null,
  uid: string,
): ((token: string | null) => Promise<Response>) | null {
  const { op, entity, row, rows } = args;
  const base = entityApiBase(entity);
  // `version` is a native bigint on every ext-json row — the codec
  // forces ALL integers to bigint (ext-json.ts). Presence is the only
  // check needed: the template prints the integral token regardless of
  // its numeric representation (bigint canonical; number/string can
  // only come from client-built rows, never from the wire).
  const versionQs = (r?: Record<string, unknown>) => {
    const v = r?.version;
    return v === undefined || v === null || v === '' ? '' : `?version=${v}`;
  };
  const auth = (token: string | null): Record<string, string> =>
    token ? { 'x-mfa-action-authorization': token } : {};

  switch (op) {
    case 'delete.single':
    case 'purge.single': {
      if (!row) return null;
      const url = ep
        ? serviceApiPrefix(entity) + fillActionPath(ep.path, row, uid)
        : `${base}/${encodeURIComponent(String(row[uid]))}${op === 'purge.single' ? '/purge' : ''}`;
      return (token) =>
        apiFetch(`${url}${versionQs(row)}`, {
          method: ep?.method || 'DELETE',
          headers: auth(token),
        });
    }
    case 'restore.single': {
      if (!row) return null;
      const url = ep
        ? serviceApiPrefix(entity) + fillActionPath(ep.path, row, uid)
        : `${base}/${encodeURIComponent(String(row[uid]))}/restore`;
      return (token) =>
        apiFetch(`${url}${versionQs(row)}`, {
          method: ep?.method || 'POST',
          headers: auth(token),
        });
    }
    case 'delete.bulk': {
      const items = (rows ?? []).map((r) => ({ uuid: String(r[uid]), version: r.version }));
      if (items.length === 0) return null;
      const url = ep ? serviceApiPrefix(entity) + ep.path : `${base}/bulk-delete`;
      return (token) =>
        apiFetch(url, {
          method: ep?.method || 'POST',
          headers: { 'Content-Type': 'application/json', ...auth(token) },
          body: extJsonStringify({ items }),
        });
    }
    case 'restore.bulk': {
      const targets = (rows ?? []).filter((r) => r['deleted_at'] !== null && r['deleted_at'] !== undefined);
      if (targets.length === 0) return null;
      return async (token) => {
        for (const r of targets) {
          const res = await apiFetch(
            `${base}/${encodeURIComponent(String(r[uid]))}/restore${versionQs(r)}`,
            { method: 'POST', headers: auth(token) },
          );
          if (!res.ok) return res;
        }
        return new Response(null, { status: 200 });
      };
    }
    default:
      return null;
  }
}
