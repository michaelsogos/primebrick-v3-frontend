/**
 * Remote sheet end-to-end — `job.runDetail` declared in job-handler's
 * nav.sheets[] must resolve through /modules discovery, mount its ESM
 * chunk inside the host sheet surface, receive props, call its owning
 * service via ctx.api, and close via ctx.sheet.close().
 *
 * NOTE on module access: `page.evaluate` cannot reach the app's module
 * instance by specifier — vite dev forks `.svelte.ts` modules per URL
 * spelling and stamps internal imports with `?t=` after HMR. We import
 * the exact URL the app already fetched (performance resource entries),
 * which the browser module cache resolves to the live app instance.
 */
import { test, expect } from '@playwright/test';
import { loginAsTestAdmin } from './helpers/admin-login';

const RUN_UUID = '04914617-7563-4c95-b7dc-778e3d87550f'; // partition-maintenance, succeeded

/** Import the sheet-manager instance the app itself is using. */
async function sheetManager(page: import('@playwright/test').Page) {
  const url = await page.evaluate(() => {
    const entries = performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('sheet-manager.svelte'))
      .sort((a, b) => b.startTime - a.startTime);
    return entries[0]?.name ?? null;
  });
  expect(url, 'app sheet-manager module URL found').toBeTruthy();
  return url!;
}

async function openRemoteSheet(page: import('@playwright/test').Page, key: string, props: Record<string, unknown>) {
  const url = await sheetManager(page);
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ([u, k, p]) => {
            const mod = await import(/* @vite-ignore */ u as string);
            mod.openSheet(k, p);
            return mod.sheetState.panelId;
          },
          [url, key, props],
        ),
      { timeout: 15_000 },
    )
    .toBe(key);
}

test('remote sheet job.runDetail mounts and loads its run', async ({ page }) => {
  await loginAsTestAdmin(page);
  await page.goto('/system/job/runs', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('sidebar-profile-menu-trigger').waitFor({ state: 'visible', timeout: 15_000 });
  // Let the app settle so every shell module URL is in the resource buffer.
  await page.waitForTimeout(2000);

  await openRemoteSheet(page, 'job.runDetail', { run_uuid: RUN_UUID });

  // Remote mount surface appears inside the host sheet.
  const mount = page.getByTestId('remote-sheet-mount');
  await expect(mount).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('remote-sheet-content')).toBeVisible({ timeout: 15_000 });

  // Domain content arrived remote-side — the run's own fields rendered.
  await expect(mount).toContainText('partition-maintenance', { timeout: 15_000 });
  await expect(mount).toContainText(RUN_UUID);

  // ws-bound fetch works — the remote called its owning service through ctx.api.
  const res = await page.request.get(`/ws/job/api/v1/entities/job_run/${RUN_UUID}`);
  expect(res.status()).toBe(200);

  // ctx.sheet.close() — the content drives the host-owned frame.
  await mount.locator('button', { hasText: '✕' }).click();
  await expect(mount).toBeHidden({ timeout: 5_000 });
});

test('unknown sheet key is rejected — no empty surface', async ({ page }) => {
  await loginAsTestAdmin(page);
  await page.goto('/system/job/runs', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('sidebar-profile-menu-trigger').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(2000);
  const url = await sheetManager(page);
  const opened = await page.evaluate(async (u) => {
    const mod = await import(/* @vite-ignore */ u);
    mod.openSheet('bogus.nothing', {});
    return { open: mod.sheetState.open, panelId: mod.sheetState.panelId };
  }, url);
  expect(opened.open).toBe(false);
  expect(opened.panelId).toBeNull();
});
