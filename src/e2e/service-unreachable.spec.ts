/**
 * service-unreachable — the sheet watermark shown when the OWNING
 * microservice of an entity/callable cannot be reached. The contract:
 * never a silent failure or a bare generic error — the sheet opens and
 * the watermark names the responsible service + entity when the census
 * knows them, falling back to a generic message when it doesn't.
 *
 * The outage is simulated honestly at the same layer production hits:
 *   - entity.* data fetches → a 502 + RFC 7807 `SERVICE_OFFLINE` body,
 *     the exact response the BE proxy emits for a dead service (apiFetch
 *     throws ApiUnreachableError);
 *   - the mapper viewer needs no fetch — a service down removes its
 *     module from `GET /api/v1/modules`, so the spec strips `emailsender`
 *     from the discovery payload (the same shape an unregister produces).
 *
 * Verified in it-IT — the locale the watermark is reported in.
 * Conventions: e2e-browser-session.md — 5s expectation budget.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { declareTrigger, deleteTrigger } from "./helpers/job-chain";

test.use({ actionTimeout: 5000 });

const MAP = {
  requestId: { kind: "inject", inject: "uuid" },
  templateCode: { kind: "const", value: "e2e_unreach_probe" },
  to: { kind: "list", items: [{ kind: "const", value: "unreach@example.com" }] },
  variables: {
    kind: "map",
    entries: { customer_name: { kind: "path", path: "$.customer.display_name" } },
  },
  languageIso: {
    kind: "meta",
    meta: "actor_locale",
    fallback: [{ kind: "const", value: "en-US" }],
  },
};

/** The proxy's verbatim shape for a service with zero online instances —
 *  apiFetch throws ApiUnreachableError on any unreachable status, the
 *  body only decides whether a toast was already pushed. */
const SERVICE_OFFLINE_502 = {
  status: 502,
  contentType: "application/json",
  body: JSON.stringify({
    type: "https://primebrick.dev/problems/service-offline",
    title: "Service offline",
    status: 502,
    detail: "The service has no online instances.",
    internal_code: "SERVICE_OFFLINE",
  }),
};

