/**
 * entity-events-choreography — the cross-service reaction loop, end to end:
 *
 *   UI form creates an EVENT-SOURCED immediate trigger
 *     → JH refreshes the trigger and binds a durable ENTITY_EVENTS consumer
 *     → a SECOND job_trigger created via the entity API makes the job
 *       service's DAL auto-emit `events.job.job_trigger.<uuid>` (schema 1)
 *     → the durable consumer delivers it → dispatch → due trampoline
 *     → a `job.job_runs` row lands `dispatched`.
 *
 * PRODUCT CONTRACT under test (not implementation intent):
 *   - `events.<svc>.<entity>.>` subjects are census-declared emits — the
 *     create form offers them in the closed event_subject combo (no
 *     hand-declaration in any service code)
 *   - governed entity writes emit entity events automatically — the dummy
 *     trigger's own CREATE produces the event; nothing in the test
 *     publishes on `events.*` directly
 *   - JH is the only consumer and the binding is a durable JetStream
 *     consumer on ENTITY_EVENTS (not a core subscription)
 *   - an event-source trigger with NO schedule_spec dispatches
 *     immediately through the jobs.due trampoline into job_runs
 *
 * The choreography trigger targets `crm.emit_fake_event` — a callable
 * that exists in the census and never sends real traffic.
 * Residue-free: both trigger rows are deleted via the entity API at the
 * end, pass or fail.
 */
import { test, expect } from "@playwright/test";
import { jetstreamManager } from "@nats-io/jetstream";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { getPool } from "./helpers/db";
import { getNats } from "./helpers/nats";

const TS = Date.now();
const TRIG_NAME = `e2e-evt-choreo-${TS}`;
const DUMMY_NAME = `e2e-evt-dummy-${TS}`;
const JOB_BASE = "/svc/job/api/v1/entities";
const EVENT_SUBJECT = "events.job.job_trigger.>";
const EVENTS_STREAM = "ENTITY_EVENTS";

test.describe.configure({ mode: "serial" });

