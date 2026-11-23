import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/* ELT export chrome — the CTA↔dialog semantic contract:
 *
 *  - `meta.actions["export"]` is the single source of truth: the served
 *    default is `{color:"primary", variant:"outline"}`; `opChrome` carries
 *    it to the bulk toolbar, `bulkExportChrome` feeds BOTH export CTAs.
 *  - CTA: `variant:"outline"` + `tone:"primary"` → `border-primary-gradient`.
 *  - Dialog: `chrome.color` → `severity="primary"` on the top-strip family
 *    (`tone=""`) — animated gradient strip, NOT the reserved `tone="soft"`
 *    security border (`border-*-gradient-popover`).
 *  - The ExportDialog `chrome` prop derives from the same meta action —
 *    CTA and dialog can never drift apart again.
 *
 * The sequence registry is the target: a builtin entity mounted by
 * construction on every module (dal-pg declares `export` permission), so
 * the served default chrome is guaranteed present.
 */

test.describe("ELT export chrome — CTA & dialog wired to meta", () => {
	test("bulk export CTA is primary-gradient outline; export dialog is primary animated top-strip", async ({
		page,
	}) => {
		await loginAsTestAdmin(page);
		// Capture the app's OWN meta response — the same wire the table reads.
		const metaWait = page.waitForResponse(/\/entities\/sequence\/meta/, { timeout: 5_000 });
		await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
		// Hydration gate (e2e-browser-session.md): a sidebar nav link mounts
		// only after onMount + module-nav fetch — table rows alone lie.
		await expect(page.locator("[data-sidebar='content'] a[href]").first()).toBeVisible({
			timeout: 5_000,
		});
		await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });

		// Completeness assertion — served meta.actions['export'] must carry
		// the primary+outline default chrome.
		const meta = await (await metaWait).json();
		const exportAction = (meta.actions ?? []).find((a: { op?: string }) => a.op === "export");
		expect(exportAction, "served meta.actions['export']").toBeTruthy();
		expect(exportAction.color).toBe("primary");
		expect(exportAction.variant).toBe("outline");

		// Flip the toolbar to bulk mode — the click can race hydration on a
		// reused shared-session tab, so retry inside the poll until the
		// export CTA mounts (evidence, not sleeps).
		const exportCta = page.getByTestId("entity-bulk-export");
		const toggle = page.getByTestId("bulk-actions-toggle");
		await expect(async () => {
			if ((await exportCta.count()) === 0) await toggle.click();
			await expect(exportCta).toBeVisible({ timeout: 1_000 });
		}).toPass({ timeout: 5_000 });
		const exportHtmlCta = page.getByTestId("entity-bulk-export-html");
		await expect(exportCta).toBeVisible({ timeout: 5_000 });
		await expect(exportHtmlCta).toBeVisible({ timeout: 5_000 });

		// CTA chrome: outline + primary → border-primary-gradient on BOTH.
		for (const cta of [exportCta, exportHtmlCta]) {
			await expect(cta).toHaveClass(/border-primary-gradient/);
		}

		// Open the export confirmation dialog.
		await exportCta.click();
		const dialog = page.locator('[data-slot="dialog-content"]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		// Top-strip family (tone=""): the h-2 strip carries the PRIMARY
		// animated gradient — sky→indigo with gradient-pan. Warning would be
		// yellow; the strip must NOT be it (the original regression).
		const strip = dialog.locator(".h-2").first();
		await expect(strip).toHaveClass(/animate-gradient-pan/);
		await expect(strip).toHaveClass(/via-indigo-500/);
		await expect(strip).not.toHaveClass(/via-yellow-500/);

		// NOT the reserved security family: no soft full-around popover border.
		await expect(dialog).not.toHaveClass(/border-\w+-gradient-popover/);
	});
});
