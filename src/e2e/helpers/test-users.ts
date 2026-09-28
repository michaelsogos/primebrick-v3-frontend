/**
 * Ephemeral E2E test actor — created in globalSetup, destroyed in teardown.
 *
 * Why: static seeded test users are latent backdoors (a permanent privileged
 * account with a known password). Instead, every E2E run mints a throwaway
 * admin actor with a random password:
 *   1. drop any leftover actor with the same name (previous crashed run)
 *   2. create the user in Casdoor via the machine client credentials
 *   3. assign the `administrators` role, enable + verify it
 *   4. insert the matching `public.user_profiles` row (is_admin)
 *   5. publish credentials via process.env so `helpers/admin-login.ts` can
 *      authenticate
 *   6. globalTeardown deletes the user (Casdoor + DB + MFA rows)
 *
 * Never the dev bootstrap `admin` user — it is a human first-login identity,
 * not test data.
 */
import { randomBytes, randomUUID } from "crypto";
import { getPool } from "./db";

const ACTOR_NAME = process.env.E2E_ACTOR_NAME ?? "e2e_test_admin";
const ACTOR_DISPLAY = "E2E Test Admin";
const ACTOR_EMAIL = `${ACTOR_NAME}@e2e.local`;
const ADMIN_ROLE = "administrators";

interface IdpConfig {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  org: string;
}

async function loadIdpConfig(): Promise<IdpConfig> {
  const res = await getPool().query(
    `SELECT key, value FROM public.config_entries
     WHERE key IN ('idp_endpoint', 'idp_client_id', 'idp_client_secret', 'idp_organization')`,
  );
  const map = Object.fromEntries(res.rows.map((r) => [r.key, r.value]));
  if (!map.idp_endpoint || !map.idp_client_id || !map.idp_client_secret || !map.idp_organization) {
    throw new Error("[E2E] Missing IDP config in config_entries (idp_endpoint/client_id/client_secret/organization)");
  }
  return {
    endpoint: String(map.idp_endpoint).replace(/\/$/, ""),
    clientId: map.idp_client_id,
    clientSecret: map.idp_client_secret,
    org: map.idp_organization,
  };
}

