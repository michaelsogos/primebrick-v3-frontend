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
import { Socket } from "net";
import { getPool } from "./db";

const ACTOR_NAME = process.env.E2E_ACTOR_NAME ?? "e2e_test_admin";
const ACTOR_DISPLAY = "E2E Test Admin";
const ACTOR_EMAIL = `${ACTOR_NAME}@e2e.local`;
const ADMIN_ROLE = "administrators";

// Dedicated actor for the MFA suite: enrolling a TOTP factor on the shared
// e2e_test_admin gates EVERY concurrent login with a TOTP challenge until
// the spec's afterAll removes it — under parallel workers that window cost
// ~40 collateral failures. This actor is an admin twin whose MFA state the
// suite may mutate freely; nothing else may log in as it.
const MFA_ACTOR_NAME = process.env.E2E_MFA_ACTOR_NAME ?? "e2e_mfa_user";
const MFA_ACTOR_DISPLAY = "E2E Test MFA User";
const MFA_ACTOR_EMAIL = `${MFA_ACTOR_NAME}@e2e.local`;

// Non-admin actor for access-axis E2E — a dedicated role carries only the
// `access.*` + entity grants the suite needs; `is_admin=false` both in
// Casdoor and user_profiles so nothing is implicitly inherited.
const USER_ACTOR_NAME = process.env.E2E_USER_ACTOR_NAME ?? "e2e_test_user";
const USER_ACTOR_DISPLAY = "E2E Test User";
const USER_ACTOR_EMAIL = `${USER_ACTOR_NAME}@e2e.local`;
const USER_ROLE = "e2e_user";
const USER_ROLE_PERMISSIONS = [
  // Access axis: every leaf of the job module — wildcard grant (bare
  // namespaces like `access.system.job` are ILLEGAL under the access
  // grammar: only exact leaf keys or `.*` wildcards may be granted).
  "access.system.job.*",
  // Entity RBAC: customer reads so CRM entity APIs work for this actor —
  // WITHOUT `access.crm.*` the crm module stays navigation-inaccessible:
  // the two axes are deliberately separate.
  "customer.read.all",
  "customer.read.single",
];

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

/** Link/unlink a user into ANY Casdoor role (get-role/update-role by name). */
async function getNamedRole(cfg: IdpConfig, roleName: string): Promise<Record<string, unknown> | null> {
  const got = await casdoorFetch(cfg, `/get-role?id=${encodeURIComponent(`${cfg.org}/${roleName}`)}`);
  return got?.data ?? null;
}

async function updateNamedRoleUsers(
  cfg: IdpConfig,
  roleName: string,
  role: Record<string, unknown>,
  users: string[],
): Promise<void> {
  const res = await casdoorFetch(cfg, `/update-role?id=${encodeURIComponent(`${cfg.org}/${roleName}`)}`, {
    method: "POST",
    body: JSON.stringify({ ...role, users }),
  });
  if (res?.status !== "ok" && res?.success !== true) {
    throw new Error(`[E2E] Casdoor update-role(${roleName}) failed: ${JSON.stringify(res)}`);
  }
}

/** Delete a Casdoor role — best-effort (absent role is fine). */
async function deleteCasdoorRole(cfg: IdpConfig, roleName: string): Promise<void> {
  const role = await getNamedRole(cfg, roleName);
  if (!role) return;
  await casdoorFetch(cfg, `/delete-role?id=${encodeURIComponent(`${cfg.org}/${roleName}`)}`, {
    method: "POST",
    body: JSON.stringify({ owner: cfg.org, name: roleName }),
  });
}

/**
 * Bust the BE's role_mappings Redis cache (`be:role_mappings:all`, 5-min
 * TTL) after a raw SQL write — without it a warm cache would keep serving
 * the stale mapping for up to 5 minutes. Dependency-free: one RESP `DEL`
 * over a raw socket, best-effort (no redis_url → cache disabled anyway).
 */
