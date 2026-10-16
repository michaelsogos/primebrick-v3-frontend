import { describe, it, expect } from "vitest";
import { dbMigrationBase } from "$lib/api";

/**
 * The db_patch system module is reachable through two transports:
 * the backend answers directly, microservices via the governed /ws/<code>
 * proxy (which exempts this prefix for `migration_failed` instances).
 */
describe("dbMigrationBase", () => {
  it("maps 'be' to the direct BE route", () => {
    expect(dbMigrationBase("be")).toBe("/api/v1/system/db-migration");
  });

  it("maps microservice codes to the /ws/<code> proxy", () => {
    expect(dbMigrationBase("ai")).toBe("/ws/ai/api/v1/system/db-migration");
    expect(dbMigrationBase("job")).toBe("/ws/job/api/v1/system/db-migration");
    expect(dbMigrationBase("emailsender")).toBe(
      "/ws/emailsender/api/v1/system/db-migration",
    );
    expect(dbMigrationBase("webhook")).toBe(
      "/ws/webhook/api/v1/system/db-migration",
    );
  });

  it("encodes non-trivial codes in the proxy path", () => {
    expect(dbMigrationBase("my service")).toBe(
      "/ws/my%20service/api/v1/system/db-migration",
    );
  });
});
