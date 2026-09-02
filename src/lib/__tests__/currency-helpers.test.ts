import { describe, it, expect } from "vitest";
import {
  getCurrencyInfo,
  currencySymbol,
  currencyDecimals,
  getAllCurrencies,
  defaultCurrencyForLang,
  formatMoney,
} from "$lib/currency/currency-helpers";

describe("getCurrencyInfo", () => {
  it("returns metadata for EUR", () => {
    const info = getCurrencyInfo("EUR");
    expect(info).not.toBeNull();
    expect(info?.code).toBe("EUR");
    expect(info?.name).toBe("Euro");
    expect(info?.symbol).toBe("€");
    expect(info?.decimals).toBe(2);
  });

  it("returns metadata for USD", () => {
    const info = getCurrencyInfo("USD");
    expect(info).not.toBeNull();
    expect(info?.code).toBe("USD");
    expect(info?.symbol).toBe("$");
    expect(info?.decimals).toBe(2);
  });

  it("returns metadata for JPY (0 decimals)", () => {
    const info = getCurrencyInfo("JPY");
    expect(info).not.toBeNull();
    expect(info?.code).toBe("JPY");
    expect(info?.decimals).toBe(0);
  });

  it("returns null for unknown code", () => {
    expect(getCurrencyInfo("ZZZ")).toBeNull();
  });
});

describe("currencySymbol", () => {
  it("returns the symbol for a known currency", () => {
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("USD")).toBe("$");
  });

  it("falls back to the code for an unknown currency", () => {
    expect(currencySymbol("ZZZ")).toBe("ZZZ");
  });
});

describe("currencyDecimals", () => {
  it("returns 2 for EUR", () => {
    expect(currencyDecimals("EUR")).toBe(2);
  });

  it("returns 0 for JPY", () => {
    expect(currencyDecimals("JPY")).toBe(0);
  });

  it("falls back to 2 for unknown currency", () => {
    expect(currencyDecimals("ZZZ")).toBe(2);
  });
});

describe("getAllCurrencies", () => {
  it("returns a non-empty list with EUR and USD", () => {
    const list = getAllCurrencies();
    expect(list.length).toBeGreaterThan(0);
    const codes = list.map((c) => c.code);
    expect(codes).toContain("EUR");
    expect(codes).toContain("USD");
  });

  it("includes a label string on each entry", () => {
    const list = getAllCurrencies();
    for (const c of list) {
      expect(typeof c.label).toBe("string");
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});

describe("defaultCurrencyForLang", () => {
  it("derives USD from en-US", () => {
    expect(defaultCurrencyForLang("en-US")).toBe("USD");
  });

  it("derives EUR from it-IT", () => {
    expect(defaultCurrencyForLang("it-IT")).toBe("EUR");
  });

  it("falls back to EUR when no country part", () => {
    expect(defaultCurrencyForLang("en")).toBe("EUR");
  });

  it("falls back to EUR for unknown country", () => {
    expect(defaultCurrencyForLang("xx-XX")).toBe("EUR");
  });
});

describe("formatMoney", () => {
  it("formats EUR in en-US locale", () => {
    const s = formatMoney(99.99, "en-US", "EUR");
    // Should contain the € symbol and the number 99.99
    expect(s).toContain("99.99");
    expect(s).toMatch(/€|EUR/);
  });

  it("formats JPY with no decimals", () => {
    const s = formatMoney(1000, "ja-JP", "JPY");
    // JPY has 0 decimals; the formatted string should contain 1000 without .00
    expect(s).toContain("1,000");
    expect(s).not.toContain(".00");
  });

  it("falls back to '<amount> <code>' for invalid currency", () => {
    // "INVALID" is not a valid ISO 4217 code → Intl.NumberFormat throws → fallback
    const s = formatMoney(42, "en-US", "INVALID");
    expect(s).toBe("42 INVALID");
  });
});
