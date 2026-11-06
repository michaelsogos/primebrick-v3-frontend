import { test, expect, type Page } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * elt-filters-widget-parity — the filters sheet mounts the SAME controls
 * the entity form resolves from the column contract (one dispatcher,
 * `surface:"filter"`). These specs pin the wire shapes the plan commits
 * to, not the implementation:
 *
 *   - `options_source:"census.emits"` renders the governed subject combo
 *     (a [role="combobox"] trigger — the pre-parity TextInput is gone) and
 *     applies as `op="="` (never ILIKE on a governed subject).
 *   - `type:"badge"` renders the multi ComboSelect and serializes a
 *     multi-value criterion as `op="IN"` + repeated `filters[i][value][]`.
 *   - `type:"boolean"` renders the tri-state (Any/Yes/No) and serializes
 *     `op="="`, `value=true|false`.
 *   - `type:"ref"` renders the paged entity combobox — opening it fetches
 *     the target entity's `/list` (server-side search/paging).
 *   - Labels carry `MetaColumn.icon`, and the help icon exists only where
 *     `show_list_tooltip` declares it (ghost-icon regression).
 *
 * Surfaces: /system/job/triggers (census subject + badge + json→text),
 * /system/settings/users (booleans + tooltip/no-tooltip label pair),
 * /system/job/runs (entity-ref combo).
 */

const TRIGGERS = "/system/job/triggers";
const USERS = "/system/settings/users";
const RUNS = "/system/job/runs";

/** Live `/list` request URLs for one entity, captured from page traffic. */
function watchList(page: Page, entity: string): string[] {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes(`/entities/${entity}/list`)) urls.push(req.url());
  });
  return urls;
}

async function openFiltersSheet(page: Page) {
  // Some pages carry a second "Filters" affordance (e.g. filter-bar chips)
  // — the toolbar toggle is the first.
  await page.getByRole("button", { name: "Filters", exact: true }).first().click();
  await expect(page.getByTestId("filters-apply")).toBeVisible({ timeout: 15_000 });
}

/** The PrimeField control wired to a label's `for` — the structural id pair. */
async function labeledControl(page: Page, labelText: RegExp) {
  // The sheet content renders once entity meta resolves — under a loaded
  // suite the label can lag the footer apply button by a beat.
  const label = page.locator("label", { hasText: labelText }).first();
  await expect(label).toBeVisible({ timeout: 30_000 });
  const id = await label.getAttribute("for");
  expect(id).toBeTruthy();
  return { label, control: page.locator(`[id="${id}"]`) };
}

