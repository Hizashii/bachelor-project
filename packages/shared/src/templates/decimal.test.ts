import { describe, expect, it } from "vitest";
import { parseDecimalInput } from "./decimal.js";

describe("parseDecimalInput", () => {
  it("accepts DA and EN decimal separators without changing the raw value", () => {
    expect(parseDecimalInput("12,50", "da")).toMatchObject({
      ok: true,
      value: 12.5,
    });
    expect(parseDecimalInput("12.50", "en")).toMatchObject({
      ok: true,
      value: 12.5,
    });
    expect(parseDecimalInput("1.234,50", "da")).toMatchObject({
      ok: true,
      value: 1234.5,
    });
    expect(parseDecimalInput("1,234.50", "en")).toMatchObject({
      ok: true,
      value: 1234.5,
    });
  });

  it("keeps blank distinct from explicit zero", () => {
    expect(parseDecimalInput("", "da")).toEqual({ ok: false, reason: "empty" });
    expect(parseDecimalInput("0", "da")).toMatchObject({ ok: true, value: 0 });
    expect(parseDecimalInput("0,00", "da")).toMatchObject({
      ok: true,
      value: 0,
    });
  });

  it("rejects incomplete or non-numeric values on validation", () => {
    expect(parseDecimalInput("12,", "da").ok).toBe(false);
    expect(parseDecimalInput("12.3.4", "en").ok).toBe(false);
    expect(parseDecimalInput("abc", "en").ok).toBe(false);
  });
});