async function invalidateRoleMappingsCache(): Promise<void> {
  const res = await getPool().query(
    `SELECT value FROM public.config_entries WHERE key = 'redis_url'`,
  );
  const redisUrl = res.rows[0]?.value as string | undefined;
  if (!redisUrl) return;
  const key = "be:role_mappings:all";
  const cmd = `*2\r\n$3\r\nDEL\r\n$${key.length}\r\n${key}\r\n`;
  const { hostname, port } = new URL(redisUrl);
  await new Promise<void>((resolve) => {
    const sock = new Socket();
    const done = () => { sock.destroy(); resolve(); };
    sock.setTimeout(2000);
    sock.once("error", done).once("timeout", done);
    sock.connect(Number(port) || 6379, hostname, () => {
      sock.write(cmd);
      sock.once("data", done);
    });
  });
}

/**
 * Create the ephemeral admin test actor. Returns its credentials and also
 * publishes them as E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD env vars (visible
 * to all Playwright workers — env set in globalSetup propagates to tests).
 */
/**
 * Mint an admin-capable ephemeral actor (Casdoor `administrators` role +
 * user_profiles is_admin). Parameterized on identity/env so the same flow
 * serves the shared admin actor and the MFA-suite twin.
 */
async function createE2eAdminLikeActor(
  name: string,
  display: string,
  email: string,
  envPrefix: string,
): Promise<{ username: string; password: string }> {
  const cfg = await loadIdpConfig();
  const pool = getPool();
  const password = `E2E-${randomBytes(12).toString("hex")}!`;

  // 1. Drop leftovers from a previous crashed run (Casdoor + profile + MFA).
  await deleteCasdoorUser(cfg, name);
  await pool.query(
    `DELETE FROM public.user_mfa_factors WHERE user_profile_id IN
       (SELECT id FROM public.user_profiles WHERE idp_username = $1)`,
    [name],
  );
  await pool.query(`DELETE FROM public.user_profiles WHERE idp_username = $1`, [name]);

  // 2-4. Create in Casdoor — enabled, verified, administrators role.
  // NOTE: do NOT pass `?id=` — with the machine client creds Casdoor answers
  // "Unauthorized operation" when id is set; without it the user lands in the
  // application's organization.
  const addRes = await casdoorFetch(cfg, `/add-user`, {
    method: "POST",
    body: JSON.stringify({
      owner: cfg.org,
      name,
      displayName: display,
      email,
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
    const created = await casdoorFetch(cfg, `/get-user?id=${encodeURIComponent(`${cfg.org}/${name}`)}`);
    casdoorUser = created?.data;
    if (!casdoorUser?.id) await new Promise((r) => setTimeout(r, 500));
  }
  if (!casdoorUser?.id) {
    throw new Error("[E2E] Casdoor did not return the test actor after creation");
  }

  // 4b. Link the user into the `administrators` role's `users` list via the
  // Casdoor API — the JWT `roles` claim is only populated from role.users;
  // the body `roles` field alone is ignored.
  await linkCasdoorUserToRole(cfg, `${cfg.org}/${name}`);

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
    [uuid, casdoorUser.id, email, display, cfg.org, name, cfg.endpoint,
     JSON.stringify([ADMIN_ROLE]), now],
  );

  process.env[`${envPrefix}_USERNAME`] = name;
  process.env[`${envPrefix}_PASSWORD`] = password;
  return { username: name, password };
}

export function createE2eAdminActor(): Promise<{ username: string; password: string }> {
  return createE2eAdminLikeActor(ACTOR_NAME, ACTOR_DISPLAY, ACTOR_EMAIL, "E2E_ADMIN");
}

export function createE2eMfaActor(): Promise<{ username: string; password: string }> {
  return createE2eAdminLikeActor(MFA_ACTOR_NAME, MFA_ACTOR_DISPLAY, MFA_ACTOR_EMAIL, "E2E_MFA");
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
 * Destroy an admin-capable ephemeral actor (Casdoor + user_profiles + MFA
 * rows). Safe to call when the actor does not exist.
 */
async function destroyAdminLikeActor(name: string): Promise<void> {
  const pool = getPool();
  try {
    const cfg = await loadIdpConfig();
    await deleteCasdoorUser(cfg, name);
  } catch (e) {
    console.warn("[E2E] Casdoor cleanup of test actor failed:", e);
  }

  // Unlink the actor from the Casdoor role (role.users array) so no dangling
  // reference survives the user deletion.
  try {
    const cfg = await loadIdpConfig();
    await unlinkCasdoorUserFromRole(cfg, `${cfg.org}/${name}`);
  } catch (e) {
    console.warn("[E2E] Casdoor role unlink of test actor failed:", e);
  }

  await pool.query(
    `DELETE FROM public.user_mfa_factors WHERE user_profile_id IN
       (SELECT id FROM public.user_profiles WHERE idp_username = $1)`,
    [name],
  );
  await pool.query(`DELETE FROM public.user_profiles WHERE idp_username = $1`, [name]);
}

export function destroyE2eAdminActor(): Promise<void> {
  return destroyAdminLikeActor(ACTOR_NAME);
}

export function destroyE2eMfaActor(): Promise<void> {
  return destroyAdminLikeActor(MFA_ACTOR_NAME);
}

/**
 * Create the ephemeral NON-admin test actor (`e2e_test_user` / role
 * `e2e_user`). Same minting flow as the admin actor, plus:
 *   - a dedicated Casdoor role (`e2e_user`) so its grants never pollute
 *     shared roles;
 *   - a `role_mappings` row carrying USER_ROLE_PERMISSIONS (access.axis +
 *     entity grants) — written raw, then the Redis cache key is busted so
 *     the BE re-reads the mapping immediately;
 *   - `is_admin=false` everywhere: this actor must NOT inherit
 *     `access.system` — it only sees what `e2e_user` explicitly grants.
 *
 * Publishes `E2E_USER_USERNAME` / `E2E_USER_PASSWORD` for
 * `loginAsTestUser()`.
 */
export async function createE2eUserActor(): Promise<{ username: string; password: string }> {
  const cfg = await loadIdpConfig();
  const pool = getPool();
  const password = `E2E-${randomBytes(12).toString("hex")}!`;

  // 1. Drop leftovers from a previous crashed run.
  await deleteCasdoorUser(cfg, USER_ACTOR_NAME);
  await pool.query(
    `DELETE FROM public.user_mfa_factors WHERE user_profile_id IN
       (SELECT id FROM public.user_profiles WHERE idp_username = $1)`,
    [USER_ACTOR_NAME],
  );
  await pool.query(`DELETE FROM public.user_profiles WHERE idp_username = $1`, [USER_ACTOR_NAME]);
  await pool.query(`DELETE FROM public.role_mappings WHERE idp_role = $1`, [USER_ROLE]);
  await deleteCasdoorRole(cfg, USER_ROLE);

  // 2. Dedicated Casdoor role — kept enabled, zero users until step 4.
  const addRoleRes = await casdoorFetch(cfg, `/add-role`, {
    method: "POST",
    body: JSON.stringify({
      owner: cfg.org,
      name: USER_ROLE,
      displayName: "E2E User",
      isEnabled: true,
      users: [],
    }),
  });
  if (addRoleRes?.status !== "ok" && addRoleRes?.success !== true) {
    throw new Error(`[E2E] Casdoor add-role(${USER_ROLE}) failed: ${JSON.stringify(addRoleRes)}`);
  }

  // 3. Casdoor user — NON-admin, verified, no MFA requirements.
  const addRes = await casdoorFetch(cfg, `/add-user`, {
    method: "POST",
    body: JSON.stringify({
      owner: cfg.org,
      name: USER_ACTOR_NAME,
      displayName: USER_ACTOR_DISPLAY,
      email: USER_ACTOR_EMAIL,
      password,
      isAdmin: false,
      isVerified: true,
      emailVerified: true,
      isForbidden: false,
      signupApplication: "primebrick-api",
      roles: [{ name: USER_ROLE }],
    }),
  });
  if (addRes?.status !== "ok" && addRes?.success !== true) {
    throw new Error(`[E2E] Casdoor add-user for non-admin actor failed: ${JSON.stringify(addRes)}`);
  }

  let casdoorUser: any = null;
  for (let i = 0; i < 10 && !casdoorUser?.id; i++) {
    const created = await casdoorFetch(cfg, `/get-user?id=${encodeURIComponent(`${cfg.org}/${USER_ACTOR_NAME}`)}`);
    casdoorUser = created?.data;
    if (!casdoorUser?.id) await new Promise((r) => setTimeout(r, 500));
  }
  if (!casdoorUser?.id) {
    throw new Error("[E2E] Casdoor did not return the non-admin actor after creation");
  }

  // 4. Link the user into the role's `users` list — the JWT `roles` claim
  //    is populated from role.users, not from the body `roles` field.
  const role = await getNamedRole(cfg, USER_ROLE);
  if (!role) throw new Error(`[E2E] Casdoor role ${USER_ROLE} missing after add-role`);
  await updateNamedRoleUsers(cfg, USER_ROLE, role, [`${cfg.org}/${USER_ACTOR_NAME}`]);

  // 5. Mirror into public.user_profiles — is_admin=false.
  const uuid = randomUUID();
  const now = new Date();
  await pool.query(
    `INSERT INTO public.user_profiles
     (uuid, idp_code, email, display_name, idp_org, idp_username, avatar_color, avatar_initials,
      is_active, is_admin, is_verified, email_verified, issuer, roles, last_synced_at,
      created_at, created_by, updated_at, updated_by, version,
      auth_method_enforcer_dismissed)
     VALUES ($1,$2,$3,$4,$5,$6,'#0ea5e9','TU',true,false,true,true,$7,$8,$9,$9,'e2e-setup',$9,'e2e-setup',1,true)`,
    [uuid, casdoorUser.id, USER_ACTOR_EMAIL, USER_ACTOR_DISPLAY, cfg.org, USER_ACTOR_NAME, cfg.endpoint,
     JSON.stringify([USER_ROLE]), now],
  );

  // 6. Local role_mapping — raw write + explicit cache bust (the API path
  //    would 409 because the Casdoor role already exists by then… actually
  //    no: createRole checks Casdoor FIRST — the dedicated role makes the
  //    API path viable, but a raw insert is equivalent here and keeps the
  //    setup self-contained; the DEL below forces the BE to re-read.
  await pool.query(
    `INSERT INTO public.role_mappings
     (uuid, idp_role, idp_org, permissions, is_admin,
      created_at, created_by, updated_at, updated_by, version)
     VALUES ($1,$2,$3,$4::json,false,$5,'e2e-setup',$5,'e2e-setup',1)`,
    [randomUUID(), USER_ROLE, cfg.org, JSON.stringify(USER_ROLE_PERMISSIONS), now],
  );
  await invalidateRoleMappingsCache();

  process.env.E2E_USER_USERNAME = USER_ACTOR_NAME;
  process.env.E2E_USER_PASSWORD = password;
  return { username: USER_ACTOR_NAME, password };
}

/** Destroy the ephemeral non-admin actor + its dedicated role/mapping. */
export async function destroyE2eUserActor(): Promise<void> {
  const pool = getPool();
  try {
    const cfg = await loadIdpConfig();
    const role = await getNamedRole(cfg, USER_ROLE);
    if (role) {
      const users = ((role.users as string[]) ?? []).filter((u) => u !== `${cfg.org}/${USER_ACTOR_NAME}`);
      await updateNamedRoleUsers(cfg, USER_ROLE, role, users);
    }
    await deleteCasdoorUser(cfg, USER_ACTOR_NAME);
    await deleteCasdoorRole(cfg, USER_ROLE);
  } catch (e) {
    console.warn("[E2E] Casdoor cleanup of non-admin actor failed:", e);
  }

  await pool.query(`DELETE FROM public.role_mappings WHERE idp_role = $1`, [USER_ROLE]);
  await invalidateRoleMappingsCache();
  await pool.query(
    `DELETE FROM public.user_mfa_factors WHERE user_profile_id IN
       (SELECT id FROM public.user_profiles WHERE idp_username = $1)`,
    [USER_ACTOR_NAME],
  );
  await pool.query(`DELETE FROM public.user_profiles WHERE idp_username = $1`, [USER_ACTOR_NAME]);
}
