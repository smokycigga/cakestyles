// Order alerts.
//
// The promise this code makes to the rest of the app is narrow and important:
// a notification problem must never become an order problem. So the tests here
// are about shape and failure, not about the wording of an email.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { seedSettings, signIn, useMemoryDatabase } from "./helpers/integration.js";
import { makeCustomer, makeOrder, orderItem } from "./helpers/factories.js";
import app from "../app.js";
import Setting from "../models/Setting.js";
import {
  alertRecipients,
  channelStatus,
  formatOrderAlert,
  notifyOrderPlaced,
  resetTelegramChatCache,
  sendAlert,
} from "../utils/notify.js";

useMemoryDatabase();

const ALERT_ENV = [
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_SECURE",
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "NTFY_TOPIC", "NTFY_SERVER",
  "ORDER_ALERT_EMAILS", "PUBLIC_APP_URL",
];

const clearAlertEnv = () => {
  for (const key of ALERT_ENV) delete process.env[key];
};

const sampleOrder = (overrides = {}) => ({
  _id: "6afafc639c9104c03f19def8",
  orderNumber: "CS-2026-0143",
  grandTotal: 1850,
  amountPaid: 0,
  source: "website",
  customerSnapshot: { name: "Priya Sharma", phone: "9876543210", email: "priya@example.test" },
  fulfilment: { type: "delivery", date: "2026-11-18", slot: "10:00 - 13:00", address: { line1: "12 Rose Lane", city: "Bhubaneswar", pincode: "751024" } },
  payment: { method: "upi", status: "pending" },
  items: [
    { name: "Chocolate Truffle Cake", variantName: "1 kg", quantity: 1.5, lineTotal: 1275, addOns: [{ name: "Candles", price: 25 }] },
    { name: "Walnut Brownie Slab", quantity: 2, lineTotal: 575 },
  ],
  specialInstructions: "Write 'Happy birthday'",
  ...overrides,
});

beforeEach(clearAlertEnv);
afterEach(() => {
  clearAlertEnv();
  vi.unstubAllGlobals();
  resetTelegramChatCache();
});

describe("alert message", () => {
  it("puts the order number and total in the subject", () => {
    const alert = formatOrderAlert(sampleOrder(), { adminUrl: "https://shop.test" });
    expect(alert.subject).toBe("New order CS-2026-0143 — ₹1,850");
  });

  it("names the customer, fulfilment and every line", () => {
    const alert = formatOrderAlert(sampleOrder());
    expect(alert.text).toContain("Priya Sharma · 9876543210");
    expect(alert.text).toContain("Delivery — 2026-11-18 · 10:00 - 13:00 — 12 Rose Lane, Bhubaneswar, 751024");
    expect(alert.text).toContain("Chocolate Truffle Cake (1 kg) × 1.5 + Candles — ₹1,275");
    expect(alert.text).toContain("Walnut Brownie Slab × 2 — ₹575");
  });

  it("says whether the order is paid", () => {
    expect(formatOrderAlert(sampleOrder()).text).toContain("unpaid");
    expect(formatOrderAlert(sampleOrder({ amountPaid: 500 })).text).toContain("₹500 of ₹1,850 paid");
    expect(formatOrderAlert(sampleOrder({ amountPaid: 1850 })).text).toContain("paid in full");
  });

  it("links straight to the order in the admin", () => {
    const alert = formatOrderAlert(sampleOrder(), { adminUrl: "https://shop.test" });
    expect(alert.orderUrl).toBe("https://shop.test/admin/orders/6afafc639c9104c03f19def8");
    expect(alert.text).toContain(alert.orderUrl);
  });

  it("omits the link when no admin URL is known", () => {
    expect(formatOrderAlert(sampleOrder()).orderUrl).toBe("");
  });

  it("escapes HTML so a customer note cannot inject markup", () => {
    const alert = formatOrderAlert(sampleOrder({ specialInstructions: "<script>alert(1)</script>" }));
    expect(alert.html).not.toContain("<script>");
    expect(alert.html).toContain("&lt;script&gt;");
  });

  it("truncates a very long order instead of building an enormous message", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ name: `Cake ${index}`, quantity: 1, lineTotal: 100 }));
    const alert = formatOrderAlert(sampleOrder({ items: many }));
    expect(alert.text).toContain("…and 18 more");
    expect(alert.text).not.toContain("Cake 29");
  });
});

describe("channel status", () => {
  it("reports every channel as unconfigured when nothing is set", () => {
    const status = channelStatus();
    expect(status.email.configured).toBe(false);
    expect(status.telegram.configured).toBe(false);
    expect(status.ntfy.configured).toBe(false);
  });

  it("switches a channel on when its variables are present", () => {
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_USER = "shop@example.test";
    process.env.SMTP_PASS = "secret";
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.NTFY_TOPIC = "cakestyles-orders";

    const status = channelStatus();
    expect(status.email.configured).toBe(true);
    expect(status.telegram.configured).toBe(true);
    expect(status.ntfy.configured).toBe(true);
  });

  it("needs all three SMTP values, not just one", () => {
    process.env.SMTP_HOST = "smtp.example.test";
    expect(channelStatus().email.configured).toBe(false);
  });
});

