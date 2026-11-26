/**
 * useDictDraft — browser-refresh draft persistence for EntityDictPage.
 * The dict page is the list+form hybrid; its unsaved state is richer
 * than a flat form so the doc carries the three legs separately:
 *
 *   taints       { uid → { field → value } } — ONLY the tainted keys per
 *                saved row (the anti-stale contract: untouched draft
 *                values are never read back, the fresh base wins).
 *   row_versions { uid → version }           — the base each taint was
 *                authored on (drift detection lives in the doc; the
 *                save path's CAS still owns the honest failure).
 *   pendings     [{ id, values }]            — confirmed-not-saved rows,
 *                insertion order (append semantics, D2).
 *   composer     { values } | null           — the open composer mid-edit.
 *   draft_seq    number                      — pending-id sequence, so a
 *                restored page never re-issues colliding `d<n>` ids.
 *   translations KeyMap                      — snapshot of the page's
 *                pending-translation queue (owner = basePath) so restored
 *                label_key values never save orphan keys.
 *
 * Same contract as `useFormDraft`: scoped key (org + actor + entity),
 * debounced best-effort localStorage, restore ONCE after the baseline
 * exists, the slot self-deletes when the page returns to pristine.
 */
import { browser } from '$app/environment';
import { extJsonParse, extJsonStringify } from '$lib/api-ext';
import type { KeyMap, PendingTranslationEntry } from '$lib/i18n/pending-translations.svelte';

const DRAFT_VERSION = 1;
const WRITE_DEBOUNCE_MS = 400;

export interface DictDraftDoc {
  v: number;
  taints: Record<string, Record<string, unknown>>;
  row_versions: Record<string, number>;
  pendings: { id: string; values: Record<string, unknown> }[];
  composer: { values: Record<string, unknown> } | null;
  draft_seq: number;
  translations: KeyMap | null;
  saved_at: number;
}

export interface UseDictDraftOpts {
  /** Scoped storage key — null until entity + actor resolve. */
  storageKey: () => string | null;
  /** Gate — persist does NOTHING until the rows baseline exists, or a
   *  mount-time pristine read would delete the slot before restore. */
  ready: () => boolean;
  /** uid → tainted field values only (not the whole values map). */
  taints: () => Record<string, Record<string, unknown>>;
  /** uid → the row version each taint was authored against. */
  rowVersions: () => Record<string, number>;
  pendings: () => { id: string; values: Record<string, unknown> }[];
  composer: () => { values: Record<string, unknown> } | null;
  draftSeq: () => number;
  /** Live snapshot of the page's translation queue (peek, not drain). */
  translations: () => KeyMap | undefined;
  /** Anything worth persisting — taints, pendings or an open composer.
   *  A translation-queue-only state is NOT dirty: it can't be saved
   *  (canSave gates on row work), so persisting it would restore dead
   *  entries. */
  dirty: () => boolean;
  /** Apply restored taints onto rows that still exist (per uid). */
  restoreTaints: (t: DictDraftDoc['taints'], versions: DictDraftDoc['row_versions']) => number;
  restorePendings: (p: DictDraftDoc['pendings'], seq: number) => void;
  restoreComposer: (c: NonNullable<DictDraftDoc['composer']>) => void;
  /** Re-queue a key's translations under the page owner. */
  restoreTranslation: (key: string, langs: Record<string, PendingTranslationEntry>) => void;
}

export interface DictDraftApi {
  /** Work units applied by `restore()` (taint keys + pendings + composer). */
  readonly restoredCount: number;
  /** Replay the stored draft — call ONCE after the rows baseline exists. */
  restore: () => number;
  /** Delete the draft slot (save success, reset). */
  clear: () => void;
}

function readDraft(key: string): DictDraftDoc | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = extJsonParse(raw) as DictDraftDoc;
    // ext-json decodes EVERY integer as native bigint — `d.v` arrives as
    // `1n`; compare numerically or the doc never validates.
    if (Number(d?.v) !== DRAFT_VERSION || typeof d.taints !== 'object' || !Array.isArray(d.pendings))
      return null;
    return d;
  } catch {
    return null;
  }
}

export function useDictDraft(opts: UseDictDraftOpts): DictDraftApi {
  let restoredCount = $state(0);
  let restored = false;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;

  function restore(): number {
    if (!browser || restored) return restoredCount;
    restored = true;
    const key = opts.storageKey();
    if (!key) return 0;
    const draft = readDraft(key);
    if (!draft) return 0;
    let applied = opts.restoreTaints(draft.taints ?? {}, draft.row_versions ?? {});
    if (draft.pendings.length > 0) {
      // draft_seq rides the doc as a bigint (ext-json integer) — Number()
      // before Math.max or the comparison throws.
      opts.restorePendings(draft.pendings, Number(draft.draft_seq ?? draft.pendings.length));
      applied += draft.pendings.length;
    }
    if (draft.composer && Object.keys(draft.composer.values).length > 0) {
      opts.restoreComposer(draft.composer);
      applied += 1;
    }
    for (const [key, langs] of Object.entries(draft.translations ?? {})) {
      opts.restoreTranslation(key, langs);
    }
    restoredCount = applied;
    return applied;
  }

  function clear() {
    if (!browser) return;
    const key = opts.storageKey();
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch {
        // best-effort
      }
    }
  }

  // Persist — debounced, only while work exists. A pristine page deletes
  // the slot: fully undone work must not restore on the next visit.
  $effect(() => {
    if (!browser || !opts.ready()) return;
    const taints = opts.taints();
    const rowVersions = opts.rowVersions();
    const pendings = opts.pendings();
    const composer = opts.composer();
    const seq = opts.draftSeq();
    const translations = opts.translations();
    const dirty = opts.dirty();
    const key = opts.storageKey();
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      if (!key) return;
      try {
        if (!dirty) {
          localStorage.removeItem(key);
          return;
        }
        const doc: DictDraftDoc = {
          v: DRAFT_VERSION,
          taints,
          row_versions: rowVersions,
          pendings,
          composer,
          draft_seq: seq,
          translations: translations ?? null,
          saved_at: Date.now(),
        };
        localStorage.setItem(key, extJsonStringify(doc));
      } catch {
        // quota/serialization — drafting is best-effort, never a page failure
      }
    }, WRITE_DEBOUNCE_MS);
    return () => {
      if (writeTimer) clearTimeout(writeTimer);
    };
  });

  return {
    get restoredCount() {
      return restoredCount;
    },
    restore,
    clear,
  };
}
