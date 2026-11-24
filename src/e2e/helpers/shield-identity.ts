/**
 * E2E shield identity — a `primebrick-e2e` row in
 * `system.client_shield_registry` so the test harness can publish
 * shielded NATS messages (trigger events, governed schedule requests).
 *
 * Created through the BE admin entity API — never raw SQL:
 * `POST /api/v1/entities/client_registry` hashes the presented
 * `client_key` and the `afterWrite` hook broadcasts
 * `system.client_shield_registry.changed`, so every consumer (the
 * job-handler's ClientShieldRegistry included) reloads the snapshot —
 * a SQL insert would bypass the invalidation and stay invisible.
 *
 * Teardown soft-deletes the row the same way (`changed` fires again).
 */
import { randomBytes, createHash } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import type { ShieldIdentity } from "./nats";

import { extJsonParse } from '@primebrick/core/ext-json';
export const E2E_UA_PREFIX = "primebrick-e2e/1.0.0";

export interface ShieldHandle extends ShieldIdentity {
  /** Registry row uuid — needed for the teardown delete. */
  uuid: string;
  /** Soft-delete the registry row (fires `changed` on the BE). */
  destroy: () => Promise<void>;
}

/**
 * Register `primebrick-e2e/1.0.0` with a fresh random client key.
 * `request` must be an authenticated admin API context (loginAsTestAdmin).
 * The broadcast makes the row visible to consumers within ~a second;
 * callers should still allow a short settle before the first shielded
 * publish (the registry reload is async per consumer).
 */
export async function registerShieldIdentity(request: APIRequestContext): Promise<ShieldHandle> {
  const clientKey = `e2e-${randomBytes(24).toString("base64url")}`;

  // Idempotent — `ua_prefix` is a HARD unique (soft-deleted rows keep it),
  // so a crashed run's row would brick every re-run. Reuse it instead:
  // restore if deleted, rotate the presented key, flip is_enabled on.
  let rowUuid: string;
  const list = await request.get(
    `/api/v1/entities/client_registry/list?filters[0][field]=ua_prefix&filters[0][op]=%3D&filters[0][value]=${encodeURIComponent(E2E_UA_PREFIX)}&deleted_records=INCLUDED`,
  );
  const existing = list.ok()
    ? (((await list.text().then((t) => extJsonParse<unknown>(t))) as { rows?: Array<{ uuid: string; version?: number; deleted_at?: string | null }> }).rows ?? [])[0]
    : undefined;

  if (existing) {
    rowUuid = existing.uuid;
    let version = existing.version ?? 0;
    if (existing.deleted_at) {
      const res = await request.post(
        `/api/v1/entities/client_registry/${rowUuid}/restore?version=${version}`,
      );
      if (!res.ok()) throw new Error(`client_registry restore failed ${res.status()}: ${await res.text()}`);
      version += 1; // restore bumps the row version
    }
    const upd = await request.put(`/api/v1/entities/client_registry/${rowUuid}`, {
      // extJsonParse returns bigint for int8 leaves — playwright's request
      // serializer can't carry it; the wire needs a plain number.
      data: { entity: { client_key: clientKey, is_enabled: true, version: Number(version) } },
    });
    if (!upd.ok()) {
      // Version drift between list and update — retry once on the fresh row.
      const fresh = await request.get(`/api/v1/entities/client_registry/${rowUuid}`);
      const frow = (await fresh.text().then((t) => extJsonParse<unknown>(t))) as { version?: number };
      const retry = await request.put(`/api/v1/entities/client_registry/${rowUuid}`, {
        data: { entity: { client_key: clientKey, is_enabled: true, version: frow.version ?? 0 } },
      });
      if (!retry.ok()) throw new Error(`client_registry update failed ${retry.status()}: ${await retry.text()}`);
    }
  } else {
    const res = await request.post("/api/v1/entities/client_registry", {
      data: {
        entity: {
          ua_prefix: E2E_UA_PREFIX,
          client_key: clientKey,
          is_enabled: true,
        },
      },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`client_registry create failed ${res.status()}: ${body}`);
    }
    rowUuid = ((await res.text().then((t) => extJsonParse<unknown>(t))) as { uuid: string }).uuid;
  }
  const row = { uuid: rowUuid };
  // Sanity: the presented key must hash to what the verifier will compare.
  const expectedHash = createHash("sha256").update(clientKey).digest("hex");
  const handle: ShieldHandle = {
    uaPrefix: E2E_UA_PREFIX,
    clientKey,
    uuid: row.uuid,
    destroy: async () => {
      // Soft-delete via the API (fires `changed`); a later run's
      // idempotent re-register restores+rotates the same row.
      const cur = await request.get(`/api/v1/entities/client_registry/${row.uuid}`);
      let v = 0;
      if (cur.ok()) {
        const j = (await cur.text().then((t) => extJsonParse<unknown>(t))) as { version?: number; row?: { version?: number } };
        v = j.version ?? j.row?.version ?? 0;
      }
      const del = await request.delete(`/api/v1/entities/client_registry/${row.uuid}?version=${v}`);
      if (!del.ok() && del.status() !== 404) {
        throw new Error(`client_registry delete failed ${del.status()}: ${await del.text()}`);
      }
    },
  };
  void expectedHash; // documented invariant — the service stores clientKeyHash(key)
  return handle;
}