test.describe("entity events choreography — trigger authored in the browser", () => {
  let trigUuid = "";
  let trigVersion = 0;
  let dummyUuid = "";
  let dummyVersion = 0;

  test("create the event-sourced trigger via the UI form → durable consumer binds", async ({
    page,
    context,
  }) => {
    await loginAsTestAdmin(page);

    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 15000 }),
      page.getByTestId("entity-create-cta").click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.getByTestId("entity-form-page")).toBeVisible({ timeout: 30000 });

    await popup.getByTestId("entity-form-field-name").locator("input").fill(TRIG_NAME);

    // event_subject — the combo is closed to census-declared emits; the
    // auto-declared events.job.job_trigger.> MUST be offered (proves the
    // service declared its own entity lane without hand-written emits).
    const eventField = popup.getByTestId("entity-form-field-event_subject");
    await eventField.locator('[role="combobox"]').click();
    const eventOption = popup
      .locator('[role="option"]:visible')
      .filter({ hasText: EVENT_SUBJECT });
    await expect(eventOption.first()).toBeVisible({ timeout: 10000 });
    await eventOption.first().click();
    await popup.keyboard.press("Escape");

    // Immediate trigger — schedule_spec stays EMPTY. Clear whatever the
    // control pre-filled so the row persists null.
    const schedInput = popup
      .getByTestId("entity-form-field-schedule_spec")
      .locator("input")
      .first();
    await schedInput.fill("");
    await schedInput.blur();

    // target_subject — declared callables only; emit_fake_event is safe.
    await popup
      .getByTestId("entity-form-field-target_subject")
      .locator('[role="combobox"]')
      .click();
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: "crm.emit_fake_event" })
      .first()
      .click();
    await popup.keyboard.press("Escape");

    // payload_map — the callable contract requires `event` (enum): fixed
    // value events.crm.customer.on.changed, same as the lifecycle archetype spec.
    const eventRow = popup.getByTestId("payload-map-row-event");
    await eventRow.locator('[role="combobox"]').first().click({ position: { x: 8, y: 18 } });
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: /fixed value|valore fisso|constant|costante/i })
      .first()
      .click();
    await eventRow.locator('[role="combobox"]').nth(1).click({ position: { x: 8, y: 18 } });
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: "events.crm.customer.on.changed" })
      .first()
      .click({ force: true });
    await popup.keyboard.press("Escape");

    // run_as "system" — deterministic lane, no author resolution needed.
    const runAsField = popup.getByTestId("entity-form-field-run_as");
    if ((await runAsField.count()) > 0) {
      await runAsField.locator('[role="combobox"]').click();
      await popup
        .locator('[role="option"]:visible')
        .filter({ hasText: /^system$|system/i })
        .first()
        .click()
        .catch(() => popup.keyboard.press("Escape"));
      await popup.keyboard.press("Escape");
    }

    // filter — the rule_filter composer navigates the source payload
    // schema as a PropNavigator tree: `$.event` is the envelope,
    // `$.entity` the state section — columns (x_label_key-labeled)
    // inside `$.entity.after`. `$.event.action` is the enum leaf —
    // pick it, keep eq, choose `create`, commit the badge.
    const filterField = popup.getByTestId("entity-form-field-filter");
    // Anatomy contract — the composer renders field · op · value · add on
    // one row up-front; the cascade is carried by disabled state, never
    // by conditional reveal. Event is already selected (schema loaded)
    // so the field picker is enabled; op + value + add wait on the pick.
    const rfField = filterField.getByTestId("rule-filter-field");
    const rfOp = filterField.getByTestId("rule-filter-op");
    const rfValue = filterField.getByTestId("rule-filter-value");
    const rfAdd = filterField.getByTestId("rule-filter-add");
    await expect(rfField).toBeVisible();
    await expect(rfOp).toBeVisible();
    await expect(rfValue).toBeVisible();
    await expect(rfAdd).toBeVisible();
    await expect(rfField).not.toHaveAttribute("aria-disabled", "true");
    await expect(rfOp).toHaveAttribute("aria-disabled", "true");
    await expect(rfValue).toBeDisabled();
    await expect(rfAdd).toBeDisabled();
    // Empty state — no criteria committed yet.
    await expect(filterField.getByTestId("rule-filter-empty")).toContainText(
      /no filters applied|nessun filtro applicato/i,
    );
    await rfField.click();
    const navPopover = popup.locator('[data-slot="popover-content"]:visible').last();
    const col0 = navPopover.locator('[data-propnv-col="0"]');
    await expect(col0.locator('[data-propnv-path="$.event"]')).toBeVisible();
    // `$.entity.after` descends into the typed entity snapshot.
    await col0.locator('[data-propnv-path="$.entity"]').click();
    const col1 = navPopover.locator('[data-propnv-col="1"]');
    await col1.locator('[data-propnv-path="$.entity.after"]').click();
    const col2 = navPopover.locator('[data-propnv-col="2"]');
    await expect(col2.locator('[data-propnv-path="$.entity.after.name"]')).toBeVisible();
    // `$.event.action` is a leaf — descend then click commits the path.
    await col0.locator('[data-propnv-path="$.event"]').click();
    await navPopover.locator('[data-propnv-col="1"]').locator('[data-propnv-path="$.event.action"]').click();
    // Wait for the navigator popover to fully close before opening the
    // value combo: an open navigator overlay would swallow the click.
    await expect(navPopover).toBeHidden();
    // Cascade released downstream of the field pick; add still waits on
    // the value (op defaults to eq).
    await expect(rfOp).not.toHaveAttribute("aria-disabled", "true");
    await expect(rfValue).not.toHaveAttribute("aria-disabled", "true");
    await expect(rfAdd).toBeDisabled();
    // `action` carries an enum → the value control is a closed combo
    // (bits-ui Command.Item → role="option"; substring text — the item
    // innerText carries layout whitespace that defeats ^…$ anchors).
    await filterField.getByTestId("rule-filter-value").click();
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: "create" })
      .first()
      .click();
    await expect(rfAdd).toBeEnabled();
    await rfAdd.click();
    await expect(filterField.getByTestId("rule-filter-badges")).toContainText(/action/i);
    await expect(filterField.getByTestId("rule-filter-empty")).toBeHidden();
    // JSON preview — collapsed behind its accordion toggle; opening it
    // renders the committed wire document.
    const previewToggle = filterField.getByTestId("json-value-preview-toggle");
    await expect(previewToggle).toBeVisible();
    await expect(filterField.getByTestId("json-value-preview")).toBeHidden();
    await previewToggle.click();
    await expect(filterField.getByTestId("json-value-preview")).toContainText(/event\.action/);

    await expect(popup.getByTestId("entity-form-submit")).toBeEnabled();
    const postCapture = popup.waitForResponse(
      (r) => r.url().includes("/entities/job_trigger") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await popup.getByTestId("entity-form-submit").click();
    const postRes = await postCapture;
    expect(postRes.status()).toBe(201);
    // The composer serialized the badge back to the RuleFilter[] wire —
    // event.action=create is what test 2's emitted event matches on.
    const postedBody = postRes.request().postDataJSON() as { entity?: Record<string, unknown> };
    const postedRaw = postedBody.entity?.filter;
    const postedFilter = typeof postedRaw === "string" ? JSON.parse(postedRaw) : postedRaw;
    expect(postedFilter).toEqual([{ field: "event.action", op: "eq", value: "create" }]);
    await popup.waitForEvent("close", { timeout: 15000 });
    await expect(page.locator("table")).toContainText(TRIG_NAME, { timeout: 15000 });

    // Resolve uuid+version of the row we just created.
    const listRes = await page.request.get(
      `${JOB_BASE}/job_trigger/list?filters[0][field]=name&filters[0][op]==&filters[0][value]=${encodeURIComponent(TRIG_NAME)}`,
    );
    expect(listRes.ok()).toBeTruthy();
    const rows = ((await listRes.json()).rows ?? []) as Array<{ uuid: string; version: number }>;
    expect(rows.length).toBe(1);
    trigUuid = rows[0].uuid;
    trigVersion = rows[0].version;

    // The ctl reload must have bound a DURABLE consumer on ENTITY_EVENTS
    // for the trigger's subject — the core of the "JH is the only
    // consumer" contract. Poll: the reload is async.
    const jsm = await jetstreamManager(await getNats());
    await expect
      .poll(
        async () => {
          const names: string[] = [];
          for await (const c of jsm.consumers.list(EVENTS_STREAM)) {
            if (c.config.filter_subject === EVENT_SUBJECT) names.push(c.name);
          }
          return names.length;
        },
        { timeout: 15000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThan(0);
  });

  test("a job_trigger CREATE auto-emits an entity event → trigger fires → job_runs dispatched", async ({
    page,
  }) => {
    test.skip(!trigUuid, "choreography trigger was not created");
    await loginAsTestAdmin(page);
    const pool = getPool();
    const t0 = new Date();

    // The dummy row is a schedule-only trigger — it never fires in the
    // test window; its CREATE is what must emit the entity event.
    const create = await page.request.post(`${JOB_BASE}/job_trigger`, {
      data: {
        entity: {
          name: DUMMY_NAME,
          schedule_spec: "@every 1h",
          target_subject: "crm.emit_fake_event",
          run_as: "system",
          payload_map: { event: { kind: "const", value: "events.crm.customer.on.changed" } },
        },
      },
    });
    expect(create.status(), await create.text()).toBe(201);
    const created = (await create.json()) as { uuid: string };
    dummyUuid = created.uuid;

    // 1) The entity event must be IN THE STREAM — schema-1 payload emitted
    //    by the job service's own governed write (no test-side publish).
    const jsm = await jetstreamManager(await getNats());
    const evtSubject = `events.job.job_trigger.${dummyUuid}`;
    let streamPayload: Record<string, unknown> | null = null;
    await expect
      .poll(
        async () => {
          try {
            const m = await jsm.streams.getMessage(EVENTS_STREAM, { last_by_subj: evtSubject });
            streamPayload = m ? (JSON.parse(new TextDecoder().decode(m.data)) as Record<string, unknown>) : null;
            return streamPayload !== null;
          } catch {
            return false;
          }
        },
        { timeout: 15000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    const evt = streamPayload!.event as Record<string, unknown>;
    expect(evt.schema).toBe(2);
    expect(evt.service).toBe("job");
    expect(evt.entity).toBe("job_trigger");
    expect(evt.action).toBe("create");
    expect(evt.uuid).toBe(dummyUuid);
    expect(evt.subject).toBe(evtSubject);
    // RFC 3339 `date-time` — a real timestamp on the wire, not epoch ms.
    expect(typeof evt.emitted_at).toBe("string");
    expect(Number.isNaN(Date.parse(String(evt.emitted_at)))).toBe(false);
    expect(typeof evt.emitted_by).toBe("string");

    // 2) The choreography trigger matched the event → dispatched a run.
    await expect
      .poll(
        async () => {
          const r = await pool.query(
            `SELECT uuid, target_subject, status, run_as FROM job.job_runs
             WHERE target_subject = 'crm.emit_fake_event' AND created_at > $1`,
            [t0],
          );
          return r.rows.length;
        },
        { timeout: 20000, intervals: [1000, 2000, 3000] },
      )
      .toBeGreaterThanOrEqual(1);
  });

  test("residue-free — both trigger rows deleted via the entity API", async ({ page }) => {
    await loginAsTestAdmin(page);
    test.skip(!dummyUuid && !trigUuid, "nothing to clean up");

    if (dummyUuid) {
      const cur = await page.request.get(`${JOB_BASE}/job_trigger/${dummyUuid}`);
      const v = ((await cur.json()) as { version?: number }).version ?? dummyVersion;
      const del = await page.request.delete(`${JOB_BASE}/job_trigger/${dummyUuid}?version=${v}`);
      expect(del.ok()).toBeTruthy();
    }
    if (trigUuid) {
      const cur = await page.request.get(`${JOB_BASE}/job_trigger/${trigUuid}`);
      const v = ((await cur.json()) as { version?: number }).version ?? trigVersion;
      const del = await page.request.delete(`${JOB_BASE}/job_trigger/${trigUuid}?version=${v}`);
      expect(del.ok()).toBeTruthy();
    }
  });
});