async function casdoorFetch(cfg: IdpConfig, path: string, init?: RequestInit): Promise<any> {
  const url = new URL(`${cfg.endpoint}/api${path}`);
  url.searchParams.set("clientId", cfg.clientId);
  url.searchParams.set("clientSecret", cfg.clientSecret);
  const res = await fetch(url.toString(), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  return res.json().catch(() => null);
}

async function deleteCasdoorUser(cfg: IdpConfig, name: string): Promise<void> {
  // Best-effort: fetch for the id, then delete.
  const got = await casdoorFetch(cfg, `/get-user?id=${encodeURIComponent(`${cfg.org}/${name}`)}`);
  const user = got?.data;
  if (!user?.id) return;
  await casdoorFetch(cfg, `/delete-user?id=${encodeURIComponent(`${cfg.org}/${name}`)}`, {
    method: "POST",
    body: JSON.stringify({ id: user.id, owner: cfg.org, name }),
  });
}

/** Fetch the full administrators role object via the Casdoor API. */
async function getRole(cfg: IdpConfig): Promise<Record<string, unknown>> {
  const got = await casdoorFetch(
    cfg,
    `/get-role?id=${encodeURIComponent(`${cfg.org}/${ADMIN_ROLE}`)}`,
  );
  if (!got?.data) throw new Error(`[E2E] Casdoor get-role failed: ${JSON.stringify(got)}`);
  return got.data;
}

// update-role applies the body verbatim — omitted fields are reset to their
// zero value (a partial update silently disables the role via isEnabled:false).
// Always send the full role object back with only `users` modified.
async function updateRoleUsers(
  cfg: IdpConfig,
  role: Record<string, unknown>,
  users: string[],
): Promise<void> {
  const res = await casdoorFetch(
    cfg,
    `/update-role?id=${encodeURIComponent(`${cfg.org}/${ADMIN_ROLE}`)}`,
    {
      method: "POST",
      body: JSON.stringify({ ...role, users }),
    },
  );
  if (res?.status !== "ok" && res?.success !== true) {
    throw new Error(`[E2E] Casdoor update-role failed: ${JSON.stringify(res)}`);
  }
}

async function linkCasdoorUserToRole(cfg: IdpConfig, userKey: string): Promise<void> {
  const role = await getRole(cfg);
  const users = (role.users as string[]) ?? [];
  if (!users.includes(userKey)) await updateRoleUsers(cfg, role, [...users, userKey]);
}

async function unlinkCasdoorUserFromRole(cfg: IdpConfig, userKey: string): Promise<void> {
  const role = await getRole(cfg);
  const users = (role.users as string[]) ?? [];
  const filtered = users.filter((u) => u !== userKey);
  if (filtered.length !== users.length) await updateRoleUsers(cfg, role, filtered);
}

/**
 * Create the ephemeral admin test actor. Returns its credentials and also
 * publishes them as E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD env vars (visible
 * to all Playwright workers — env set in globalSetup propagates to tests).
 */
export async function createE2eAdminActor(): Promise<{ username: string; password: string }> {
  const cfg = await loadIdpConfig();
  const pool = getPool();
  const password = `E2E-${randomBytes(12).toString("hex")}!`;

  // 1. Drop leftovers from a previous crashed run (Casdoor + profile + MFA).
  await deleteCasdoorUser(cfg, ACTOR_NAME);
  await pool.query(
    `DELETE FROM public.user_mfa_factors WHERE user_profile_id IN
       (SELECT id FROM public.user_profiles WHERE idp_username = $1)`,
    [ACTOR_NAME],
  );
  await pool.query(`DELETE FROM public.user_profiles WHERE idp_username = $1`, [ACTOR_NAME]);

  // 2-4. Create in Casdoor — enabled, verified, administrators role.
  // NOTE: do NOT pass `?id=` — with the machine client creds Casdoor answers
  // "Unauthorized operation" when id is set; without it the user lands in the
  // application's organization.
  const addRes = await casdoorFetch(cfg, `/add-user`, {
    method: "POST",
    body: JSON.stringify({
      owner: cfg.org,
      name: ACTOR_NAME,
      displayName: ACTOR_DISPLAY,
      email: ACTOR_EMAIL,
      password,
      isAdmin: true,
      isVerified: true,
      emailVerified: true,
      isForbidden: false,
      signupApplication: "primebrick-api",
      roles: [{ name: ADMIN_ROLE }],
    }),
  });
  if (addRes?.status !== "ok" && addRes?.success !== true) {
    throw new Error(`[E2E] Casdoor add-user for test actor failed: ${JSON.stringify(addRes)}`);
  }

  // add-user returns data:"Affected" — fetch the created user for its id.
  // get-user is eventually consistent right after creation → retry briefly.
  let casdoorUser: any = null;
  for (let i = 0; i < 10 && !casdoorUser?.id; i++) {
    const created = await casdoorFetch(cfg, `/get-user?id=${encodeURIComponent(`${cfg.org}/${ACTOR_NAME}`)}`);
    casdoorUser = created?.data;
    if (!casdoorUser?.id) await new Promise((r) => setTimeout(r, 500));
  }
  if (!casdoorUser?.id) {
    throw new Error("[E2E] Casdoor did not return the test actor after creation");
  }

  // 4b. Link the user into the `administrators` role's `users` list via the
  // Casdoor API — the JWT `roles` claim is only populated from role.users;
  // the body `roles` field alone is ignored.
  await linkCasdoorUserToRole(cfg, `${cfg.org}/${ACTOR_NAME}`);

  // 5. Mirror into public.user_profiles (is_admin → admin bypass).
  const uuid = randomUUID();
  const now = new Date();
  await pool.query(
    `INSERT INTO public.user_profiles
     (uuid, idp_code, email, display_name, idp_org, idp_username, avatar_color, avatar_initials,
      is_active, is_admin, is_verified, email_verified, issuer, roles, last_synced_at,
      created_at, created_by, updated_at, updated_by, version,
      auth_method_enforcer_dismissed)
     VALUES ($1,$2,$3,$4,$5,$6,'#4f46e5','TA',true,true,true,true,$7,$8,$9,$9,'e2e-setup',$9,'e2e-setup',1,true)`,
    [uuid, casdoorUser.id, ACTOR_EMAIL, ACTOR_DISPLAY, cfg.org, ACTOR_NAME, cfg.endpoint,
     JSON.stringify([ADMIN_ROLE]), now],
  );

  process.env.E2E_ADMIN_USERNAME = ACTOR_NAME;
  process.env.E2E_ADMIN_PASSWORD = password;
  return { username: ACTOR_NAME, password };
}

/**
 * Remove a Casdoor user created during a test (e.g. an invited user created
 * via the admin UI). Unlinks it from the `administrators` role's `users` list
 * and deletes the Casdoor account. Safe to call when the user doesn't exist.
 */
export async function cleanupCasdoorUser(username: string): Promise<void> {
  const cfg = await loadIdpConfig();
  await unlinkCasdoorUserFromRole(cfg, `${cfg.org}/${username}`);
  await deleteCasdoorUser(cfg, username);
}

/**
 * Destroy the ephemeral admin test actor (Casdoor + user_profiles + MFA rows).
 * Safe to call when the actor does not exist.
 */
export async function destroyE2eAdminActor(): Promise<void> {
  const pool = getPool();
  try {
    const cfg = await loadIdpConfig();
    await deleteCasdoorUser(cfg, ACTOR_NAME);
  } catch (e) {
    console.warn("[E2E] Casdoor cleanup of test actor failed:", e);
  }

  // Unlink the actor from the Casdoor role (role.users array) so no dangling
  // reference survives the user deletion.
  try {
    const cfg = await loadIdpConfig();
    await unlinkCasdoorUserFromRole(cfg, `${cfg.org}/${ACTOR_NAME}`);
  } catch (e) {
    console.warn("[E2E] Casdoor role unlink of test actor failed:", e);
  }

  await pool.query(
    `DELETE FROM public.user_mfa_factors WHERE user_profile_id IN
       (SELECT id FROM public.user_profiles WHERE idp_username = $1)`,
    [ACTOR_NAME],
  );
  await pool.query(`DELETE FROM public.user_profiles WHERE idp_username = $1`, [ACTOR_NAME]);
}