/** Pin the UI to it-IT — sessionStorage `pb.lang` is the i18n store. */
async function pinItalian(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
  if (langNow !== "it-IT") {
    await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
}

async function enableColumn(page: import("@playwright/test").Page, key: string) {
  await page.locator('button[aria-label="Colonne"]').first().click();
  const toggle = page.getByTestId(`columns-toggle-${key}`);
  await expect(toggle).toBeVisible();
  if ((await toggle.locator('[data-state="checked"]').count()) === 0) {
    await toggle.click();
  }
  await page.keyboard.press("Escape");
}

test.describe("service unreachable watermark", () => {
  /**
   * job_schedule.trigger_uuid is `type:"ref"` → job_trigger — a job-owned
   * entity reached through `/svc/job`. A 502 on its meta fetch must name
   * BOTH the service (module census still knows `job`) and the entity.
   */
  test("entity.record — owning service down → hero interpolates service + entity", async ({
    page,
  }) => {
    await loginAsTestAdmin(page);
    await pinItalian(page);
    const { uuid } = await declareTrigger(page.request, {
      name: `e2e-unreach-sched-${Date.now()}`,
      schedule_spec: "@every 5m",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: MAP,
    });

    try {
      await page.route("**/svc/job/api/v1/entities/job_trigger/meta**", (route) =>
        route.fulfill(SERVICE_OFFLINE_502),
      );

      await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible();
      await enableColumn(page, "trigger_uuid");

      const cell = page.getByTestId("ref-cell-trigger_uuid-text").first();
      await expect(cell).toBeVisible();
      await cell.click();

      const hero = page.getByTestId("entity-record-sheet-unreachable-hero");
      await expect(hero).toBeVisible();
      // Interpolated contract: the service name precedes, the entity api
      // name follows (meta itself is unreachable → raw `job_trigger`).
      await expect(hero).toContainText(/responsabile di job_trigger non è al momento raggiungibile/);
      await expect(hero).not.toContainText("{service}");
      await expect(hero).not.toContainText("{entity}");
      // The identity block still shows the uid we tried to open.
      await expect(page.getByTestId("entity-record-sheet-uid-badge")).toBeVisible();
    } finally {
      await deleteTrigger(page.request, uuid).catch(() => {});
    }
  });

  /**
   * A BE-owned entity (`user_profile` — no `/svc/` owner in the census)
   * that 502s on meta gets the GENERIC watermark: no service name exists
   * to interpolate, so the message falls back to the generic term.
   */
  test("entity.record — unmapped owner → generic hero", async ({ page }) => {
    await loginAsTestAdmin(page);
    await pinItalian(page);
    const { uuid } = await declareTrigger(page.request, {
      name: `e2e-unreach-generic-${Date.now()}`,
      schedule_spec: "@every 5m",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: MAP,
    });

    try {
      await page.route("**/api/v1/entities/user_profile/meta**", (route) =>
        route.fulfill(SERVICE_OFFLINE_502),
      );

      await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible();
      await enableColumn(page, "trigger_uuid");

      // trigger_uuid ref → entity.record(job_trigger) — job is UP, the
      // record sheet loads; its version badge opens the audit timeline.
      await page.getByTestId("ref-cell-trigger_uuid-text").first().click();
      await expect(page.getByTestId("entity-record-sheet")).toBeVisible({ timeout: 15000 });
      await page.getByTestId("entity-record-sheet-version-badge").click();

      // The INSERT row's changed_by actor opens entity.record for
      // user_profile — a BE-owned entity whose meta now 502s.
      const actor = page.locator('[data-testid^="version-history-actor-"]').first();
      await expect(actor).toBeVisible({ timeout: 15000 });
      await actor.click();

      const hero = page.getByTestId("entity-record-sheet-unreachable-hero");
      await expect(hero).toBeVisible();
      await expect(hero).toContainText(/responsabile di questa entità non è al momento raggiungibile/);
    } finally {
      await deleteTrigger(page.request, uuid).catch(() => {});
    }
  });

  /**
   * The mapper viewer renders from the row itself — its only census
   * dependency is the callable decl for `row.target_subject`. Stripping
   * `emailsender` from `/api/v1/modules` is exactly the shape a dead
   * service produces; the sheet must then watermark the outage instead
   * of silently degrading to schema-less rows.
   */
  test("entity.mapperViewer — callable owner absent → hero names service + callable", async ({
    page,
  }) => {
    // Strip BEFORE the first census — set prior to login.
    await page.route("**/api/v1/modules**", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { modules?: { id?: string }[] };
      body.modules = (body.modules ?? []).filter((m) => m.id !== "emailsender");
      await route.fulfill({ response: res, json: body });
    });
    await loginAsTestAdmin(page);
    await pinItalian(page);
    const { uuid } = await declareTrigger(page.request, {
      name: `e2e-unreach-mapper-${Date.now()}`,
      event_subject: "crm.customer_changed",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: MAP,
    });

    try {
      await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible();
      await enableColumn(page, "payload_map");

      const row = page.locator("table tbody tr", { hasText: "e2e-unreach-mapper-" });
      await expect(row).toHaveCount(1);
      await row.getByTestId("mapper-cell-payload_map-text").click();

      const hero = page.getByTestId("mapper-viewer-unreachable-hero");
      await expect(hero).toBeVisible();
      // Service name falls back to the subject's owner code; entity is
      // the raw callable subject — both interpolated, neither raw key.
      await expect(hero).toContainText("emailsender");
      await expect(hero).toContainText("emailsender.send");
      await expect(hero).toContainText(/non è al momento raggiungibile/);
      // The endpoint badges still render — source/dest identity stays.
      await expect(page.getByTestId("mapper-viewer-dest-event")).toBeVisible();
      // …and the schema-less viewer is NOT shown underneath.
      await expect(page.getByTestId("mapper-viewer-rows")).toHaveCount(0);
    } finally {
      await deleteTrigger(page.request, uuid).catch(() => {});
    }
  });

  /**
   * The version-history sheet fetches `/:uuid/audit` on the same
   * `/svc/<owner>` path — the same 502 must produce the interpolated
   * watermark inside the panel's error region.
   */
  test("entity.versionHistory — owning service down → interpolated watermark", async ({ page }) => {
    await loginAsTestAdmin(page);
    await pinItalian(page);
    const { uuid } = await declareTrigger(page.request, {
      name: `e2e-unreach-history-${Date.now()}`,
      schedule_spec: "@every 5m",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: MAP,
    });

    try {
      await page.route("**/svc/job/api/v1/entities/job_trigger/*/audit**", (route) =>
        route.fulfill(SERVICE_OFFLINE_502),
      );

      await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible();
      await enableColumn(page, "trigger_uuid");

      // ref → entity.record(job_trigger) loads (meta unmocked); the
      // record sheet's version badge opens the audit timeline — whose
      // fetch 502s at the job proxy.
      await page.getByTestId("ref-cell-trigger_uuid-text").first().click();
      await expect(page.getByTestId("entity-record-sheet")).toBeVisible({ timeout: 15000 });
      await page.getByTestId("entity-record-sheet-version-badge").click();

      const err = page.getByTestId("version-history-error");
      await expect(err).toBeVisible({ timeout: 15000 });
      // The panel carries entities_ns + translationKey — both names
      // resolve to their TRANSLATED labels (Gestore dei Processi /
      // Attivatore), proving interpolation, not the generic fallback.
      await expect(err).toContainText(/responsabile di Attivatore non è al momento raggiungibile/);
      await expect(err).toContainText("Gestore dei Processi");
      await expect(err).not.toContainText("{service}");
      await expect(err).not.toContainText("{entity}");
    } finally {
      await deleteTrigger(page.request, uuid).catch(() => {});
    }
  });
});
