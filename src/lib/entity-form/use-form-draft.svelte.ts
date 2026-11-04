/**
 * useFormDraft — browser-refresh draft persistence for EntityFormPage.
 * Wired unconditionally by the page: every metadata-driven form inherits
 * it, no per-route opt-in.
 *
 * Anti-stale contract — the draft is just another delta writer ("your
 * past self"), replayed with the SAME tainted semantics as collab merges:
 *   - restore applies ONLY keys the draft marked tainted, over the fresh
 *     base (record values / defaults). Untouched draft values are never
 *     read — collab merges, injects and computed defaults stay fresh.
 *   - detail + `record.version ≠ draft.base_version` → tainted keys become
 *     FieldConflicts (the existing collab conflict UI resolves them:
 *     `keep_mine` keeps the restored draft value, `use_remote` takes the
 *     server's — the draft value is applied up-front so keep_mine is the
 *     honest default).
 *   - the slot DELETES ITSELF when the form returns to pristine — an
 *     undone edit never haunts the next visit.
 *
 * Persistence is best-effort localStorage (quota/serialization failures
 * are swallowed — drafting must never break a form).
 */
import { browser } from '$app/environment';
import { SvelteSet } from 'svelte/reactivity';
import type { FieldConflict } from '$lib/collaboration/merge-delta';

const DRAFT_VERSION = 1;
const WRITE_DEBOUNCE_MS = 400;

export interface FormDraftDoc {
	v: number;
	data: Record<string, unknown>;
	tainted: Record<string, boolean>;
	base_version: number | null;
	saved_at: number;
}

export interface UseFormDraftOpts {
	/** Scoped storage key — null while identity/route deps are unresolved. */
	storageKey: () => string | null;
	/** Gate — the persist effect does NOTHING until the superForm exists:
	 *  a mount-time pristine read would otherwise delete the slot before
	 *  `restore()` ever runs (meta fetch can take longer than the
	 *  debounce). */
	ready: () => boolean;
	/** Declared form field keys — stale draft keys outside this set die silently. */
	fieldKeys: () => string[];
	/** Record version the form was loaded against (detail only; 0 on create). */
	baseVersion: () => number | bigint;
	data: () => Record<string, unknown>;
	tainted: () => Record<string, boolean>;
	hasTainted: () => boolean;
	setField: (key: string, value: unknown) => void;
	taintField: (key: string) => void;
}

export interface FormDraftApi {
	/** Count of draft-tainted values applied by `restore()`. */
	readonly restoredCount: number;
	/** Draft-vs-server conflicts (version mismatch) — merge into the collab map. */
	readonly conflicts: Record<string, FieldConflict>;
	/** Replay the stored draft onto the fresh base. Call ONCE, after the
	 *  superForm exists and its initial data is built. Idempotent. */
	restore: () => number;
	/** Delete the draft slot (submit success, reset, entity change). */
	clear: () => void;
}

function readDraft(key: string): FormDraftDoc | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const d = JSON.parse(raw) as FormDraftDoc;
		if (d?.v !== DRAFT_VERSION || typeof d.data !== 'object' || typeof d.tainted !== 'object')
			return null;
		return d;
	} catch {
		return null;
	}
}

export function useFormDraft(opts: UseFormDraftOpts): FormDraftApi {
	let restoredCount = $state(0);
	let conflicts = $state<Record<string, FieldConflict>>({});
	let restored = false;
	let writeTimer: ReturnType<typeof setTimeout> | null = null;

	function restore(): number {
		if (!browser || restored) return restoredCount;
		restored = true;
		const key = opts.storageKey();
		if (!key) return 0;
		const draft = readDraft(key);
		if (!draft) return 0;
		const validKeys = new SvelteSet(opts.fieldKeys());
		const data = opts.data();
		const base = opts.baseVersion();
		let applied = 0;
		for (const [k, v] of Object.entries(draft.data)) {
			// Only keys the draft marked tainted AND that still exist on the
			// form — untouched draft values are never read (fresh base wins),
			// removed-from-meta keys die silently.
			if (draft.tainted[k] !== true || !validKeys.has(k)) continue;
			const fresh = data[k];
			setFieldSafe(k, v);
			opts.taintField(k);
			applied++;
			if (Number(draft.base_version ?? 0) !== Number(base) && v !== fresh) {
				conflicts[k] = { local: v, remote: fresh, base: undefined };
			}
		}
		restoredCount = applied;
		return applied;
	}

	function setFieldSafe(k: string, v: unknown) {
		try {
			opts.setField(k, v);
		} catch {
			// value type can't reach the control — drop that key, not the form
		}
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
		conflicts = {};
	}

	// Persist — debounced, only while the form has user edits. Pristine
	// forms delete the slot: a fully undone draft must not restore later.
	$effect(() => {
		if (!browser || !opts.ready()) return;
		const data = opts.data();
		const tainted = opts.tainted();
		const dirty = opts.hasTainted();
		const key = opts.storageKey();
		if (writeTimer) clearTimeout(writeTimer);
		writeTimer = setTimeout(() => {
			if (!key) return;
			try {
				if (!dirty) {
					localStorage.removeItem(key);
					return;
				}
				const doc: FormDraftDoc = {
					v: DRAFT_VERSION,
					data,
					tainted,
					base_version: Number(opts.baseVersion()) || null,
					saved_at: Date.now(),
				};
				localStorage.setItem(key, JSON.stringify(doc));
			} catch {
				// quota/serialization — drafting is best-effort, never a form failure
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
		get conflicts() {
			return conflicts;
		},
		restore,
		clear,
	};
}
