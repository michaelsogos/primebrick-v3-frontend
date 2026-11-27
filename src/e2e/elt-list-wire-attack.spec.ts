import { test, expect, type Page } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

import { extJsonParse } from '@primebrick/core/ext-json';
/* Wire-contract attack matrix — /entities/job_schedule/list.
 *
 * Not a happy-path suite: every case either exercises the contract edges
 * (wildcard escapes, csv/bracket/repeated search_in, typed ops vs column
 * types, connector mixing, sort/page/deleted_records) or deliberately
 * violates it (unknown fields/ops/keys, malformed shapes, injection
 * needles) and asserts the strict fail-closed verdict.
 *
 * Data anchor (dev seed, relational — fixture counts drift as dev data
 * grows, so exact assertions derive their expected value from the
 * unfiltered set itself):
 *   every mirror is trigger-owned (`trigger` = calculated ref resolving
 *   the owning trigger's name — searchable on its served pg_type:"text");
 *   run_as splits user/system lanes; schedule_type is recurring-only.
 * Assertions stay relational where data may grow, exact-0 where disjoint.
 */

const LIST = "/svc/job/api/v1/entities/job_schedule/list";

async function wire(page: Page, qs: string) {
  const res = await page.request.get(`${LIST}?${qs}`);
  const body = await res.text().then((t) => extJsonParse<Record<string, unknown>>(t)).catch(() => null);
  return { status: res.status(), body, total: body?.total !== undefined ? Number(body.total) : null };
}

const F = (i: number, field: string, op: string, value: string) =>
  `filters[${i}][field]=${field}&filters[${i}][op]=${encodeURIComponent(op)}&filters[${i}][value]=${encodeURIComponent(value)}&filters[${i}][connector]=AND`;

