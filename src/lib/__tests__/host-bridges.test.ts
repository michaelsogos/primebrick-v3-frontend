/**
 * host-bridges — the built-in `ctx.components` entries every remote page
 * receives: `openSheet` (panel-key validated) and `mfaStepUp` (delegates to
 * the host step-up composable). These are contract-level tests: the bridges
 * are what D5/D6 grant every remote chunk.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/errors/app-errors', () => ({
  pushNotification: vi.fn(),
}));
vi.mock('$lib/shell/sheets/sheet-manager.svelte', () => ({
  SHEET_PANEL_IDS: ['shell.errors', 'shell.aiCerebellum'],
  openSheet: vi.fn(),
}));

import { buildHostComponents } from '$lib/components/remote-page/host-bridges';
import { openSheet, SHEET_PANEL_IDS } from '$lib/shell/sheets/sheet-manager.svelte';
import { pushNotification } from '$lib/errors/app-errors';

const fakeStepUp = () => ({
  dialogOpen: false,
  pendingAction: '',
  pendingTargetResource: '',
  executeWithToken: vi.fn(async () => new Response(null, { status: 200 })),
  handleAuthorized: vi.fn(),
});

describe('buildHostComponents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('injects mfaStepUp + openSheet into the caller record (mutates same object)', () => {
    const caller = { remote: { marker: true } };
    const comps = buildHostComponents(fakeStepUp() as never, caller);
    expect(comps).toBe(caller);
    expect(typeof comps.mfaStepUp).toBe('function');
    expect(typeof comps.openSheet).toBe('function');
    expect(comps.remote).toEqual({ marker: true });
  });

  it('creates a fresh record when caller passes none', () => {
    const comps = buildHostComponents(fakeStepUp() as never);
    expect(typeof comps.mfaStepUp).toBe('function');
    expect(typeof comps.openSheet).toBe('function');
  });

  it('caller overrides keep precedence (??=) — tests can inject fakes', () => {
    const custom = vi.fn();
    const comps = buildHostComponents(fakeStepUp() as never, { mfaStepUp: custom });
    expect(comps.mfaStepUp).toBe(custom);
  });

  it('mfaStepUp delegates to the step-up composable with requestFn + context', async () => {
    const stepUp = fakeStepUp();
    const comps = buildHostComponents(stepUp as never);
    const requestFn = vi.fn(async () => new Response(null, { status: 200 }));
    const resp = await comps.mfaStepUp!(requestFn, { action: 'delete', target_resource: 'ai_model' });
    expect(resp.status).toBe(200);
    expect(stepUp.executeWithToken).toHaveBeenCalledWith(requestFn, {
      action: 'delete',
      target_resource: 'ai_model',
    });
  });

  it('openSheet opens a registered panel', () => {
    const comps = buildHostComponents(fakeStepUp() as never);
    comps.openSheet!('shell.aiCerebellum', { models: [] }, { side: 'right' });
    expect(openSheet).toHaveBeenCalledWith('shell.aiCerebellum', { models: [] }, { side: 'right' });
    expect(pushNotification).not.toHaveBeenCalled();
  });

  it('openSheet rejects an unknown panel key with a notification', () => {
    const comps = buildHostComponents(fakeStepUp() as never);
    comps.openSheet!('evil.nonexistent', {});
    expect(openSheet).not.toHaveBeenCalled();
    expect(pushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ impact: 'MEDIUM', scope: 'RemotePage' }),
    );
  });

  it('SHEET_PANEL_IDS is the runtime source SheetPanelId derives from', () => {
    expect(SHEET_PANEL_IDS.length).toBeGreaterThan(0);
    expect(SHEET_PANEL_IDS).toContain('shell.aiCerebellum');
  });
});
