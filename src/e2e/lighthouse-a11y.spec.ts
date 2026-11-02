/**
 * Lighthouse accessibility audit — ONE spec, one test per route.
 *
 * Architecture (empirically the most robust):
 * - Actors: minted/destroyed by global.setup/teardown (e2e_test_admin —
 *   NEVER the dev admin). Credentials arrive via E2E_ADMIN_* env vars.
 * - Auth: a plain POST /api/v1/auth/login in beforeAll returns the session
 *   Set-Cookie — no browser login flow at all. The Cookie header is handed
 *   to every LH run via --extra-headers (JSON file), so authenticated
 *   routes render for real without playwright pages or tab churn.
 * - Browser: Lighthouse attaches to the shared Edge session on CDP :9333
 *   (--port=9333), headed — same browser the E2E harness owns. The spec
 *   opens ZERO playwright tabs; LH's own audit targets are swept after
 *   each run so the window never piles up.
 * - Serial by design: the spec lives in the edge-ai project (workers:1) —
 *   parallel LH runs on one browser would race tabs and sessions.
 *
 * Determinism: every LH run is bounded by execFile timeout — a silent run
 * is a failed run, never waited on.
 *
 * Routes mirror scripts/axe-audit.mjs ROUTES. LH_ROUTES (comma-separated)
 * filters for smoke runs. Output:
 *   public/vpat/lighthouse/<slug>.report.json|.html + summary.json
 */
import { test } from "@playwright/test";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { getSharedContext } from "./helpers/edge-context";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./helpers/admin-login";
import {
  deleteMfaFactorsByUsername,
  setAuthMethodEnforcerDismissed,
} from "./helpers/db";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const OUT_DIR = join(process.cwd(), "public", "vpat", "lighthouse");
const LH_TIMEOUT_MS = 150_000;
const TEST_TIMEOUT_MS = 240_000;

// Mirror of scripts/axe-audit.mjs ROUTES — consolidate into a shared list
// when the lighthouse pipeline graduates beyond the pilot.
const ROUTES: string[] = [
  "/",
  "/login",
  "/welcome",
  "/mcp/consent",
  "/customers",
  "/customers/new",
  "/crm/pipeline",
  "/system/settings",
  "/system/settings/profile",
  "/system/settings/security",
  "/system/settings/users",
  "/system/settings/users/create",
  "/system/settings/organizations",
  "/system/settings/organizations/create",
  "/system/settings/email-providers",
  "/system/settings/modules",
  "/system/settings/modules/showcase",
  "/system/settings/templates",
];

// LH_ROUTES filter — tolerant matching so "login", "/login", and an
// MSYS-mangled "C:/Program Files/Git/system/settings" all resolve.
const wanted = (process.env.LH_ROUTES ?? "")
  .split(",")
  .map((s) => s.trim().replace(/\\/g, "/"))
  .filter(Boolean);
const routes = wanted.length
  ? ROUTES.filter((r) => wanted.some((w) => r === w || `/${w}` === r || w.endsWith(r)))
  : ROUTES;
if (!routes.length) {
  throw new Error(
    `[lighthouse-a11y] LH_ROUTES matched no known routes: ${process.env.LH_ROUTES}`,
  );
}

const slug = (r: string) => (r === "/" ? "root" : r.replace(/^\//, "").replace(/\//g, "-"));

const require_ = createRequire(import.meta.url);
// lighthouse/package.json is not in its `exports` map — resolve the main
// entry (core/index.js) and walk up to the package root for cli/index.js.
const LH_CLI = join(
  dirname(require_.resolve("lighthouse")),
  "..",
  "cli",
  "index.js",
);

// Session cookie for --extra-headers — lives under test-results (gitignored),
// never inside public/: it is a live credential and must not be committable.
const HEADERS_FILE = join(process.cwd(), "test-results", "lighthouse-session-headers.json");

interface RouteResult {
  route: string;
  final_url: string | null;
  score: number | null;
  failing_audits: { id: string; items: number }[];
  error: string | null;
}

const results: RouteResult[] = [];
let sharedContext: import("@playwright/test").BrowserContext | null = null;
let pagesBefore = new Set<import("@playwright/test").Page>();

/** Close tabs LH spawned during a run — pre-existing tabs (incl. the
 *  user's own) are never touched. */
async function sweepLhTabs(): Promise<void> {
  if (!sharedContext) return;
  for (const p of sharedContext.pages()) {
    if (!pagesBefore.has(p)) await p.close().catch(() => {});
  }
  pagesBefore = new Set(sharedContext.pages());
}

function runLighthouse(url: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [
        LH_CLI, url,
        "--only-categories=accessibility",
        "--port=9333",
        "--quiet",
        "--max-wait-for-load=30000",
        `--extra-headers=${HEADERS_FILE}`,
        `--output-path=${outPath}`,
        "--output=json", "--output=html",
      ],
      { timeout: LH_TIMEOUT_MS },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(`lighthouse exit ${err.code ?? err.message}: ${stderr.slice(-400)}`));
        else resolve();
      },
    );
  });
}

test.describe("lighthouse accessibility audit", () => {
  test.describe.configure({ timeout: TEST_TIMEOUT_MS });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername(E2E_ADMIN_USERNAME);
    await setAuthMethodEnforcerDismissed(E2E_ADMIN_USERNAME, true);
    mkdirSync(OUT_DIR, { recursive: true });

    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: E2E_ADMIN_USERNAME, password: E2E_ADMIN_PASSWORD }),
    });
    if (!res.ok) {
      throw new Error(`[lighthouse] actor login failed ${res.status}: ${await res.text()}`);
    }
    const cookieHeader = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    if (!cookieHeader) throw new Error("[lighthouse] login returned no Set-Cookie");
    writeFileSync(HEADERS_FILE, JSON.stringify({ Cookie: cookieHeader }));
    console.log("[lighthouse] session cookie acquired via /api/v1/auth/login");
  });

  for (const route of routes) {
    test(`a11y ${route}`, async () => {
      const { context } = await getSharedContext();
      sharedContext = context;
      pagesBefore = new Set(context.pages());

      const outPath = join(OUT_DIR, slug(route));
      try {
        await runLighthouse(`${BASE_URL}${route}`, outPath);
      } catch (e) {
        results.push({ route, final_url: null, score: null, failing_audits: [], error: String(e) });
        await sweepLhTabs();
        throw e;
      }
      await sweepLhTabs();

      const report = JSON.parse(readFileSync(`${outPath}.report.json`, "utf8"));
      const failing = Object.values(report.audits as Record<string, any>)
        .filter((a) => a.score !== null && a.score < 1)
        .map((a) => ({ id: a.id, items: a.details?.items?.length ?? 0 }));
      results.push({
        route,
        final_url: report.finalDisplayedUrl ?? null,
        score: report.categories?.accessibility?.score ?? null,
        failing_audits: failing,
        error: null,
      });
      console.log(
        `[lighthouse] ${route} → score ${report.categories?.accessibility?.score ?? "?"} ` +
          `(${failing.length} failing audits)`,
      );
    });
  }

  test.afterAll(() => {
    if (!results.length) return;
    const scored = results.filter((r) => r.score !== null);
    const summary = {
      audit_date: new Date().toISOString(),
      base_url: BASE_URL,
      tool: "lighthouse",
      mean_score: scored.reduce((s, r) => s + (r.score ?? 0), 0) / (scored.length || 1),
      routes: results,
    };
    writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(`[lighthouse] summary → ${join(OUT_DIR, "summary.json")}`);
  });
});