test.describe("wire attack — job_schedule list", () => {
  test.describe.configure({ timeout: 90_000 }); // many sequential authed wire calls
  let allRows = 0;

  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/job_schedules", { waitUntil: "domcontentloaded" });
    if (!allRows) {
      const base = await wire(page, "page=1&page_size=1");
      expect(base.status).toBe(200);
      allRows = base.total!;
      expect(allRows).toBeGreaterThanOrEqual(5);
    }
  });

  // ── A. needle semantics: \* \? wildcards, literals, escapes, gate ──
  test("A — needle syntax: wildcards, literals, escapes, min-length gate", async ({ page }) => {
    const cases: Array<[string, (t: number | null) => void]> = [
      ["search=e2e", (t) => { expect(t).toBeGreaterThanOrEqual(1); expect(t).toBeLessThan(allRows); }],
      // `\*` is the wildcard operator — but a PURE wildcard has zero true
      // chars → min-length gate matches nothing (by design, anchorless
      // searches are expensive/meaningless). Bare `*`/`?` are literals.
      ["search=%5C*", (t) => expect(t).toBe(0)],
      ["search=*", (t) => expect(t).toBe(0)],
      ["search=%5C?", (t) => expect(t).toBe(0)],
      ["search=?", (t) => expect(t).toBe(0)],
      // `%`/`_`/`#` are escaped to literals — never wildcards by accident.
      ["search=%25", (t) => expect(t).toBe(0)],
      ["search=_", (t) => expect(t).toBe(0)],
      ["search=%23", (t) => expect(t).toBe(0)],
      // prefix/suffix wildcard mixes
      ["search=e2e%5C*", (t) => { expect(t).toBeGreaterThanOrEqual(1); expect(t).toBeLessThanOrEqual(allRows); }],
      ["search=%5C*fake%5C*", (t) => expect(t).toBeGreaterThanOrEqual(1)], // \*fake\* anchored wildcard
      // min-length gate: <3 true chars deliberately matches nothing.
      ["search=ab", (t) => expect(t).toBe(0)],
      ["search=5m", (t) => expect(t).toBe(0)],
      // injection / quoting / trailing backslash — parameterized, literal.
      ["search='%20OR%20'1'='1", (t) => expect(t).toBe(0)],
      ["search=e2e%5C", (t) => expect(t).toBe(0)],
      ["search=%20e2e%20", (t) => expect(t).toBeGreaterThanOrEqual(1)], // trimmed
      ["search=E2E", (t) => expect(t).toBeGreaterThanOrEqual(1)],       // ILIKE ci
      ["search=%C3%A92e", (t) => expect(t).toBe(0)],                    // unicode miss
    ];
    for (const [qs, check] of cases) {
      const r = await wire(page, qs);
      expect(r.status, qs).toBe(200);
      check(r.total);
    }
  });

  // ── B. search_in: every wire form + every rejection ──
  test("B — search_in wire forms and fail-closed rejections", async ({ page }) => {
    const ok: string[] = [
      "search_in=trigger,schedule_subject,target_subject,schedule_spec",
      "search_in=target_subject",
      "search_in[]=trigger&search_in[]=schedule_subject",
      "search_in=trigger&search_in=schedule_subject", // repeated
      "search_in=uuid",
      "search_in=trigger,trigger", // dup keys — harmless
    ];
    for (const si of ok) {
      const r = await wire(page, `search=e2e&${si}`);
      expect(r.status, si).toBe(200);
    }

    const bad: Array<[string, string]> = [
      ["search_in=", ""],
      ["search_in=trigger,", ""],              // trailing comma → empty key
      ["search_in=TRIGGER", "TRIGGER"],     // case-sensitive
      ["search_in=name", "name"],              // retired physical column
      ["search_in=schedule_type", "schedule_type"],// filterable ≠ searchable
      ["search_in=trigger,bogus", "bogus"],
      ["search_in=trigger, name", " name"],// no trim → space poisons key
      ["search_in=status", "status"],              // badge — not a text surface
      ["search_in=version", "version"],
    ];
    for (const [si, frag] of bad) {
      const r = await wire(page, `search=e2e&${si}`);
      expect(r.status, si).toBe(400);
      expect(String(r.body?.detail ?? ""), si).toContain(frag === "" ? "search_in" : frag);
    }

    // scope without needle: legal no-op (param ignored, rows unfiltered).
    const noNeedle = await wire(page, "search_in=trigger");
    expect(noNeedle.status).toBe(200);
    expect(noNeedle.total).toBe(allRows);
  });

  // ── C. filters: per-type ops, typed values, rejections ──
  test("C — filters per type and operator contract", async ({ page }) => {
    // Exact counts are derived from the unfiltered set — fixture rows
    // grow (E2E materializes schedules), the predicate verdict stays exact.
    const all = await wire(page, "page_size=50");
    const rows = (all.body?.rows ?? []) as Record<string, unknown>[];
    expect(rows.length, "the unfiltered page must cover the fixture set").toBe(allRows);
    const emitEq = rows.filter((r) => r.target_subject === "crm.emit_fake_event").length;
    const emitIlike = rows.filter((r) => String(r.target_subject).toLowerCase().includes("emit")).length;

    const ok: Array<[string, (t: number | null) => void]> = [
      [F(0, "status", "=", "armed"), (t) => expect(t).toBeGreaterThanOrEqual(3)],
      [F(0, "status", "!=", "armed"), (t) => expect(t).toBeGreaterThanOrEqual(3)],
      [F(0, "status", "=", "stopped"), (t) => expect(t).toBe(0)],
      [F(0, "schedule_type", "=", "once"), (t) => expect(t).toBe(0)],
      [F(0, "target_subject", "=", "crm.emit_fake_event"), (t) => expect(t).toBe(emitEq)],
      // Wire ops are SQL-ish — `contains`/`startsWith`/`endsWith` are
      // UI-level ops the FE translates to ILIKE patterns BEFORE the wire.
      [F(0, "target_subject", "ILIKE", "%emit%"), (t) => expect(t).toBe(emitIlike)],
      [F(0, "schedule_subject", "ILIKE", "jobs.schedule.job%"), (t) => expect(t).toBeGreaterThanOrEqual(4)],
      [F(0, "trigger", "ILIKE", "%e2e%"), (t) => expect(t).toBeGreaterThanOrEqual(1)], // calculated trigger-name projection
      [F(0, "uuid", "ILIKE", "07"), (t) => expect(t).not.toBeNull()],                    // the user's case
      [F(0, "version", ">=", "1"), (t) => expect(t).toBe(allRows)],
      [F(0, "created_at", "<", "2099-01-01"), (t) => expect(t).toBe(allRows)],
      [F(0, "run_as", "=", "user"), (t) => expect(t).toBeGreaterThanOrEqual(1)],
    ];
    for (const [qs, check] of ok) {
      const r = await wire(page, `page_size=50&${qs}`);
      expect(r.status, qs).toBe(200);
      check(r.total);
    }

    // IN via bracket array value.
    const inArr = await wire(page,
      "filters[0][field]=status&filters[0][op]=IN&filters[0][value][]=armed&filters[0][value][]=disarmed&filters[0][connector]=AND");
    expect(inArr.status).toBe(200);
    expect(inArr.total).toBe(allRows);

    const bad: string[] = [
      F(0, "schedule_spec", "=", "x"),          // filterable:false authored
      F(0, "bogus_field", "=", "x"),
      F(0, "TRIGGER", "=", "x"),            // case
      F(0, "name", "=", "x"),               // retired physical column
      F(0, "created_at", ">", "not-a-date"),    // unparseable datetime → 400
      F(0, "version", "=", "not-a-number"),     // typed value → 400
      F(0, "uuid", "=", "not-a-uuid"),          // pgType:uuid declared → 400
      F(0, "status", "DROP", "x"),              // unknown op
      F(0, "status", "contains", "x"),          // UI-level op raw on wire
      "filters[0][op]==&filters[0][value]=x",   // field missing
      "filters[0][field]=status",               // op+value missing
    ];
    for (const qs of bad) {
      const r = await wire(page, qs);
      expect(r.status, qs).toBe(400);
    }
  });

  // ── D. combinations — the classes that actually bite ──
  test("D — search × filters × scope × sort × paging combined", async ({ page }) => {
    // Expected counts + the disjoint needle are derived from the
    // unfiltered set — "exact-0 where disjoint" holds only if the needle
    // provably exists in user rows' searchable surface and in NO system
    // row's (E2E materializes schedules on both lanes, counts drift).
    const all = await wire(page, "page_size=50");
    const rows = (all.body?.rows ?? []) as Record<string, unknown>[];
    const emitIlike = rows.filter((r) => String(r.target_subject).toLowerCase().includes("emit")).length;
    const userRow = rows.find((r) => r.run_as === "user");
    expect(userRow, "at least one user-lane schedule exists").toBeTruthy();
    const userNeedle = String(userRow!.target_subject).split(".")[0];
    expect(userNeedle.length).toBeGreaterThanOrEqual(3); // min-length gate
    const sysHay = rows
      .filter((r) => r.run_as === "system")
      .map((r) => `${r.trigger} ${r.target_subject} ${r.schedule_subject} ${r.schedule_spec} ${r.schedule_type} ${r.uuid}`)
      .join(" ")
      .toLowerCase();
    expect(sysHay, `needle "${userNeedle}" must be absent from system rows`).not.toContain(userNeedle.toLowerCase());

    const cases: Array<[string, (t: number | null) => void]> = [
      // search + standard filter, intersecting
      [`search=e2e&${F(0, "status", "=", "armed")}`, (t) => expect(t).toBeGreaterThanOrEqual(1)],
      // search + standard filter, disjoint → legal 0, NOT an error
      [`search=${userNeedle}&${F(0, "run_as", "=", "system")}`, (t) => expect(t).toBe(0)],
      [`search=e2e&${F(0, "status", "=", "stopped")}`, (t) => expect(t).toBe(0)],
      // search scoped + quick filter on the SAME column
      [`search=fake&search_in=target_subject&${F(0, "target_subject", "ILIKE", "%emit%")}`, (t) => expect(t).toBe(emitIlike)],
      // scoped-empty vs unscoped: "emit" lives in target_subject only
      ["search=emit&search_in=target_subject", (t) => expect(t).toBe(emitIlike)],
      ["search=emit&search_in=schedule_subject", (t) => expect(t).toBe(0)],
      // search + preset-style filter + scoped search_in — the user's combo
      [`search=e2e&search_in=trigger,target_subject&${F(0, "schedule_type", "=", "recurring")}`, (t) => expect(t).toBeGreaterThanOrEqual(1)],
      // scoped-empty vs unscoped: e2e lives in trigger, not schedule_subject
      ["search=e2e&search_in=schedule_subject", (t) => expect(t).toBe(0)],
      ["search=e2e&search_in=target_subject,schedule_subject", (t) => expect(t).toBe(0)],
      // wildcard needle + filters — a PURE `\*` has zero true chars → the
      // gate resolves the search to 1=0 → AND with the filter → 0.
      [`search=%5C*&${F(0, "schedule_type", "=", "once")}`, (t) => expect(t).toBe(0)],
      // anchored wildcard DOES search → e2e\* hits the trigger rows.
      [`search=e2e%5C*&${F(0, "status", "=", "armed")}`, (t) => expect(t).toBeGreaterThanOrEqual(1)],
      // IN-filter + search + sort + paging, all at once
      [`search=e2e&sort_key=schedule_subject&sort_dir=DESC&page=1&page_size=1&filters[0][field]=status&filters[0][op]=IN&filters[0][value][]=armed&filters[0][value][]=stopped&filters[0][connector]=AND`,
        (t) => expect(t).toBeGreaterThanOrEqual(1)],
      // deleted_records wire vocabulary is EXCLUDED/INCLUDED/ONLY —
      // the UI-mode names (`deleted`/`all`) are rejected like any bogus value.
      [`search=e2e&deleted_records=ONLY`, (t) => expect(t).not.toBeNull()],
      [`deleted_records=INCLUDED&${F(0, "status", "=", "armed")}`, (t) => expect(t).toBeGreaterThanOrEqual(3)],
      [`deleted_records=only&${F(0, "status", "=", "armed")}`, (t) => expect(t).toBeGreaterThanOrEqual(3)], // case-normalized
    ];
    for (const [qs, check] of cases) {
      const r = await wire(page, qs);
      expect(r.status, qs).toBe(200);
      check(r.total);
    }

    // AND vs OR connector across two filters — OR must widen, AND must narrow.
    // `connector` is a TOP-LEVEL param joining all conditions uniformly;
    // the per-condition `connector` field is wire-compat noise (ignored).
    const or_ = await wire(page,
      `${F(0, "status", "=", "armed")}&filters[1][field]=run_as&filters[1][op]=%3D&filters[1][value]=user&connector=OR`);
    const and_ = await wire(page, `${F(0, "status", "=", "armed")}`);
    expect(or_.status).toBe(200);
    expect(or_.total!).toBeGreaterThan(and_.total!); // armed ∪ user ⊋ armed (disarmed e2e rows join)
  });

  // ── E. sort / paging / envelope edges ──
  test("E — sort, paging, envelope abuse", async ({ page }) => {
    const ok: Array<[string, (t: number | null, body: unknown) => void]> = [
      ["sort_key=schedule_subject&sort_dir=ASC", (t) => expect(t).toBe(allRows)],
      ["sort_key=version&sort_dir=DESC", (t) => expect(t).toBe(allRows)],
      ["sort_key=next_run_at&sort_dir=ASC", (t) => expect(t).toBe(allRows)],
      ["page_size=1&page=1", (t) => expect(t).toBe(allRows)],
      ["page_size=250&page=1", (t) => expect(t).toBe(allRows)], // wire ceiling — accepted
    ];
    for (const [qs, check] of ok) {
      const r = await wire(page, qs);
      expect(r.status, qs).toBe(200);
      check(r.total, r.body);
    }
    // Out-of-range page on a NON-EMPTY filter → RFC error, not a lying
    // `total:0`. `PAGE_OUT_OF_RANGE` + extra {page,last_page,total} lets
    // a legitimately-stale client clamp-and-retry; probing gets a 400.
    const r0 = await wire(page, "page=999&page_size=10");
    expect(r0.status).toBe(400);
    const r0body = r0.body as { internal_code?: string; extra?: { last_page?: number; total?: number } };
    expect(r0body.internal_code).toBe("PAGE_OUT_OF_RANGE");
    expect(r0body.extra?.last_page).toBe(1);
    expect(r0body.extra?.total).toBe(allRows);
    // …but an empty result set is legit on ANY page when nothing matches
    // — the probe returns total:0 → 200, no false out-of-range claim.
    const legitEmpty = await wire(page, "search=zzzznothingmatches&page=1");
    expect(legitEmpty.status).toBe(200);
    expect(legitEmpty.total).toBe(0);
    const legitEmptyDeep = await wire(page, "search=zzzznothingmatches&page=5");
    expect(legitEmptyDeep.status).toBe(200);
    expect(legitEmptyDeep.total).toBe(0);

    // sort_dir is normalized lenient-by-design: anything ≠ ASC → DESC.
    const dir = await wire(page, "sort_dir=UP");
    expect(dir.status).toBe(200);

    const bad = [
      "sort_key=run_stats",        // histogram — virtual, not sortable
      "sort_key=bogus_field",
      "page=0",
      "page=-1",
      "page=abc",                  // typed coercion → 400, never a PG 500
      "page=1.5",
      "page_size=abc",
      "page_size=0",
      "page_size=-5",
      "page_size=251",           // above the 250 wire ceiling → 400, not a resource drain
      "page_size=99999",
      "deleted_records=BOGUS",     // enum — fail closed, no silent default
      "deleted_records=deleted",   // UI-mode name on the wire → 400
      "deleted_records=all",       // UI-mode name on the wire → 400
    ];
    for (const qs of bad) {
      const r = await wire(page, qs);
      expect(r.status, qs).toBe(400);
    }
  });

  // ── F. capability routes — audit-actors on audit COLUMNS, not the
  //     audit-trail table (job_schedule has columns, no @AuditTrail) ──
  test("F — audit-actors resolves on an audit-columns entity without history table", async ({ page }) => {
    const res = await page.request.get("/svc/job/api/v1/entities/job_schedule/audit-actors");
    expect(res.status()).toBe(200);
    const body = await res.text().then((t) => extJsonParse<{ items?: unknown }>(t));
    expect(Array.isArray(body.items)).toBe(true);
  });
});