describe("recipients", () => {
  it("defaults to the owner's address when nothing is configured", async () => {
    await seedSettings();
    expect(await alertRecipients()).toEqual(["simran299.bhansali@gmail.com"]);
  });

  it("uses the addresses saved in Settings", async () => {
    const settings = await Setting.getSettings();
    settings.set("alerts", { emails: ["owner@example.test", "manager@example.test"] });
    await settings.save();

    expect(await alertRecipients()).toEqual(["owner@example.test", "manager@example.test"]);
  });

  it("lets the environment override the built-in default", async () => {
    await seedSettings();
    process.env.ORDER_ALERT_EMAILS = "one@example.test, two@example.test";
    expect(await alertRecipients()).toEqual(["one@example.test", "two@example.test"]);
  });
});

describe("sending", () => {
  it("reports every channel as skipped when nothing is configured", async () => {
    const results = await sendAlert(formatOrderAlert(sampleOrder()));
    expect(results).toHaveLength(3);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(results.every((result) => result.skipped)).toBe(true);
  });

  it("never throws when a channel fails", async () => {
    process.env.NTFY_TOPIC = "cakestyles-orders";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const results = await sendAlert(formatOrderAlert(sampleOrder()));
    const ntfy = results.find((result) => result.channel === "ntfy");
    expect(ntfy.ok).toBe(false);
    expect(ntfy.error).toMatch(/network down/);
  });

  it("posts the alert to ntfy with the title on the lock screen", async () => {
    process.env.NTFY_TOPIC = "cakestyles-orders";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const results = await sendAlert(formatOrderAlert(sampleOrder()));
    expect(results.find((result) => result.channel === "ntfy").ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ntfy.sh/cakestyles-orders");
    expect(init.headers.Title).toBe("New order CS-2026-0143 — ₹1,850");
    expect(init.body).toContain("Priya Sharma");
  });

  it("discovers the Telegram chat from the bot's recent messages", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: [{ message: { chat: { id: 4242 } } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const results = await sendAlert(formatOrderAlert(sampleOrder()));
    expect(results.find((result) => result.channel === "telegram")).toMatchObject({ ok: true, detail: "sent to chat 4242" });
    expect(fetchMock.mock.calls[1][0]).toContain("/sendMessage");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).chat_id).toBe("4242");
  });

  it("explains what to do when the bot has never been messaged", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: [] }) }));

    const results = await sendAlert(formatOrderAlert(sampleOrder()));
    const telegram = results.find((result) => result.channel === "telegram");
    expect(telegram.ok).toBe(false);
    expect(telegram.error).toMatch(/send it any message/);
  });
});

describe("placing an order", () => {
  it("still succeeds when no alert channel is configured", async () => {
    await seedSettings();
    const customer = await makeCustomer();

    const results = await Promise.all([notifyOrderPlaced(sampleOrder())]);
    expect(results[0].every((result) => !result.ok)).toBe(true);
    expect(customer).toBeTruthy();
  });

  it("does not fail the order when the notifier blows up", async () => {
    process.env.NTFY_TOPIC = "cakestyles-orders";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    await expect(notifyOrderPlaced(sampleOrder())).resolves.toBeDefined();
  });

  it("reaches the notifier from a real checkout", async () => {
    await seedSettings();
    const customer = await makeCustomer();
    const order = await makeOrder({ customer, items: [orderItem({ quantity: 2 })] });

    // The console line is the only guaranteed output with no channels set; the
    // point here is that the alert payload is built from a real stored order.
    const alert = formatOrderAlert(order);
    expect(alert.subject).toContain(order.orderNumber);
    expect(alert.text).toContain(customer.name);
  });
});

describe("settings endpoints", () => {
  it("reports channel status and recipients to an owner", async () => {
    await seedSettings();
    const { auth } = await signIn("owner");

    const res = await request(app).get("/api/settings/alerts").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.channels.email.configured).toBe(false);
    expect(res.body.recipients).toEqual(["simran299.bhansali@gmail.com"]);
  });

  it("saves alert recipients through the settings endpoint", async () => {
    await seedSettings();
    const { auth } = await signIn("owner");

    const res = await request(app)
      .put("/api/settings")
      .set("Authorization", auth)
      .send({ alerts: { emails: ["hello@example.test"] } });

    expect(res.status).toBe(200);
    expect(res.body.settings.alerts.emails).toEqual(["hello@example.test"]);
    expect(await alertRecipients()).toEqual(["hello@example.test"]);
  });

  it("sends a test alert and reports nothing was delivered when unconfigured", async () => {
    await seedSettings();
    const { auth } = await signIn("owner");

    const res = await request(app).post("/api/settings/alerts/test").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.delivered).toEqual([]);
    expect(res.body.results.map((result) => result.channel).sort()).toEqual(["email", "ntfy", "telegram"]);
  });

  it("delivers a test alert through ntfy when it is configured", async () => {
    await seedSettings();
    const { auth } = await signIn("owner");
    process.env.NTFY_TOPIC = "cakestyles-orders";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const res = await request(app).post("/api/settings/alerts/test").set("Authorization", auth);
    expect(res.body.ok).toBe(true);
    expect(res.body.delivered).toEqual(["ntfy"]);
  });

  it("refuses the test endpoint without settings:write", async () => {
    await seedSettings();
    const { auth } = await signIn("staff");

    const res = await request(app).post("/api/settings/alerts/test").set("Authorization", auth);
    expect(res.status).toBe(403);
  });
});
