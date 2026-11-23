import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { extJsonParse } from "@primebrick/core/ext-json";

/* `format:"i18n_key"` form fields — baseline-seeded suggestion contract:
 *
 *  - The assigned convention-key suggestion (`custom.entities.<tk>.rows.
 *    <slug(code)>`) lives in the form BASELINE — `EntityFormSurface.
 *    buildInitial` computes it via `i18nKeySuggestionFor` at the same
 *    moment every other initial is taken. Before this, the dispatcher's
 *    $effect assigned it post-baseline → born-tainted form →
 *    `window.confirm` fired on sheet close with zero user edits.
 *  - An untouched edit sheet MUST close silently (no unsaved-guard
 *    confirm); a REAL edit still triggers the guard (regression gate —
 *    the fix must not neuter `useUnsavedChangesGuard`).
 *  - The suggested value renders through the SINGLE-mode created-value
 *    anatomy: field icon (`languages`) + text + muted "Nuovo" marker —
 *    never a Badge (badges are the multi-mode surface).
 *
 * Surface: the builtin `sequence` registry edit sheet — `description_key`
 * is `format:"i18n_key"`, created rows carry no stored key → the empty→
 * suggestion path always fires.
 */

const CRM = "/svc/crm/api/v1/entities/sequence";

async function mkSeq(page: import("@playwright/test").Page, tag: string) {
	const r = await page.request.post(`${CRM}`, {
		data: {
			entity: {
				name: `e2e_i18n_${tag}_${Date.now()}`,
				pattern: `E2EK-${tag}-{seq:4}`,
				step: "1",
				start: "1",
			},
		},
	});
	expect(r.status()).toBe(201);
	return (await r.text().then((t) => extJsonParse<unknown>(t))) as Record<string, unknown>;
}

test.describe("i18n_key form fields — baseline suggestion & created anatomy", () => {
	test("edit sheet with empty description_key opens UN-TAINTED — closes without confirm", async ({
		page,
	}) => {
		await loginAsTestAdmin(page);
		const seq = await mkSeq(page, "taint");
		await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
		await expect(page.locator("[data-sidebar='content'] a[href]").first()).toBeVisible({
			timeout: 5_000,
		});

		// Find the fixture row (registry accumulates — server-side search).
		const listReq = page.waitForResponse(
			(r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
			{ timeout: 5_000 },
		);
		await page.getByTestId("entity-search").locator("input").fill(String(seq.name));
		await listReq;
		const row = page.locator("table tbody tr", { hasText: String(seq.name) }).first();
		await expect(row).toBeVisible({ timeout: 5_000 });

		// Row actions → Modifica → the record sheet in edit mode.
		await row.locator("td").last().getByRole("button").first().click();
		await page.getByRole("menuitem").filter({ hasText: /modifica|edit/i }).first().click();
		const sheet = page.getByTestId("entity-record-sheet");
		await expect(sheet).toBeVisible({ timeout: 5_000 });

		// The suggestion IS the baseline value: pre-filled, readable.
		const field = sheet.locator("[data-testid=entity-form-field-description_key]");
		await expect(field).toBeVisible({ timeout: 5_000 });
		const trigger = field.getByRole("combobox");
		await expect(trigger).toContainText(/custom\.entities\./);

		// Created-value anatomy: icon + text + muted "Nuovo" — no Badge.
		await expect(trigger.locator("svg").first()).toBeVisible();
		await expect(trigger).toContainText(/new|nuovo/i);
		await expect(trigger.locator("[data-slot='badge']")).toHaveCount(0);

		// Untouched → close must NOT fire the unsaved-guard confirm.
		let dialogSeen = false;
		page.on("dialog", (d) => {
			dialogSeen = true;
			void d.dismiss();
		});
		await page.keyboard.press("Escape");
		await expect(sheet).toBeHidden({ timeout: 5_000 });
		expect(dialogSeen, "unsaved-guard confirm fired on an untouched sheet").toBe(false);
	});

	test("real edit STILL triggers the unsaved-guard — the fix does not neuter it", async ({
		page,
	}) => {
		await loginAsTestAdmin(page);
		const seq = await mkSeq(page, "guard");
		await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
		await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });

		const listReq = page.waitForResponse(
			(r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
			{ timeout: 5_000 },
		);
		await page.getByTestId("entity-search").locator("input").fill(String(seq.name));
		await listReq;
		const row = page.locator("table tbody tr", { hasText: String(seq.name) }).first();
		await row.locator("td").last().getByRole("button").first().click();
		await page.getByRole("menuitem").filter({ hasText: /modifica|edit/i }).first().click();
		const sheet = page.getByTestId("entity-record-sheet");
		await expect(sheet).toBeVisible({ timeout: 5_000 });

		// A real edit: step 1 → 2 (NumericInput commits on blur).
		const stepInput = sheet.locator("[data-testid=entity-form-field-step] input");
		await stepInput.fill("2");
		await stepInput.blur();

		// Closing now MUST hit the guard — prove the confirm still exists.
		let dialogSeen = false;
		page.on("dialog", (d) => {
			dialogSeen = true;
			void d.dismiss();
		});
		await page.keyboard.press("Escape");
		await expect
			.poll(() => dialogSeen, { timeout: 5_000 })
			.toBe(true);
	});
});
