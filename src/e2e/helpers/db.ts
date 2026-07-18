/**
 * E2E DB helper — direct Postgres access for test assertions and cleanup.
 *
 * The E2E tests need to:
 *   - Read the OTP / invitation token from `emailsender.sender_log`
 *     (the emailsender microservice writes rendered email bodies there).
 *   - Clean up test data (users, invitations, sender_log rows) after each run.
 *
 * This helper opens a single `pg` Pool per test run and exposes focused
 * query functions. The pool is closed by the global teardown.
 *
 * Connection string: `DATABASE_URL` env var, defaulting to the local dev
 * Postgres (matches `primebrick-be-v3/.env` and `primebrick-us-v3/emailsender/.env`).
 */
import { Pool, type PoolClient } from "pg";

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://primebrick:primebrick_dev@127.0.0.1:5432/primebrick";

let pool: Pool | null = null;

/** Get the shared Pool (lazily created on first call). */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

/** Close the shared Pool. Called by global teardown. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ─── sender_log queries ─────────────────────────────────────────────────────

/**
 * Find the most recent `sender_log` row for a given recipient email and
 * template code. Returns the row's `interpolated_sent_message` (rendered HTML
 * body) and `sent_at`, or null if no matching row exists.
 *
 * The emailsender writes one row per send attempt (success or failure). The
 * `recipients` jsonb column has shape `{ to: [email, ...], cc, bcc }`. We
 * filter with the `?` jsonb operator (recipient email appears in the `to` array).
 */
export async function findEmailLog(
  recipientEmail: string,
  templateCode?: string,
  timeoutMs = 15000,
): Promise<{ interpolated_sent_message: string | null; sent_at: Date | null } | null> {
  const pool = getPool();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await pool.query(
      `SELECT interpolated_sent_message, sent_at
       FROM emailsender.sender_log
       WHERE recipients->>'to' ? $1
         ${templateCode ? "AND template_uuid IN (SELECT uuid FROM emailsender.email_templates WHERE code = $2)" : ""}
       ORDER BY sent_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      templateCode ? [recipientEmail, templateCode] : [recipientEmail],
    );
    if (res.rows.length > 0) {
      return {
        interpolated_sent_message: res.rows[0].interpolated_sent_message as string | null,
        sent_at: res.rows[0].sent_at as Date | null,
      };
    }
    await sleep(500);
  }
  return null;
}

/**
 * Delete all `sender_log` rows for a given recipient email. Used in test
 * cleanup to avoid log accumulation across runs.
 */
export async function deleteEmailLogsForRecipient(recipientEmail: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `DELETE FROM emailsender.sender_log WHERE recipients->>'to' ? $1`,
    [recipientEmail],
  );
}

// ─── Upsert fake Brevo provider row ─────────────────────────────────────────

/**
 * Upsert the `emailsender.providers` row pointing at the fake Brevo server.
 * Called by global setup before the test run starts. The emailsender reads
 * this row to construct its BrevoClient.
 */
export async function upsertFakeBrevoProvider(
  fakeEndpoint: string,
  apiKey = "fake",
  fromEmail = "test@primebrick.local",
): Promise<void> {
  const pool = getPool();
  // The providers table is auditable (created_by, updated_by required).
  // Use 'system' as the actor for the seed.
  await pool.query(
    `INSERT INTO emailsender.providers
       (uuid, provider, api_key, api_endpoint, from_email, from_name, reply_to,
        created_by, updated_by, version)
     VALUES (gen_random_uuid(), 'brevo', $1, $2, $3, 'Primebrick E2E', NULL,
        'system', 'system', 1)
     ON CONFLICT (provider) DO UPDATE SET
       api_key = EXCLUDED.api_key,
       api_endpoint = EXCLUDED.api_endpoint,
       from_email = EXCLUDED.from_email,
       updated_at = now(),
       updated_by = 'system',
       version = emailsender.providers.version + 1`,
    [apiKey, fakeEndpoint, fromEmail],
  );
}

// ─── Test user cleanup ──────────────────────────────────────────────────────

/**
 * Delete a test user from the Primebrick `user_profiles` table.
 * Soft-delete is the BE convention, but for E2E cleanup we hard-delete to
 * avoid accumulation. The Casdoor-side user is deleted via the BE API
 * (admin DELETE /api/v1/auth/users/:uuid) in the test itself; this function
 * is a safety net for the local DB row.
 */
export async function deleteUserProfileByEmail(email: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `DELETE FROM primebrick.user_profiles WHERE email = $1`,
    [email],
  );
}

/**
 * Delete a test invitation by recipient email. Used in cleanup to remove
 * any leftover invitation rows from a failed/aborted test run.
 */
export async function deleteInvitationByEmail(email: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `DELETE FROM primebrick.user_invitations WHERE email = $1`,
    [email],
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Acquire a raw client for custom queries (advanced cleanup). */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}