test.describe("elt filters widget parity", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("standard tab — census subject column renders the governed combo", async ({ page }) => {
    await page.goto(TRIGGERS, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });
    await openFiltersSheet(page);

    // event_subject ("Listening Event") — options_source:"census.emits".
    const { label, control } = await labeledControl(page, /listening.?event/i);
    // Governed options_source → the detailed ComboSelect, not a text input.
    await expect(control).toHaveAttribute("role", "combobox");
    // MetaColumn.icon renders before the label text (PrimeField icon prop).
    await expect(label.locator("svg").first()).toBeVisible();

    await control.click();
    // Census emits carry the detailed anatomy — the raw subject is the
    // option's secondary line (dotted NATS shape).
    const popover = page.locator("[data-popover-content], [cmdk-list]").last();
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await expect(popover.getByText(/\w+\.\w+/).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("standard tab — badge multi applies as op=IN with repeated value[]", async ({ page }) => {
    const urls = watchList(page, "job_trigger");
    await page.goto(TRIGGERS, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });
    await openFiltersSheet(page);

    // execution_context ("Process Executor") — badge multi ComboSelect.
    const { control } = await labeledControl(page, /process.?executor/i);
    await expect(control).toHaveAttribute("role", "combobox");
    await control.click();
    const popover = page.locator("[data-popover-content], [cmdk-list]").last();
    await expect(popover).toBeVisible({ timeout: 10_000 });
    // execution_context badge vocab: system / user / me — pick two.
    await popover.getByText(/^System$/i).first().click();
    await popover.getByText(/^Me$/i).first().click();
    await page.keyboard.press("Escape");
    urls.length = 0;
    await page.getByTestId("filters-apply").click();
    await expect
      .poll(() =>
        urls.some((u) => u.includes("filters%5B0%5D%5Bop%5D=IN") || u.includes("filters[0][op]=IN")),
      )
      .toBe(true);
    const inUrl = urls.find(
      (u) => u.includes("filters%5B0%5D%5Bop%5D=IN") || u.includes("filters[0][op]=IN"),
    )!;
    // Array serialization: the IN values ride as repeated value[] params.
    expect(inUrl).toMatch(/filters(%5B|\[)0(%5D|\])(%5B|\[)value(%5D|\])(%5B|\[)(%5D|\])=system/i);
  });

  test("standard tab — boolean column renders tri-state and applies =true", async ({ page }) => {
    const urls = watchList(page, "user_profile");
    await page.goto(USERS, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });
    await openFiltersSheet(page);

    // is_active ("Enable") — the boolean tri-state group.
    const { control } = await labeledControl(page, /\benable\b/i);
    // Tri-state group — the combobox/text input would both be wrong here.
    await expect(control.getByRole("button", { name: "Any" })).toBeVisible();
    await control.getByRole("button", { name: "Yes" }).click();
    urls.length = 0;
    await page.getByTestId("filters-apply").click();
    await expect
      .poll(() =>
        urls.some((u) => /filters(%5B|\[)\d+(%5D|\])(%5B|\[)value(%5D|\])=true/.test(u)),
      )
      .toBe(true);
  });

  test("standard tab — help icon exists only where the meta declares it", async ({ page }) => {
    await page.goto(USERS, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });
    await openFiltersSheet(page);

    // is_active ("Enable"): no tooltip metadata → NO help control
    // (ghost-icon regression).
    const bare = await labeledControl(page, /\benable\b/i);
    await expect(bare.label.getByLabel("Help")).toHaveCount(0);
    // is_admin ("Admin"): tooltip + show_list_tooltip → help renders.
    const hinted = await labeledControl(page, /\badmin\b/i);
    await expect(hinted.label.getByLabel("Help")).toHaveCount(1);
  });

  test("standard tab — entity ref column opens a paged combo fed by /list", async ({ page }) => {
    const urls = watchList(page, "job_schedule");
    await page.goto(RUNS, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });
    await openFiltersSheet(page);

    const { control } = await labeledControl(page, /schedule.?subject/i);
    await expect(control).toHaveAttribute("role", "combobox");
    // The delegate fetches the referenced entity's first page when the
    // control mounts — a static/closed option list would never hit the wire.
    await expect
      .poll(() => urls.some((u) => u.includes("job_schedule") && u.includes("page_size=")))
      .toBe(true);
    await control.click();
    const popover = page.locator("[data-popover-content], [cmdk-list]").last();
    await expect(popover).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
  });

  test("advanced tab — options_source criterion applies as op= (not ILIKE)", async ({ page }) => {
    const urls = watchList(page, "job_trigger");
    await page.goto(TRIGGERS, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });
    await openFiltersSheet(page);

    await page.getByTestId("filters-mode-advanced").click();

    // Field picker → event_subject ("Listening Event").
    const fieldLabel = page.locator("label", { hasText: /\bfield\b/i }).first();
    const fieldId = await fieldLabel.getAttribute("for");
    await page.locator(`[id="${fieldId}"]`).click();
    const popover = page.locator("[data-popover-content], [cmdk-list]").last();
    await popover.getByText(/listening.?event/i).first().click();

    // Value → first census emit offered (multi combo on the filter surface).
    const valueLabel = page.locator("label", { hasText: /\bvalue\b/i }).first();
    const valueId = await valueLabel.getAttribute("for");
    await page.locator(`[id="${valueId}"]`).click();
    const valuePopover = page.locator("[data-popover-content], [cmdk-list]").last();
    await valuePopover.getByText(/\w+\.\w+/).first().click();
    await page.keyboard.press("Escape");
    await page.getByTestId("filters-add-criterion").click();

    urls.length = 0;
    await page.getByTestId("filters-apply").click();
    // options_source equality — ILIKE on governed subjects silently
    // over-matched (`a.b` hit `a.b.v2`); the serializer must emit "="
    // for a single value / IN for several, never ILIKE.
    await expect
      .poll(() =>
        urls.some(
          (u) =>
            /filters(%5B|\[)\d+(%5D|\])(%5B|\[)op(%5D|\])=(=|IN)/.test(u) &&
            !u.includes("ILIKE"),
        ),
      )
      .toBe(true);
  });
});
