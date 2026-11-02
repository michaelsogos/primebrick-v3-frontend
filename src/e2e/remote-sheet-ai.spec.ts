/**
 * Remote sheet end-to-end — the four ai-domain sheets (`ai.modelCache`,
 * `ai.modelTestReport`, `ai.cerebellum`, `ai.modelImport`) declared in the
 * ai service's nav.sheets[] must resolve through /modules discovery, load
 * the `ai-sheets.js` chunk, dispatch by ctx.sheet.key inside `mountSheet`,
 * and mount their content inside the host sheet surface.
 *
 * NOTE on module access: `page.evaluate` cannot reach the app's module
 * instance by specifier — vite dev forks `.svelte.ts` modules per URL
 * spelling and stamps internal imports with `?t=` after HMR. We import
 * the exact URL the app already fetched (performance resource entries),
 * which the browser module cache resolves to the live app instance.
 */
import { test, expect } from '@playwright/test';
import { loginAsTestAdmin } from './helpers/admin-login';

// Serial — each test cold-loads the vendored chunks (~1.7MB) through the
// dev server; parallel workers multiply that fetch cost into timeouts.
test.describe.configure({ mode: 'serial' });

/** Import the sheet-manager instance the app itself is using. */
async function sheetManager(page: import('@playwright/test').Page) {
  let url: string | null = null;
  // Resource-timing entries are buffered as fetches complete (and the
  // buffer can fill) — poll instead of a fixed wait.
  await expect
    .poll(
      async () => {
        url = await page.evaluate(() => {
          const entries = performance
            .getEntriesByType('resource')
            .filter((e) => e.name.includes('sheet-manager.svelte'))
            .sort((a, b) => b.startTime - a.startTime);
          return entries[0]?.name ?? null;
        });
        return url;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return url!;
}

async function openRemoteSheet(
  page: import('@playwright/test').Page,
  key: string,
  props: Record<string, unknown>,
  /** Prop names to stub as `() => {}` browser-side — functions cannot serialize through evaluate. */
  callbacks: string[] = [],
) {
  const url = await sheetManager(page);
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ([u, k, p, cbNames]) => {
            const mod = await import(/* @vite-ignore */ u as string);
            const merged = { ...(p as Record<string, unknown>) };
            for (const name of cbNames as string[]) merged[name] = () => {};
            mod.openSheet(k, merged);
            return mod.sheetState.panelId;
          },
          [url, key, props, callbacks],
        ),
      { timeout: 15_000 },
    )
    .toBe(key);
}

async function closeSheet(page: import('@playwright/test').Page) {
  const url = await sheetManager(page);
  await page.evaluate(async (u) => {
    const mod = await import(/* @vite-ignore */ u as string);
    mod.closeSheet();
  }, url);
  await expect(page.getByTestId('remote-sheet-mount')).toBeHidden({ timeout: 5_000 });
}

async function aiEntityRows(page: import('@playwright/test').Page, entity: string) {
  const res = await page.request.get(`/svc/ai/api/v1/entities/${entity}/list?page_size=5`);
  expect(res.status(), `${entity} list reachable`).toBe(200);
  const body = (await res.json()) as { rows: Record<string, unknown>[] };
  return body.rows;
}

test.beforeEach(async ({ page }) => {
  // The remote-page warm prefetch floods the performance resource buffer
  // (default 250 entries, oldest evicted first) — the sheet-manager module
  // URL fetched at layout mount would be evicted before the helper polls.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(8192));
  await loginAsTestAdmin(page);
  await page.goto('/system/ai', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('sidebar-profile-menu-trigger').waitFor({ state: 'visible', timeout: 15_000 });
  // Let the app settle so every shell module URL is in the resource buffer.
  await page.waitForTimeout(2000);
});

test('remote page mounts ai-pages.js content on /system/ai', async ({ page }) => {
  // The remote page chunk loads through the same module-assets route as the
  // sheets — a degraded service 502/503s it. Assert the content root mounts.
  await expect(page.getByTestId('remote-page-content')).toBeVisible({ timeout: 30_000 });
});

test('ai.modelCache remote sheet mounts ModelCacheSection', async ({ page }) => {
  await openRemoteSheet(page, 'ai.modelCache', { active_model_id: null, model_ranks: {} });
  const mount = page.getByTestId('remote-sheet-mount');
  await expect(mount).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('remote-sheet-content')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ai-model-cache-sheet')).toBeVisible({ timeout: 30_000 });
  await closeSheet(page);
});

test('ai.modelTestReport remote sheet renders a real model report', async ({ page }) => {
  const rows = await aiEntityRows(page, 'ai_model');
  const model = rows.find((r) => r['test_scores'] != null) ?? rows[0];
  expect(model, 'at least one ai_model row').toBeTruthy();

  await openRemoteSheet(page, 'ai.modelTestReport', { model });
  const mount = page.getByTestId('remote-sheet-mount');
  await expect(mount).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('remote-sheet-content')).toBeVisible({ timeout: 30_000 });
  // The report renders the model's own identity (name + model_id).
  await expect(mount).toContainText(String(model['model_id']), { timeout: 15_000 });
  await closeSheet(page);
});

test('ai.cerebellum remote sheet mounts the create form', async ({ page }) => {
  const models = await aiEntityRows(page, 'ai_model');
  const rows = await aiEntityRows(page, 'ai_cerebellum');

  await openRemoteSheet(page, 'ai.cerebellum', {
    models: models.filter((m) => m['is_alive'] !== false && m['is_compatible'] !== false),
    assistants: [],
    rows,
  }, ['onCreated']);
  const mount = page.getByTestId('remote-sheet-mount');
  await expect(mount).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ai-cerebellum-panel')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ai-cerebellum-save')).toBeVisible({ timeout: 20_000 });
  await closeSheet(page);
});

test('ai.modelImport remote sheet mounts the HF search surface', async ({ page }) => {
  await openRemoteSheet(page, 'ai.modelImport', { existing_model_ids: [] }, ['on_added']);
  const mount = page.getByTestId('remote-sheet-mount');
  await expect(mount).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ai-model-import-search')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('ai-model-import-add')).toBeVisible({ timeout: 20_000 });
  await closeSheet(page);
});
