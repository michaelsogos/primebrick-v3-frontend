/**
 * merge-delta — the per-field decision table for remote entity changes.
 *
 * Pure function, no Svelte dependencies: for every field in the audit
 * `delta`, if the local form has the field TAINTED the remote value must
 * not overwrite the user's draft — it becomes a CONFLICT (held aside for
 * manual resolution). Untouched fields get the silent merge: apply the
 * remote value and make sure the programmatic write did NOT leave the
 * field falsely tainted (superforms marks assignments tainted).
 *
 * `toFormValue` converts the raw record value into the control-bound
 * shape (JSON columns bind a serialized string) — owned by the caller,
 * which knows the entity meta.
 */
export interface FieldConflict {
	/** What the local user currently has in the field. */
	local: unknown;
	/** The incoming remote value (already converted to form shape). */
	remote: unknown;
	/** The pre-change base value from the audit delta (`old`). */
	base: unknown;
}

export interface MergeOutcome {
	/** Fields silently updated by the merge. */
	merged: string[];
	/** Fields kept as conflicts (locally tainted + remotely changed). */
	conflicts: Record<string, FieldConflict>;
}

export function mergeDelta(opts: {
	delta: Record<string, { old: unknown; new: unknown }>;
	isTainted: (field: string) => boolean;
	getField: (field: string) => unknown;
	setField: (field: string, value: unknown) => void;
	untaint: (field: string) => void;
	toFormValue: (field: string, raw: unknown) => unknown;
}): MergeOutcome {
	const merged: string[] = [];
	const conflicts: Record<string, FieldConflict> = {};

	for (const [field, change] of Object.entries(opts.delta)) {
		const remote = opts.toFormValue(field, change?.new);
		if (opts.isTainted(field)) {
			conflicts[field] = {
				local: opts.getField(field),
				remote,
				base: change?.old,
			};
			continue;
		}
		opts.setField(field, remote);
		// Programmatic assignment taints in superforms — a silent merge is
		// NOT a local edit, explicitly untaint or the field would look
		// user-modified (wrong guard prompts, wrong conflict detection on
		// the next remote change).
		opts.untaint(field);
		merged.push(field);
	}
	return { merged, conflicts };
}
