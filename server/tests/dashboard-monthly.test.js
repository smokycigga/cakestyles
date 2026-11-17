// GET /api/dashboard — the month-by-month section.
//
// The interesting part is the calendar arithmetic, not the totals: month keys
// have to roll over a year boundary, the current month is always partial, and
// "this month vs last month" is only a fair comparison up to the same day. The
// assertions below are written so they hold on any day the suite happens to run.
//
// helpers/integration.js must be imported before ../app.js — see the safety
// note in that file.
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import { signIn, today, useMemoryDatabase } from "./helpers/integration.js";
import { makeCustomer, makeOrder } from "./helpers/factories.js";
import app from "../app.js";
import Order from "../models/Order.js";

useMemoryDatabase();

const auth = async () => (await signIn("owner")).auth;

// Mongoose stamps createdAt itself on create, so a seeded order is back-dated
// through the driver afterwards.
const placeOrderOn = async (isoDate, overrides = {}) => {
  const order = await makeOrder(overrides);
  await Order.collection.updateOne(
    { _id: order._id },
    { $set: { createdAt: new Date(`${isoDate}T10:00:00+05:30`) } }
  );
  return order;
};

const monthKey = (isoDate) => isoDate.slice(0, 7);

const shiftMonthKey = (key, delta) => {
  const [year, month] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};

const lastDayOf = (key) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const getDashboard = async () => {
  const res = await request(app).get("/api/dashboard").set("Authorization", await auth()).expect(200);
  return res.body;
};

describe("GET /api/dashboard — month by month", () => {
  let currentMonth;
  let previousMonth;

  beforeEach(async () => {
    currentMonth = monthKey(today());
    previousMonth = shiftMonthKey(currentMonth, -1);
  });

  it("returns one bucket per month, oldest first, ending with the current month", async () => {
    const { monthly } = await getDashboard();

    expect(monthly).toHaveLength(6);
    expect(monthly.at(-1).month).toBe(currentMonth);
    expect(monthly[0].month).toBe(shiftMonthKey(currentMonth, -5));

    const keys = monthly.map((m) => m.month);
    expect([...keys].sort()).toEqual(keys); // already in ascending order
  });

  it("honours the months parameter and clamps it to a sane range", async () => {
    const three = await request(app)
      .get("/api/dashboard?months=3")
      .set("Authorization", await auth())
      .expect(200);
    expect(three.body.monthly).toHaveLength(3);

    const tooMany = await request(app)
      .get("/api/dashboard?months=500")
      .set("Authorization", await auth())
      .expect(200);
    expect(tooMany.body.monthly).toHaveLength(24);

    const tooFew = await request(app)
      .get("/api/dashboard?months=0")
      .set("Authorization", await auth())
      .expect(200);
    // 0 is not a usable window, so it falls back to the default rather than
    // returning an empty chart.
    expect(tooFew.body.monthly).toHaveLength(6);
  });

  it("adds each month's orders to the right bucket", async () => {
    await placeOrderOn(`${currentMonth}-01`, { items: [] , discount: 0 });
    await placeOrderOn(`${currentMonth}-01`);
    await placeOrderOn(`${previousMonth}-01`);
    await placeOrderOn(`${previousMonth}-15`);

    const { monthly } = await getDashboard();
    const current = monthly.find((m) => m.month === currentMonth);
    const previous = monthly.find((m) => m.month === previousMonth);

    expect(current.orders).toBe(2);
    expect(previous.orders).toBe(2);
    expect(current.revenue).toBeGreaterThan(0);
    expect(current.aov).toBeCloseTo(current.revenue / current.orders, 2);
  });

  it("marks only the current month as partial", async () => {
    const { monthly } = await getDashboard();
    expect(monthly.filter((m) => m.partial).map((m) => m.month)).toEqual([currentMonth]);
  });

  it("leaves cancelled orders out of every bucket", async () => {
    await placeOrderOn(`${currentMonth}-01`);
    const before = (await getDashboard()).monthly.find((m) => m.month === currentMonth);

    await placeOrderOn(`${currentMonth}-02`, { status: "cancelled" });
    const after = (await getDashboard()).monthly.find((m) => m.month === currentMonth);

    expect(after.orders).toBe(before.orders);
    expect(after.revenue).toBe(before.revenue);
  });

  it("compares this month against the same days of last month, not the whole month", async () => {
    await placeOrderOn(`${currentMonth}-01`);
    await placeOrderOn(`${previousMonth}-01`); // always inside the same-period window
    await placeOrderOn(`${previousMonth}-${String(lastDayOf(previousMonth)).padStart(2, "0")}`);

    const { monthComparison } = await getDashboard();

    // The full previous month contains both of its orders.
    expect(monthComparison.previousFull.orders).toBe(2);
    // The same-period window starts on the 1st, so it always includes at least
    // one — and can never exceed the whole month.
    expect(monthComparison.previousSamePeriod.orders).toBeGreaterThanOrEqual(1);
    expect(monthComparison.previousSamePeriod.orders).toBeLessThanOrEqual(monthComparison.previousFull.orders);

    expect(monthComparison.current.orders).toBe(1);
    expect(monthComparison.current.label).toBeTruthy();
  });

  it("reports deltas that match the figures it returns", async () => {
    await placeOrderOn(`${currentMonth}-01`);
    await placeOrderOn(`${previousMonth}-01`);

    const { monthComparison } = await getDashboard();
    const { current, previousSamePeriod, delta } = monthComparison;

    expect(delta.revenue).toBeCloseTo(current.revenue - previousSamePeriod.revenue, 2);
    expect(delta.orders).toBe(current.orders - previousSamePeriod.orders);

    if (previousSamePeriod.revenue > 0) {
      expect(delta.revenuePct).toBeCloseTo(
        ((current.revenue - previousSamePeriod.revenue) / previousSamePeriod.revenue) * 100,
        1
      );
    } else {
      // No baseline to divide by — reported as null rather than Infinity.
      expect(delta.revenuePct).toBeNull();
    }
  });

  it("counts a customer as new only in the month of their first order", async () => {
    const customer = await makeCustomer();
    await placeOrderOn(`${previousMonth}-05`, { customer });
    await placeOrderOn(`${currentMonth}-05`, { customer });

    const { monthly } = await getDashboard();
    const previous = monthly.find((m) => m.month === previousMonth);
    const current = monthly.find((m) => m.month === currentMonth);

    expect(previous.newCustomers).toBe(1);
    expect(current.newCustomers).toBe(0);
    // They are still counted as an active customer in both months.
    expect(current.customers).toBe(1);
  });
});
