/**
 * module census — uiLang switch mid-flight must VOID the stale-lang
 * request and fire the correct GET immediately (abort, never
 * wait-for-the-previous-one).
 *
 * The race being proven:
 *   R1 `GET /api/v1/modules?lang=en-GB` in-flight (held by interception)
 *   → uiLang switches to it-IT
 *   → R1 is aborted (its response never lands)
 *   → R2 `GET /api/v1/modules?lang=it-IT` fires WHILE R1 is still held
 * Without the abort design, R2 would never exist and nav labels would
 * stay resolved for en-GB until the next trigger.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.use({ actionTimeout: 5000 });

test("uiLang switch mid-census aborts the stale request and refetches for the new lang", async ({
  page,
}) => {
  // Hold the FIRST /api/v1/modules request; later ones pass through.
  let releaseFirst!: () => void;
  let markSeen!: () => void;
  const gate = new Promise<void>((res) => (releaseFirst = res));
  const seen = new Promise<void>((res) => (markSeen = res));
  let held = true;
  await page.route(/\/api\/v1\/modules\?/, async (route) => {
    if (held) {
      held = false;
      markSeen();
      await gate;
      // May throw once the client aborted the held request — harmless.
      await route.continue().catch(() => {});
      return;
    }
    await route.continue();
  });

  // A client-side abort surfaces as requestfailed (net::ERR_ABORTED) —
  // the canonical signal that the stale-lang GET was voided.
  let firstAborted = false;
  page.on("requestfailed", (req) => {
    if (req.url().includes("/api/v1/modules") && req.url().includes("lang=en-GB")) {
      firstAborted = true;
    }
  });

  // Pin en-GB so the first census resolves en-GB labels.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => sessionStorage.setItem("pb.lang", "en-GB"));

  const login = loginAsTestAdmin(page); // resolves on redirect; census R1 stays held
  await seen; // R1 is in-flight now

  // Register the R2 watcher BEFORE the switch — the aborted replacement
  // fires within the same task, ahead of any later listener.
  const itCensus = page.waitForRequest(
    (req) => req.url().includes("/api/v1/modules") && req.url().includes("lang=it-IT"),
    { timeout: 5_000 },
  );

  // Switch the UI language mid-flight through the real i18n store
  // (Vite serves the module — same globalThis singleton the app uses).
  // Non-literal specifier: the URL is resolved by the dev server, not tsc.
  await page.evaluate(async (storeUrl) => {
    const mod = (await import(/* @vite-ignore */ storeUrl)) as {
      setUiLang: (lang: "it-IT") => void;
    };
    mod.setUiLang("it-IT");
  }, "/src/lib/i18n/store.svelte.ts");

  // R2 must fire while R1 is STILL held — the correct GET does not wait.
  await itCensus;

  // Release the held R1 — its continue must fail: the client aborted it.
  releaseFirst();
  await expect
    .poll(() => firstAborted, { timeout: 5_000 })
    .toBe(true);

  await login;
});
