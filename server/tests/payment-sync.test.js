import { describe, it, expect } from "vitest";
import { invoiceStatusFor } from "../utils/paymentSync.js";

describe("invoiceStatusFor", () => {
  it("keeps an unpaid issued invoice issued", () => {
    expect(invoiceStatusFor(1000, 0, "issued")).toBe("issued");
  });

  it("marks a part payment partially_paid", () => {
    expect(invoiceStatusFor(1000, 400, "issued")).toBe("partially_paid");
  });

  it("marks a settled invoice paid", () => {
    expect(invoiceStatusFor(1000, 1000, "issued")).toBe("paid");
    expect(invoiceStatusFor(1000, 1000, "partially_paid")).toBe("paid");
  });

  it("treats a sub-paise shortfall as settled rather than leaving a stuck balance", () => {
    expect(invoiceStatusFor(1000, 999.999, "issued")).toBe("paid");
  });

  it("does not promote an overpayment past paid", () => {
    expect(invoiceStatusFor(1000, 1200, "issued")).toBe("paid");
  });

  it("never revives a cancelled invoice, whatever the money says", () => {
    expect(invoiceStatusFor(1000, 1000, "cancelled")).toBe("cancelled");
    expect(invoiceStatusFor(1000, 0, "cancelled")).toBe("cancelled");
  });

  it("leaves a draft as a draft until money actually arrives", () => {
    expect(invoiceStatusFor(1000, 0, "draft")).toBe("draft");
    expect(invoiceStatusFor(1000, 250, "draft")).toBe("partially_paid");
  });

  it("keeps an overdue invoice overdue while it is still unpaid", () => {
    // Mirroring a zero-value event must not quietly clear the overdue flag.
    expect(invoiceStatusFor(1000, 0, "overdue")).toBe("overdue");
    expect(invoiceStatusFor(1000, 100, "overdue")).toBe("partially_paid");
  });

  it("survives missing numbers instead of producing NaN states", () => {
    // A zero-total invoice stays issued rather than claiming to be paid: no
    // money moved, and its zero balance keeps it out of the chasing reports
    // anyway. What matters is that nothing unpaid is ever reported as settled.
    expect(invoiceStatusFor(0, 0, "issued")).toBe("issued");
    expect(invoiceStatusFor(undefined, undefined, "issued")).toBe("issued");
    expect(invoiceStatusFor(null, null, "draft")).toBe("draft");
  });
});
