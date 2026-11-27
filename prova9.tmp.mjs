import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// login come la spec e2e
await page.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await page.locator('[data-testid="login-username-input"]').fill("e2e_test_admin");
await page.locator('[data-testid="login-password-input"]').fill("test");
await page.locator('[data-testid="login-submit-button"]').click();
await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 15000 }).catch(() => {});
await page.goto("http://localhost:5173/crm/customer_accounts", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/p9-list.png" });
// espandi il gruppo se necessario e clicca la create leaf
const createLeaf = page.locator('[data-sidebar="sidebar"] a[href="/crm/customer_accounts/create"]').first();
const visible = await createLeaf.isVisible().catch(() => false);
console.log("create leaf visible without expand:", visible);
if (!visible) {
  const parent = page.locator('[data-sidebar="sidebar"] a[href="/crm/customer_accounts"]').first();
  await parent.click().catch(() => {});
  await page.waitForTimeout(800);
}
console.log("create leaf visible after expand:", await createLeaf.isVisible().catch(() => false));
await page.screenshot({ path: "/tmp/p9-sidebar.png" });
await createLeaf.click().catch((e) => console.log("click failed:", e.message));
await page.waitForTimeout(3000);
console.log("url after click:", page.url());
await page.screenshot({ path: "/tmp/p9-create.png" });
await browser.close();
