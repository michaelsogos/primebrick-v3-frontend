import { execSync } from "node:child_process";
import { existsSync, rmSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

/**
 * Shared harness for specs that need the real Edge browser (WebGPU /
 * transformers.js paths). ONE implementation — the per-spec copies drifted
 * and caused the recurring "Edge opens on about:blank + stale restored tab"
 * failure class.
 *
 * Determinism contract:
 * - Profile is sanitized before every launch: session-restore artifacts are
 *   deleted so Edge can never resurrect tabs from a previous run.
 * - Work tabs are NEVER `context.pages()[0]` — that grabs a restored or
 *   shared tab. `focusedPage()` gives each worker its own fresh, focused
 *   tab; other workers' tabs in the shared CDP session are left untouched.
 */

export const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";
export const CDP_URL = "http://127.0.0.1:9333";

const log = (msg: string) =>
  console.log(`[edge-ctx ${new Date().toISOString().slice(11, 19)}] ${msg}`);

// ─── Launch mutex ────────────────────────────────────────────────────────────
// Parallel workers race the launch: connectOverCDP fails while Edge is still
// binding :9333, so a second worker launches on the SAME profile — its
// zombie-kill then destroys the first worker's browser. A lockfile serializes
// the launch: exactly one worker launches, the rest wait for CDP and attach.
const LAUNCH_LOCK = join(E2E_PROFILE, ".launch.lock");
const LOCK_STALE_MS = 90_000;

function tryAcquireLaunchLock(): boolean {
  try {
    mkdirSync(E2E_PROFILE, { recursive: true });
    writeFileSync(LAUNCH_LOCK, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      if (Date.now() - statSync(LAUNCH_LOCK).mtimeMs > LOCK_STALE_MS) {
        rmSync(LAUNCH_LOCK, { force: true });
        return tryAcquireLaunchLock();
      }
    } catch {
      /* lock vanished between checks — fall through */
    }
    return false;
  }
}

function releaseLaunchLock(): void {
  rmSync(LAUNCH_LOCK, { force: true });
}

/** Poll until the CDP endpoint answers (Edge binds it a few s after spawn). */
async function waitForCdp(timeoutMs: number): Promise<BrowserContext | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
      const ctx = browser.contexts()[0];
      if (ctx) {
        log("attached to running Edge session (CDP :9333)");
        return ctx;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

/** Kill Edge processes holding the E2E profile — test-owned, safe to kill. */
export function killEdgeZombies(): void {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { \\$_.CommandLine -like '*pw-edge-profile*' } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force }"`,
      { timeout: 20_000, stdio: "ignore" },
    );
    log("killed zombie pw-edge-profile Edge processes");
  } catch {
    /* none running or query failed — proceed */
  }
}

/**
 * Delete session-restore artifacts from the profile so Edge starts with a
 * single fresh tab — never resurrects tabs from a previous (possibly crashed)
 * run. Without this, Edge "remembers tabs" and pages()[0] is a stale tab or
 * about:blank while the real content sits in a restored tab we don't control.
 */
export function sanitizeEdgeProfileSession(): void {
  const def = join(E2E_PROFILE, "Default");
  if (!existsSync(def)) return;
  // NOTE: "Session Storage" is NOT in this list — it is per-origin app state
  // (the FE keeps its session token there), not a tab-restore artifact.
  // Wiping it destroys the human-authenticated session that some specs
  // (smart-regex-model-selector) rely on.
  const targets = [
    "Sessions",
    "Current Session",
    "Current Tabs",
    "Last Session",
    "Last Tabs",
  ];
  for (const name of targets) {
    try {
      rmSync(join(def, name), { recursive: true, force: true });
    } catch {
      /* locked or absent — non-fatal */
    }
  }
  // Snapshot/session leftovers live at the profile root too
  try {
    for (const f of readdirSync(def)) {
      if (/^(Snapshots|Session).*/i.test(f)) {
        rmSync(join(def, f), { recursive: true, force: true });
      }
    }
  } catch {
    /* non-fatal */
  }
}

export async function launchEdge(): Promise<BrowserContext> {
  killEdgeZombies();
  sanitizeEdgeProfileSession();
  log("launching new persistent Edge session (CDP :9333)");
  return chromium.launchPersistentContext(E2E_PROFILE, {
    channel: "msedge",
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [
      "--remote-debugging-port=9333",
      "--hide-crash-restore-bubble",
      "--disable-session-crashed-bubble",
      "--no-first-run",
    ],
  });
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

/**
 * Verify a freshly-launched session BEFORE the launch lock is released. A
 * fresh Edge occasionally boots with a dead renderer or a wedged network
 * service (app shows "Offline", in-page fetches hang while curl works).
 * Callers holding attached tabs can only fail on a wedged session — a spec
 * that relaunches the shared context kills every other worker's page. The
 * launch lock is the ONLY safe window to relaunch: no other worker has
 * attached yet.
 */
async function probeFreshContext(context: BrowserContext): Promise<boolean> {
  let page: Page | undefined;
  try {
    page = await context.newPage();
    const alive = await Promise.race([
      page.evaluate(() => true).then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), 15_000)),
    ]);
    if (!alive) return false;
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 20_000 });
    return await page.evaluate(() =>
      fetch("/api/v1/health", { signal: AbortSignal.timeout(5000) })
        .then((r) => r.ok)
        .catch(() => false),
    );
  } catch {
    return false;
  } finally {
    await page?.close().catch(() => {});
  }
}

/**
 * Get the shared Edge context. Deterministic under parallel workers:
 * 1. CDP already up → attach.
 * 2. Otherwise serialize launches through a lockfile — ONE worker launches
 *    (zombie-kill + profile sanitize + launchPersistentContext + health
 *    probe; a wedged fresh session is relaunched inside the lock), the rest
 *    poll CDP and attach. `launched` tells the caller the context is fresh.
 *
 * Callers must NEVER `context.close()` the returned context — it is the
 * shared browser for every attached worker. If a page misbehaves, fail the
 * test; never relaunch.
 */
export async function getSharedContext(
  cdpTimeoutMs = 60_000,
): Promise<{ context: BrowserContext; launched: boolean }> {
  const attached = await waitForCdp(8000);
  if (attached) return { context: attached, launched: false };

  const deadline = Date.now() + cdpTimeoutMs;
  while (Date.now() < deadline) {
    if (tryAcquireLaunchLock()) {
      try {
        // Re-check under the lock — the previous holder may have just
        // finished launching; launching again would kill its session via
        // killEdgeZombies. This is THE race that must not reopen. 8s: Edge
        // binds the CDP port a few seconds after launch resolves.
        const ctx = await waitForCdp(8000);
        if (ctx) return { context: ctx, launched: false };
        let fresh = await launchEdge();
        if (!(await probeFreshContext(fresh))) {
          log("fresh session wedged — relaunching once inside the launch lock");
          await fresh.close().catch(() => {});
          fresh = await launchEdge();
        }
        return { context: fresh, launched: true };
      } finally {
        releaseLaunchLock();
      }
    }
    const ctx = await waitForCdp(5000);
    if (ctx) return { context: ctx, launched: false };
  }
  // Last resort: the holder died without releasing — steal and launch.
  rmSync(LAUNCH_LOCK, { force: true });
  return { context: await launchEdge(), launched: true };
}

/**
 * The worker's OWN tab — never pages()[0]. Every worker attached to the
 * shared CDP session gets a dedicated newPage brought to front, so parallel
 * specs never drive the same tab and restored/stale tabs can't be picked.
 */
export async function focusedPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.bringToFront();
  return page;
}
