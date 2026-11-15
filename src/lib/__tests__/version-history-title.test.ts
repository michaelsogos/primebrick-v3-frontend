import { describe, it, expect } from "vitest";
import {
	auditActionKey,
	changedBySheetTarget,
} from "../entity-list/sheets/panels/version-history-title";

describe("auditActionKey — served-truth key contract", () => {
	it("maps wire actions to the lowercase generic block", () => {
		// Regression: the historical key was camelCase + uppercase +
		// entity-less (`system.entities.versionHistory.actions.INSERT`) —
		// it never resolved, so titles showed the raw enum. The generic
		// `version_history` block with a lowercase action is the one
		// served truth for the closed AuditAction vocabulary.
		expect(auditActionKey("INSERT")).toBe(
			"system.entities.version_history.actions.insert",
		);
		expect(auditActionKey("UPDATE")).toBe(
			"system.entities.version_history.actions.update",
		);
		expect(auditActionKey("SOFT_DELETE")).toBe(
			"system.entities.version_history.actions.soft_delete",
		);
		expect(auditActionKey("HARD_DELETE")).toBe(
			"system.entities.version_history.actions.hard_delete",
		);
		expect(auditActionKey("RESTORE")).toBe(
			"system.entities.version_history.actions.restore",
		);
		expect(auditActionKey("CLONE")).toBe(
			"system.entities.version_history.actions.clone",
		);
	});
});

describe("changedBySheetTarget — actor drill routing", () => {
	it("routes system:<code> actors to service.record on the code", () => {
		expect(changedBySheetTarget("system:job-handler")).toEqual({
			panel: "service.record",
			props: { code: "job-handler" },
		});
	});

	it("routes uuid actors to entity.record on user_profile", () => {
		const uuid = "01a1dc71-2480-7cd8-936e-85a9ac599582";
		expect(changedBySheetTarget(uuid)).toEqual({
			panel: "entity.record",
			props: { entity: "user_profile", value: uuid },
		});
	});

	it("routes non-uuid actors to user_profile too — the sheet owns pseudoRef", () => {
		// `initial-setup`, seed aliases, garbage actors: `entity.record`
		// renders the pseudoRef hero itself — filtering here would hide
		// the second error state the contract relies on.
		expect(changedBySheetTarget("initial-setup")).toEqual({
			panel: "entity.record",
			props: { entity: "user_profile", value: "initial-setup" },
		});
	});
});
