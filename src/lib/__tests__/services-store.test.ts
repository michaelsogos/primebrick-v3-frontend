import { describe, it, expect } from "vitest";
import { aggregateStatus, groupByCode } from "$lib/services-store.svelte";
import type { ServiceInfo } from "$lib/api-types";

function makeService(overrides: Partial<ServiceInfo> = {}): ServiceInfo {
  return {
    code: "EMAILSENDER",
    base_url: "http://localhost:3003",
    endpoints: {},
    is_behind_scaler: false,
    status: "online",
    is_enabled: true,
    icon_type: "icon",
    ...overrides,
  };
}

describe("aggregateStatus", () => {
  it("all online → 'online'", () => {
    const services = [makeService({ status: "online" }), makeService({ status: "online" })];
    expect(aggregateStatus(services)).toBe("online");
  });

  it("1 online + 1 offline → 'going_live'", () => {
    const services = [makeService({ status: "online" }), makeService({ status: "offline" })];
    expect(aggregateStatus(services)).toBe("going_live");
  });

  it("0 online, all offline → 'offline'", () => {
    const services = [makeService({ status: "offline" }), makeService({ status: "offline" })];
    expect(aggregateStatus(services)).toBe("offline");
  });

  it("empty array → 'offline'", () => {
    expect(aggregateStatus([])).toBe("offline");
  });

  it("1 online + 1 going_live → 'going_live'", () => {
    const services = [makeService({ status: "online" }), makeService({ status: "going_live" })];
    expect(aggregateStatus(services)).toBe("going_live");
  });

  it("all going_live (no online) → 'offline'", () => {
    const services = [makeService({ status: "going_live" }), makeService({ status: "going_live" })];
    expect(aggregateStatus(services)).toBe("offline");
  });
});

describe("groupByCode", () => {
  it("groups instances by code", () => {
    const services = [
      makeService({ code: "EMAILSENDER", base_url: "http://a:3003" }),
      makeService({ code: "EMAILSENDER", base_url: "http://b:3003" }),
    ];
    const map = groupByCode(services);
    expect(map.size).toBe(1);
    expect(map.get("EMAILSENDER")?.length).toBe(2);
  });

  it("single instance → map with 1 entry", () => {
    const services = [makeService({ code: "EMAILSENDER" })];
    const map = groupByCode(services);
    expect(map.size).toBe(1);
    expect(map.get("EMAILSENDER")?.length).toBe(1);
  });

  it("multiple codes → multiple map entries", () => {
    const services = [
      makeService({ code: "EMAILSENDER" }),
      makeService({ code: "AUTHSERVICE" }),
    ];
    const map = groupByCode(services);
    expect(map.size).toBe(2);
    expect(map.has("EMAILSENDER")).toBe(true);
    expect(map.has("AUTHSERVICE")).toBe(true);
  });

  it("empty array → empty map", () => {
    const map = groupByCode([]);
    expect(map.size).toBe(0);
  });
});
