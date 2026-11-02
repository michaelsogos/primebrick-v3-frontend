/**
 * sheet-manager — the sheet ENGINE. Resolution order is contract-level:
 * host-registered panels → remote `nav.sheets[]` declarations → reject
 * with a notification. Remote decl `default_options` are chrome hints —
 * the caller's options always win.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  pushNotification: vi.fn(),
  resolveRemoteSheetDecl: vi.fn(),
}));

vi.mock('$lib/errors/app-errors', () => ({
  pushNotification: mocks.pushNotification,
}));
vi.mock('$lib/shell/modules-shell.svelte', () => ({
  resolveRemoteSheetDecl: mocks.resolveRemoteSheetDecl,
}));

import {
  closeSheet,
  isSheetPanelKnown,
  openSheet,
  sheetState,
} from '$lib/shell/sheets/sheet-manager.svelte';

const REMOTE_DECL = {
  key: 'ai.modelCache',
  component_url: '/svc/ai/api/v1/module-assets/sheets/model-cache.js',
  default_options: { side: 'left' as const, modal: false, content_class: 'w-96' },
};

describe('sheet-manager engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sheetState.open = false;
    sheetState.panelId = null;
    sheetState.props = null;
    mocks.resolveRemoteSheetDecl.mockReturnValue(null);
  });

  it('isSheetPanelKnown: host registry ∪ remote decls', () => {
    expect(isSheetPanelKnown('shell.errors')).toBe(true);
    expect(isSheetPanelKnown('ai.modelCache')).toBe(false);
    mocks.resolveRemoteSheetDecl.mockReturnValue(REMOTE_DECL);
    expect(isSheetPanelKnown('ai.modelCache')).toBe(true);
  });

  it('opens a host-registered panel', () => {
    openSheet('shell.errors', {});
    expect(sheetState.open).toBe(true);
    expect(sheetState.panelId).toBe('shell.errors');
    expect(mocks.pushNotification).not.toHaveBeenCalled();
  });

  it('opens a remote-declared sheet and applies its chrome defaults', () => {
    mocks.resolveRemoteSheetDecl.mockReturnValue(REMOTE_DECL);
    openSheet('ai.modelCache', { active_model_id: 'm1' });
    expect(sheetState.open).toBe(true);
    expect(sheetState.panelId).toBe('ai.modelCache');
    expect(sheetState.props).toEqual({ active_model_id: 'm1' });
    expect(sheetState.side).toBe('left');
    expect(sheetState.modal).toBe(false);
    expect(sheetState.contentClass).toBe('w-96');
  });

  it("caller options override the decl's default_options", () => {
    mocks.resolveRemoteSheetDecl.mockReturnValue(REMOTE_DECL);
    openSheet('ai.modelCache', {}, { side: 'right', modal: true });
    expect(sheetState.side).toBe('right');
    expect(sheetState.modal).toBe(true);
  });

  it('rejects an unknown key with a notification — state untouched', () => {
    openSheet('evil.nonexistent', {});
    expect(sheetState.open).toBe(false);
    expect(sheetState.panelId).toBeNull();
    expect(mocks.pushNotification).toHaveBeenCalledWith(
      expect.objectContaining({ impact: 'MEDIUM', scope: 'Sheets', toast: true }),
    );
  });

  it('closeSheet clears panel state on a microtask', async () => {
    openSheet('shell.errors', {});
    closeSheet();
    expect(sheetState.open).toBe(false);
    await Promise.resolve();
    expect(sheetState.panelId).toBeNull();
  });
});
