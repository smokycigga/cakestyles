import { describe, it, expect } from "vitest";
import { toCSV } from "../utils/csv.js";
import { resolveRange, istDateString, addDaysIst, istToUtc } from "../utils/dates.js";
import { slugify, normalizePhone } from "../utils/misc.js";

describe("CSV serializer", () => {
  it("escapes quotes, commas and newlines", () => {
    const csv = toCSV(
      [{ name: 'Say "hi"', note: "a,b", multi: "line1\nline2" }],
      [{ label: "name", key: "name" }, { label: "note", key: "note" }, { label: "multi", key: "multi" }]
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("name,note,multi");
    expect(lines[1]).toBe('"Say ""hi""","a,b","line1\nline2"');
  });

  it("supports custom getters", () => {
    const csv = toCSV([{ n: 1 }], [{ label: "x", get: (r) => r.n * 2 }]);
    expect(csv.split("\r\n")[1]).toBe("2");
  });
});

describe("IST date boundaries (PRD §22.9)", () => {
  it("converts IST midnight to correct UTC instant", () => {
    // 2026-08-17 00:00 IST == 2026-08-16 18:30 UTC
    const utc = istToUtc("2026-08-17", "00:00");
    expect(utc.toISOString()).toBe("2026-08-16T18:30:00.000Z");
  });

  it("adds days across month boundaries", () => {
    expect(addDaysIst("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysIst("2026-02-28", 1)).toBe("2026-03-01"); // 2026 not a leap year
  });

  it("resolves presets to ordered ranges", () => {
    const { from, to } = resolveRange({ range: "7d" });
    expect(from < to).toBe(true);
    const days = (to - from) / 86400000;
    expect(days).toBeGreaterThanOrEqual(6.9);
    expect(days).toBeLessThanOrEqual(7.1);
  });

  it("supports custom from/to ranges", () => {
    const { from } = resolveRange({ from: "2026-01-01", to: "2026-01-31" });
    expect(from.toISOString()).toBe("2025-12-31T18:30:00.000Z");
  });

  it("gives range=all no lower bound, so long histories are not cut off", () => {
    const { from, to } = resolveRange({ range: "all" });
    expect(from.getTime()).toBe(0);
    // Still bounded at the top, so "all" cannot sweep up a future-dated order.
    expect(istDateString(to)).toBe(istDateString());
  });
});

describe("misc helpers", () => {
  it("slugifies names", () => {
    expect(slugify("Belgian Chocolate Truffle Cake!")).toBe("belgian-chocolate-truffle-cake");
  });

  it("normalizes phone numbers", () => {
    expect(normalizePhone("+91 98200 11223")).toBe("9820011223");
    expect(normalizePhone("09820011223")).toBe("9820011223");
    expect(normalizePhone("9820011223")).toBe("9820011223");
  });
});

