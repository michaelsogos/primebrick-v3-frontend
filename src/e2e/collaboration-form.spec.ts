/**
 * collaboration-form — the F11 update-surface merge/conflict pilot, E2E.
 *
 * Two real browser contexts, two DIFFERENT admin identities on the same
 * job_trigger detail record:
 *
 *   - Context A (e2e_test_admin)  = the observer — opens the record first,
 *                                   taints one field, never saves.
 *   - Context B (e2e_collab_admin) = the saver — opens the same record,
 *                                    changes fields, PUTs.
 *
 * PRODUCT CONTRACT under test (not implementation intent):
 *   - a detail/update page mounts the presence zone in the page header
 *     (avatar stack); the create page does NOT (no record to compare to)
 *   - B's save produces an entity-changed marker → A's UNTOUCHED field
 *     silently merges to B's value while A's TAINTED field becomes a
 *     conflict (readonly + destructive ring) — never overwritten
 *   - the status chip in the presence zone escalates to the conflict
 *     count and its popover resolves keep-mine per field
 *
 * F13 session-awareness: "self" is THIS TAB, not this user. A save is a
 * self-change only when `changed_by` AND `changed_by_session` both match —
 * a third test below opens the record in two contexts with the SAME admin
 * identity and expects the other tab to surface as a foreign writer.
 *
 * Session shape: TAB vs TAB — `browser.newContext()` × 2 on one browser
 * (isolated cookie jars, same engine). Cross-engine variants of the merge
 * contract belong to BROWSER vs BROWSER specs (see
 * docs/ai/e2e-browser-session.md "Multi-session matrix").
 *
 * Requires the full dev stack (FE 5173, BE 3001, job-handler US, NATS,
 * Redis, Postgres) — global.setup.ts enforces it. The created rule is
 * deleted in afterAll even on failure.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin, loginAsCollabAdmin } from "./helpers/admin-login";

const TS = Date.now();
const RULE_NAME = `e2e-collab-${TS}`;
const JOB_BASE = "/svc/job/api/v1/entities";
const DETAIL_PATH = (uuid: string) => `/system/job/triggers/${uuid}`;

// Serial: the fixture row is created in beforeAll and every test relies on
// it; the two-context choreography inside each test is itself sequential.
test.describe.configure({ mode: "serial" });

test.describe("collaborative update surface (job_trigger detail)", () => {
  let ruleUuid = "";
  const fixtureUuids: string[] = [];

  async function createFixture(browser: import("@playwright/test").Browser, name: string) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginAsTestAdmin(page);
      const res = await page.request.post(`${JOB_BASE}/job_trigger`, {
        data: {
          entity: {
            name,
            event_subject: "e2e.collab.fired",
            schedule_spec: "@every 1h",
            // target_subject must resolve in census.callables — the write path
            // rejects undeclared subjects (jobs.service.ts assertCallableTarget).
            target_subject: "emailsender.send",
            execution_context: "user",
            enabled: true,
          },
        },
      });
      if (res.status() !== 201) {
        const errBody = await res.text();
        throw new Error(`fixture POST rejected (${res.status()}): ${errBody}`);
      }
      const body = (await res.json()) as { uuid: string };
      fixtureUuids.push(body.uuid);
      return body.uuid;
    } finally {
      await ctx.close();
    }
  }

  test.beforeAll(async ({ browser }) => {
    ruleUuid = await createFixture(browser, RULE_NAME);
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginAsTestAdmin(page);
      for (const uuid of fixtureUuids) {
        // Re-read version — saves bumped it since creation.
        const get = await page.request.get(`${JOB_BASE}/job_trigger/${uuid}`);
        const row = (await get.json()) as { version: number };
        await page.request.delete(`${JOB_BASE}/job_trigger/${uuid}?version=${row.version}`);
      }
    } finally {
      await ctx.close();
    }
  });

  test("detail mounts presence; B's save merges untouched field + conflicts tainted field on A", async ({
    browser,
  }) => {
    test.skip(!ruleUuid, "fixture row missing — beforeAll failed");

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      // --- A opens the record, B opens the same record -------------------
      await loginAsTestAdmin(pageA);
      await pageA.goto(DETAIL_PATH(ruleUuid), { waitUntil: "domcontentloaded" });
      await expect(pageA.getByTestId("entity-form-page")).toBeVisible({ timeout: 5000 });
      const presenceZone = pageA.getByTestId("page-header-presence");
      // Design: "0 others → no avatars" — the stack renders nothing while
      // A is alone on the record (no self chip — the viewer's own
      // presence is implicit).
      await expect(presenceZone.getByTestId("presence-avatars")).toHaveCount(0);

      await loginAsCollabAdmin(pageB);
      await pageB.goto(DETAIL_PATH(ruleUuid), { waitUntil: "domcontentloaded" });
      await expect(pageB.getByTestId("entity-form-page")).toBeVisible({ timeout: 5000 });

      // B's READING signal lands on A's snapshot → stack appears: one
      // other-avatar (B). No self chip exists anymore.
      await expect(presenceZone.getByTestId("presence-avatar")).toHaveCount(1, {
        timeout: 5000,
      });
      await expect(presenceZone.getByTestId("presence-self")).toHaveCount(0);

      // --- A taints schedule_spec locally (no save) ----------------------
      const aSpec = pageA.getByTestId("entity-form-field-schedule_spec");
      await aSpec.locator("input").first().fill("@every 9h");

      // --- B edits name + schedule_spec and saves ------------------------
      const bName = `e2e-collab-${TS}-B`;
      await pageB.getByTestId("entity-form-field-name").locator("input").fill(bName);
      await pageB
        .getByTestId("entity-form-field-schedule_spec")
        .locator("input")
        .first()
        .fill("@every 6h");
      const putCapture = pageB.waitForResponse(
        (r) => r.url().includes("/entities/job_trigger/") && r.request().method() === "PUT",
        { timeout: 5000 },
      );
      await pageB.getByTestId("entity-form-submit").click();
      expect((await putCapture).status()).toBe(200);

      // --- A: silent merge on the UNTOUCHED name field -------------------
      // The marker lands over SSE; the audit-diff fetch + merge is async —
      // assert the field eventually holds B's value.
      await expect(
        pageA.getByTestId("entity-form-field-name").locator("input"),
      ).toHaveValue(bName, { timeout: 5000 });

      // --- A: the tainted schedule_spec became a CONFLICT ----------------
      // It keeps A's draft, goes readonly + destructive ring, and the chip
      // escalates to the conflict variant with count 1.
      await expect(aSpec).toHaveClass(/ring-destructive/, { timeout: 5000 });
      await expect(aSpec.locator("input").first()).toHaveAttribute("readonly", "");
      await expect(aSpec.locator("input").first()).toHaveValue("@every 9h");
      const chip = pageA.getByTestId("presence-status-chip");
      await expect(chip).toBeVisible();
      await expect(chip).toHaveClass(/text-destructive/);

      // --- A: resolve via the chip popover (keep mine) -------------------
      await chip.click();
      const popover = pageA.getByTestId("presence-status-popover");
      await expect(popover).toBeVisible();
      const row = popover.locator("li", { hasText: "schedule_spec" });
      await expect(row).toHaveCount(1);
      await row.locator("button").first().click(); // keep_mine

      // Conflict cleared — field editable again, still holds A's value.
      await expect(aSpec).not.toHaveClass(/ring-destructive/);
      await expect(aSpec.locator("input").first()).not.toHaveAttribute("readonly", "");
      await expect(aSpec.locator("input").first()).toHaveValue("@every 9h");
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test("same user in a second tab surfaces as 'you — other tab' + merges as foreign", async ({
    browser,
  }) => {
    // Own fixture record — the previous test's presence lives on a different
    // entity:uuid channel, so no stale entries can leak in here and no decay
    // wait is needed (presence channels are per-record).
    const uuid2 = await createFixture(browser, `e2e-collab2-${TS}`);

    // SAME identity in both contexts — different browser contexts →
    // different sessionStorage → different tab session ids.
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      await loginAsTestAdmin(pageA);
      await pageA.goto(DETAIL_PATH(uuid2), { waitUntil: "domcontentloaded" });
      await expect(pageA.getByTestId("entity-form-page")).toBeVisible({ timeout: 5000 });
      const presenceZone = pageA.getByTestId("page-header-presence");
      // Fresh record — A is alone, the stack stays empty.
      await expect(presenceZone.getByTestId("presence-avatar")).toHaveCount(0);

      // Same user, second context → A must SEE the duplicate session.
      await loginAsTestAdmin(pageB);
      await pageB.goto(DETAIL_PATH(uuid2), { waitUntil: "domcontentloaded" });
      await expect(pageB.getByTestId("entity-form-page")).toBeVisible({ timeout: 5000 });

      const otherTabAvatar = presenceZone.getByTestId("presence-avatar");
      await expect(otherTabAvatar).toHaveCount(1, { timeout: 5000 });
      await expect(presenceZone.getByTestId("presence-self")).toHaveCount(0);
      // Same user proof: the "other" avatar carries MY user uuid (from
      // /auth/me) and its tooltip labels it as my other tab
      // (en "other tab" / it "scheda").
      const selfUuid = await pageA.evaluate(async () => {
        const me = await fetch("/api/v1/auth/me").then((r) => r.json());
        return me.uuid as string;
      });
      await expect(otherTabAvatar).toHaveAttribute("data-presence-user", selfUuid!);
      await expect(otherTabAvatar).toHaveAttribute("title", /tab|scheda/i);

      // B edits + saves → A's form treats it as a foreign writer: the
      // untouched field merges and the merge chip appears (no conflict —
      // A tainted nothing).
      const bName = `e2e-sametab-${TS}`;
      await pageB.getByTestId("entity-form-field-name").locator("input").fill(bName);
      const putCapture = pageB.waitForResponse(
        (r) => r.url().includes("/entities/job_trigger/") && r.request().method() === "PUT",
        { timeout: 5000 },
      );
      await pageB.getByTestId("entity-form-submit").click();
      expect((await putCapture).status()).toBe(200);

      await expect(
        pageA.getByTestId("entity-form-field-name").locator("input"),
      ).toHaveValue(bName, { timeout: 5000 });
      const chip = pageA.getByTestId("presence-status-chip");
      await expect(chip).toBeVisible();
      // Soft merge variant — not the destructive conflict chip.
      await expect(chip).not.toHaveClass(/text-destructive/);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test("create page mounts NO presence (nothing to compare against)", async ({
    page,
  }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/triggers/create", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-form-page")).toBeVisible({ timeout: 5000 });
    // The presence zone renders in the header but stays EMPTY on create —
    // no record uuid, no channel, no avatars, no chip.
    await expect(page.getByTestId("presence-avatars")).toHaveCount(0);
    await expect(page.getByTestId("presence-status-chip")).toHaveCount(0);
  });
});
