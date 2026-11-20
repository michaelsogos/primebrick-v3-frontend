/**
 * E2E Suite — Regex flags panel: draft-snapshot contract.
 *
 * The panel (regex-flags-panel.svelte) captures `current_flags` into local
 * mutable state once per mount — the sheet remounts on every open, so the
 * draft MUST re-snapshot from the latest prop each time. This is the exact
 * semantic `untrack(() => prop)` expresses; the suite is the before/after
 * oracle for the svelte-ignore → untrack migration (suppress-governance).
 *
 * Contract under test:
 *   1. Open with no flags → all switches unchecked (string: no multiline).
 *   2. Toggling commits live to the parent (flags CTA text updates).
 *   3. Close + reopen → switches reflect the CURRENT prop, not stale state
 *      and not a reset (snapshot re-taken on remount).
 *   4. `text` config type exposes the multiline (m) flag; `string` hides it.
 *   5. BadgeValuePanel (same untrack migration): add-mode draft resets to
 *      empty on every open; edit-mode draft seeds from the target row.
 *
 * Preconditions: standard E2E stack (global.setup.ts) — FE 5173, BE 3001.
 * Locators: data-testid only (brittle-on-purpose convention).
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

const CREATE_URL = "/system/settings/configurations/create";

/** Open the type ComboSelect and pick a type by visible label (retry covers
 *  the pre-hydration no-op click). Same contract as config-create-validation. */
async function selectType(page: Page, typeLabel: string): Promise<void> {
  const trigger = page.getByTestId("config-create-type");
  await trigger.waitFor({ state: "visible", timeout: 5000 });
  const option = page
    .locator("[data-state='open']")
    .getByRole("option", { name: typeLabel, exact: true });
  for (let i = 0; i < 5; i++) {
    await trigger.click();
    try {
      await option.waitFor({ state: "visible", timeout: 3000 });
      break;
    } catch {
      if (i === 4) throw new Error(`type option "${typeLabel}" never appeared`);
    }
  }
  await option.click();
  await page.getByTestId("config-create-key").click();
}

async function openFlagsPanel(page: Page): Promise<void> {
  await page.getByTestId("smart-regex-flags-cta").click();
  await page
    .getByTestId("smart-regex-flag-g-switch")
    .waitFor({ state: "visible", timeout: 5000 });
}

async function closeFlagsPanel(page: Page): Promise<void> {
  // Escape closes the TOPMOST dismissable layer — a leftover popover or a
  // not-yet-armed focus trap can consume the first press. Retry on evidence:
  // the panel is provably closed only when its switch is gone.
  const flagG = page.getByTestId("smart-regex-flag-g-switch");
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape");
    const closed = await flagG
      .waitFor({ state: "hidden", timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (closed) return;
  }
  throw new Error("regex flags panel still open after 3 Escape presses");
}

test.beforeEach(async ({ page }) => {
  await loginAsTestAdmin(page);
  await page.goto(CREATE_URL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("config-create-key").waitFor({ state: "visible", timeout: 5000 });
});

test("flags draft snapshots current_flags on every mount", async ({ page }) => {
  await selectType(page, "String");
  const flagsText = page.getByTestId("smart-regex-flags-text");
  await expect(flagsText).toHaveText("/", { timeout: 5000 });

  // 1. First mount: no flags → both switches unchecked; no multiline on string.
  await openFlagsPanel(page);
  const flagG = page.getByTestId("smart-regex-flag-g-switch");
  const flagI = page.getByTestId("smart-regex-flag-i-switch");
  await expect(flagG).toHaveAttribute("data-state", "unchecked");
  await expect(flagI).toHaveAttribute("data-state", "unchecked");
  await expect(page.getByTestId("smart-regex-flag-m-switch")).toHaveCount(0);

  // 2. Toggle g + i — live commit to the parent's flags.
  await flagG.click();
  await flagI.click();
  await expect(flagsText).toHaveText("/gi", { timeout: 5000 });
  await closeFlagsPanel(page);

  // 3. Remount: the draft MUST re-snapshot 'gi' — not stale, not reset.
  await openFlagsPanel(page);
  await expect(flagG).toHaveAttribute("data-state", "checked");
  await expect(flagI).toHaveAttribute("data-state", "checked");

  // 4. Untoggle g → parent drops to 'i'; remount reflects it.
  await flagG.click();
  await expect(flagsText).toHaveText("/i", { timeout: 5000 });
  await closeFlagsPanel(page);
  await openFlagsPanel(page);
  await expect(flagG).toHaveAttribute("data-state", "unchecked");
  await expect(flagI).toHaveAttribute("data-state", "checked");
  await closeFlagsPanel(page);
});

test("text config type exposes the multiline flag", async ({ page }) => {
  await selectType(page, "Text");
  await openFlagsPanel(page);
  const flagM = page.getByTestId("smart-regex-flag-m-switch");
  await expect(flagM).toHaveAttribute("data-state", "unchecked");
  await flagM.click();
  await expect(page.getByTestId("smart-regex-flags-text")).toHaveText("/m", {
    timeout: 5000,
  });
  await closeFlagsPanel(page);
});

test("badge value panel drafts re-snapshot on every open", async ({ page }) => {
  await selectType(page, "Badge");
  const openAdd = page.getByTestId("tcb-badge-open-add");
  const codeInput = page.getByTestId("tcb-badge-value");

  // Add mode: fresh empty draft on first open.
  await openAdd.click();
  await codeInput.waitFor({ state: "visible", timeout: 5000 });
  await expect(codeInput).toHaveValue("");
  await codeInput.fill("active");
  await page.getByTestId("tcb-badge-add").click();
  await codeInput.waitFor({ state: "hidden", timeout: 5000 });
  await expect(page.getByTestId("tcb-badge-edit")).toHaveCount(1);

  // Re-open in add mode — the draft MUST re-snapshot to empty, not retain
  // the previous session's "active" (remount = fresh untrack read).
  await openAdd.click();
  await codeInput.waitFor({ state: "visible", timeout: 5000 });
  await expect(codeInput).toHaveValue("");
  await page.keyboard.press("Escape");
  await codeInput.waitFor({ state: "hidden", timeout: 5000 });

  // Edit mode: the draft seeds from the target row's value_key.
  await page.getByTestId("tcb-badge-edit").click();
  await codeInput.waitFor({ state: "visible", timeout: 5000 });
  await expect(codeInput).toHaveValue("active");
  await page.keyboard.press("Escape");
});
