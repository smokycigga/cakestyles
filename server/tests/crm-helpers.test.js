import { describe, expect, it } from "vitest";

import { buildTaskFilter, taskQueueWindow } from "../controllers/taskController.js";
import {
  computeCustomerSegments,
  detectImportantDates,
  nextRecurringDate,
} from "../controllers/crmController.js";

const now = new Date("2026-08-17T12:00:00.000Z");

const customer = (id, fields = {}) => ({
  _id: id,
  name: `Customer ${id}`,
  phone: id,
  email: `${id}@example.com`,
  tags: [],
  importantDates: [],
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  ...fields,
});

describe("CRM task queues", () => {
  it("uses UTC day boundaries for overdue, today, and upcoming", () => {
    expect(taskQueueWindow("overdue", now)).toEqual({ $lt: new Date("2026-08-17T00:00:00.000Z") });
    expect(taskQueueWindow("today", now)).toEqual({
      $gte: new Date("2026-08-17T00:00:00.000Z"),
      $lt: new Date("2026-08-18T00:00:00.000Z"),
    });
    expect(taskQueueWindow("upcoming", now)).toEqual({ $gte: new Date("2026-08-18T00:00:00.000Z") });
  });

  it("excludes closed tasks from queues unless a status is requested", () => {
    expect(buildTaskFilter({ queue: "overdue", assignedTo: "user-1" }, now)).toEqual({
      assignedTo: "user-1",
      dueAt: { $lt: new Date("2026-08-17T00:00:00.000Z") },
      status: { $nin: ["completed", "cancelled"] },
    });
    expect(buildTaskFilter({ queue: "today", status: "completed" }, now).status).toBe("completed");
  });
});

describe("CRM important dates", () => {
  it("finds the next annual occurrence across a year boundary", () => {
    expect(nextRecurringDate("1990-01-02", new Date("2026-12-30T10:00:00Z"))?.toISOString())
      .toBe("2027-01-02T00:00:00.000Z");
  });

  it("does not convert February 29 into February 28 in non-leap years", () => {
    expect(nextRecurringDate("2000-02-29", new Date("2026-01-01T00:00:00Z"))?.toISOString())
      .toBe("2028-02-29T00:00:00.000Z");
  });

  it("returns recurring dates within the configured inclusive window", () => {
    const dates = detectImportantDates([
      customer("a", { name: "Asha", importantDates: [{ label: "Birthday", date: "1990-08-17" }] }),
      customer("b", { name: "Bina", importantDates: [{ label: "Anniversary", date: "2010-08-22" }] }),
      customer("c", { name: "Chitra", importantDates: [{ label: "Birthday", date: "1980-08-23" }] }),
    ], 5, now);

    expect(dates.map((entry) => [entry.customer.name, entry.daysUntil])).toEqual([
      ["Asha", 0],
      ["Bina", 5],
    ]);
  });
});

describe("CRM customer segments", () => {
  it("computes overlapping behavioral and financial segments", () => {
    const customers = [
      customer("vip", { createdAt: new Date("2026-08-01T00:00:00Z"), importantDates: [{ label: "Birthday", date: "1990-08-20" }] }),
      customer("risk"),
      customer("dormant"),
      customer("never"),
    ];
    const orders = [
      { customer: "vip", status: "completed", grandTotal: 6000, createdAt: new Date("2026-08-05T00:00:00Z") },
      { customer: "vip", status: "completed", grandTotal: 5000, createdAt: new Date("2026-08-10T00:00:00Z") },
      { customer: "risk", status: "completed", grandTotal: 500, createdAt: new Date("2026-05-01T00:00:00Z") },
      { customer: "dormant", status: "completed", grandTotal: 800, createdAt: new Date("2025-01-01T00:00:00Z") },
      { customer: "risk", status: "cancelled", grandTotal: 99999, createdAt: new Date("2026-08-01T00:00:00Z") },
    ];
    const invoices = [
      { customer: "risk", status: "overdue", balanceDue: 250 },
      { customer: "vip", status: "paid", balanceDue: 100 },
    ];

    const segments = computeCustomerSegments(customers, orders, invoices, { now });
    expect(segments.vip.map((item) => item._id)).toEqual(["vip"]);
    expect(segments.repeat.map((item) => item._id)).toEqual(["vip"]);
    expect(segments.new.map((item) => item._id)).toEqual(["vip"]);
    expect(segments.at_risk.map((item) => item._id)).toEqual(["risk"]);
    expect(segments.dormant.map((item) => item._id)).toEqual(["dormant", "never"]);
    expect(segments.outstanding[0].outstandingBalance).toBe(250);
    expect(segments.birthday_upcoming.map((item) => item._id)).toEqual(["vip"]);
  });
});
