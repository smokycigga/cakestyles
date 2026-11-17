// Order alerts.
//
// A new order has to reach the shop owner quickly, and email is not the only —
// or even the best — way to do that. So this module fans one alert out to
// whichever channels are configured, and each channel is optional:
//
//   email     SMTP (Gmail app password, Resend, SES, anything)
//   telegram  a bot message, which arrives as a real phone push notification
//   ntfy      a push to the ntfy app, no account needed
//   console   always on; this is what runs when nothing else is configured
//
// Two rules hold for every channel:
//   - it never throws. A failed notification must never fail a checkout.
//   - it is time-boxed. Vercel kills the function at 15s and the customer is
//     waiting on the response, so a slow SMTP server cannot hold the order.

import Setting from "../models/Setting.js";

// Where alerts go if nobody has set anything up yet.
const DEFAULT_ALERT_EMAILS = ["simran299.bhansali@gmail.com"];

// Enough for a small cake shop: an order can be big, but not endless.
const MAX_ALERT_ITEMS = 12;
const CHANNEL_TIMEOUT_MS = 6000;

const env = (key) => String(process.env[key] || "").trim();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const smtpConfig = () => {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  if (!host || !user || !pass) return null;
  const port = Number(env("SMTP_PORT") || 587);
  return {
    host,
    port,
    secure: env("SMTP_SECURE") === "true" || port === 465,
    auth: { user, pass },
    from: env("SMTP_FROM") || `Cakestyles <${user}>`,
  };
};

const telegramConfig = () => {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) return null;
  return { token, chatId: env("TELEGRAM_CHAT_ID") };
};

const ntfyConfig = () => {
  const topic = env("NTFY_TOPIC");
  if (!topic) return null;
  return { topic, server: (env("NTFY_SERVER") || "https://ntfy.sh").replace(/\/$/, "") };
};

/**
 * Who gets the email. Settings wins over the environment, so the address can be
 * changed from the admin UI without a redeploy; the environment is there for
 * anyone who prefers to keep it out of the database.
 */
export const alertRecipients = async () => {
  try {
    const settings = await Setting.getSettings();
    const saved = (settings.alerts?.emails || []).map((email) => String(email).trim()).filter(Boolean);
    if (saved.length > 0) return saved;
  } catch {
    // Settings unavailable — fall through to env, then the built-in address.
  }
  const fromEnv = env("ORDER_ALERT_EMAILS").split(/[,;\s]+/).filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_ALERT_EMAILS;
};

/** What is set up right now — surfaced in Settings so nothing is a guess. */
export const channelStatus = () => ({
  email: {
    configured: Boolean(smtpConfig()),
    needs: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
  },
  telegram: {
    configured: Boolean(telegramConfig()),
    needs: ["TELEGRAM_BOT_TOKEN"],
  },
  ntfy: {
    configured: Boolean(ntfyConfig()),
    needs: ["NTFY_TOPIC"],
  },
});

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

const rupees = (value) => {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);

const paymentLine = (order) => {
  const method = order.payment?.method || "not set";
  const paid = Number(order.amountPaid) || 0;
  const total = Number(order.grandTotal) || 0;
  if (paid >= total && total > 0) return `${method} — paid in full`;
  if (paid > 0) return `${method} — ${rupees(paid)} of ${rupees(total)} paid`;
  return `${method} — unpaid`;
};

const fulfilmentLine = (order) => {
  const fulfilment = order.fulfilment || {};
  const type = fulfilment.type === "delivery" ? "Delivery" : "Pickup";
  const when = [fulfilment.date, fulfilment.slot].filter(Boolean).join(" · ");
  const address = fulfilment.address
    ? [fulfilment.address.line1, fulfilment.address.city, fulfilment.address.pincode].filter(Boolean).join(", ")
    : "";
  return [type, when, address].filter(Boolean).join(" — ");
};

const itemLines = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.slice(0, MAX_ALERT_ITEMS).map((item) => {
    const size = item.variantName ? ` (${item.variantName})` : "";
    const addOns = (item.addOns || []).map((addOn) => addOn.name).filter(Boolean);
    const extras = addOns.length > 0 ? ` + ${addOns.join(", ")}` : "";
    const note = item.notes ? ` — "${item.notes}"` : "";
    return `${item.name}${size} × ${item.quantity}${extras} — ${rupees(item.lineTotal)}${note}`;
  });
};

/**
 * Build the alert in every shape a channel needs. Kept pure and exported so the
 * wording can be asserted without sending anything.
 */
export const formatOrderAlert = (order, { adminUrl } = {}) => {
  const customer = order.customerSnapshot || {};
  const items = itemLines(order);
  const total = rupees(order.grandTotal);
  const source = order.source ? String(order.source).replace(/_/g, " ") : "website";
  const orderUrl = adminUrl && order._id ? `${adminUrl}/admin/orders/${order._id}` : "";
  const hiddenItems = Math.max(0, (order.items || []).length - items.length);

  const subject = `New order ${order.orderNumber} — ${total}`;

  const text = [
    `New order ${order.orderNumber}`,
    `${total} · ${items.length} item(s) · via ${source}`,
    "",
    `Customer: ${customer.name || "Guest"}${customer.phone ? ` · ${customer.phone}` : ""}`,
    `Fulfilment: ${fulfilmentLine(order)}`,
    `Payment: ${paymentLine(order)}`,
    "",
    ...items,
    hiddenItems > 0 ? `…and ${hiddenItems} more` : "",
    "",
    order.specialInstructions ? `Note: ${order.specialInstructions}` : "",
    orderUrl ? `Open: ${orderUrl}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#3b2b2f;max-width:520px">
      <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a6b74">New order</p>
      <h2 style="margin:0 0 2px;font-size:22px;color:#5c1f31">${escapeHtml(order.orderNumber)}</h2>
      <p style="margin:0 0 16px;font-size:15px"><strong>${escapeHtml(total)}</strong> · ${items.length} item(s) · via ${escapeHtml(source)}</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#8a6b74;width:110px">Customer</td><td>${escapeHtml(customer.name || "Guest")}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ""}</td></tr>
        <tr><td style="padding:4px 0;color:#8a6b74">Fulfilment</td><td>${escapeHtml(fulfilmentLine(order))}</td></tr>
        <tr><td style="padding:4px 0;color:#8a6b74">Payment</td><td>${escapeHtml(paymentLine(order))}</td></tr>
      </table>
      <ul style="margin:16px 0;padding-left:18px;font-size:14px">
        ${items.map((line) => `<li style="margin-bottom:4px">${escapeHtml(line)}</li>`).join("")}
      </ul>
      ${order.specialInstructions ? `<p style="font-size:13px;background:#fdf6f0;padding:10px 12px;border-radius:8px">${escapeHtml(order.specialInstructions)}</p>` : ""}
      ${orderUrl ? `<p style="margin-top:18px"><a href="${escapeHtml(orderUrl)}" style="background:#5c1f31;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Open in admin</a></p>` : ""}
    </div>`;

  // Telegram uses HTML too, but only understands a small subset — keep it to
  // <b> and plain lines so nothing renders as literal tags.
  const telegram = [
    `<b>New order ${escapeHtml(order.orderNumber)}</b>`,
    `${escapeHtml(total)} · ${items.length} item(s)`,
    "",
    `👤 ${escapeHtml(customer.name || "Guest")}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ""}`,
    `🕒 ${escapeHtml(fulfilmentLine(order))}`,
    `💳 ${escapeHtml(paymentLine(order))}`,
    "",
    ...items.map((line) => `• ${escapeHtml(line)}`),
    order.specialInstructions ? `📝 ${escapeHtml(order.specialInstructions)}` : "",
    orderUrl ? `<a href="${escapeHtml(orderUrl)}">Open in admin</a>` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  // ntfy shows the title on the lock screen, so it has to carry the essentials.
  const ntfyTitle = `New order ${order.orderNumber} — ${total}`;
  const ntfyBody = `${customer.name || "Guest"} · ${fulfilmentLine(order)}\n${items.slice(0, 4).join("\n")}`;

  return { subject, text, html, telegram, ntfyTitle, ntfyBody, orderUrl };
};

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

const sendEmail = async (alert) => {
  const config = smtpConfig();
  if (!config) return { channel: "email", ok: false, skipped: "SMTP not configured" };

  // Imported lazily so a missing dependency degrades to a reported channel
  // rather than crashing the whole API at boot.
  const { default: nodemailer } = await import("nodemailer");
  const recipients = await alertRecipients();

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
  });

  const info = await transport.sendMail({
    from: config.from,
    to: recipients.join(", "),
    subject: alert.subject,
    text: alert.text,
    html: alert.html,
  });

  return { channel: "email", ok: true, detail: `sent to ${recipients.join(", ")}`, id: info.messageId };
};

// The chat id is one more thing to look up, and it is discoverable: whoever has
// messaged the bot most recently is the person who should get the alerts.
let cachedChatId = "";

export const resetTelegramChatCache = () => {
  cachedChatId = "";
};

const resolveTelegramChatId = async (token) => {
  const config = telegramConfig();
  if (config?.chatId) return config.chatId;
  if (cachedChatId) return cachedChatId;

  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20`, {
    signal: AbortSignal.timeout(4000),
  });
  const payload = await response.json().catch(() => ({}));
  const chats = (payload.result || [])
    .map((update) => update.message?.chat?.id || update.channel_post?.chat?.id)
    .filter((id) => id != null);
  if (chats.length === 0) {
    throw new Error("No chat found — open the bot in Telegram and send it any message once");
  }
  cachedChatId = String(chats[chats.length - 1]);
  return cachedChatId;
};

const sendTelegram = async (alert) => {
  const config = telegramConfig();
  if (!config) return { channel: "telegram", ok: false, skipped: "TELEGRAM_BOT_TOKEN not set" };

  const chatId = await resolveTelegramChatId(config.token);
  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: alert.telegram,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(CHANNEL_TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description || `Telegram responded ${response.status}`);
  }
  return { channel: "telegram", ok: true, detail: `sent to chat ${chatId}` };
};

const sendNtfy = async (alert) => {
  const config = ntfyConfig();
  if (!config) return { channel: "ntfy", ok: false, skipped: "NTFY_TOPIC not set" };

  const response = await fetch(`${config.server}/${encodeURIComponent(config.topic)}`, {
    method: "POST",
    headers: {
      Title: alert.ntfyTitle,
      Priority: "high",
      Tags: "cake",
      // Only used when the topic is on ntfy.sh; harmless elsewhere.
      ...(alert.orderUrl ? { Click: alert.orderUrl } : {}),
    },
    body: alert.ntfyBody,
    signal: AbortSignal.timeout(CHANNEL_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`ntfy responded ${response.status}`);
  return { channel: "ntfy", ok: true, detail: `published to ${config.topic}` };
};

const withTimeout = (promise, label) => {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), CHANNEL_TIMEOUT_MS);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
};

/**
 * Send one alert to every configured channel.
 *
 * Resolves to a per-channel report; it never rejects, and a channel that is not
 * configured is reported as skipped rather than treated as a failure.
 */
export const sendAlert = async (alert) => {
  const status = channelStatus();
  const channels = [
    ["email", sendEmail],
    ["telegram", sendTelegram],
    ["ntfy", sendNtfy],
  ];

  const results = await Promise.all(
    channels.map(async ([name, send]) => {
      if (!status[name].configured) {
        return { channel: name, ok: false, skipped: `${name} not configured` };
      }
      try {
        return await withTimeout(send(alert), name);
      } catch (error) {
        return { channel: name, ok: false, error: error?.message || String(error) };
      }
    }),
  );

  if (!results.some((result) => result.ok)) {
    // Nothing is set up yet (or everything failed). The log line is the
    // fallback so the order is never silently invisible.
    console.log(`[notify] ${alert.subject}`);
  }

  return results;
};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const adminUrl = () => env("PUBLIC_APP_URL") || env("APP_URL") || "https://www.cakestyles.in";

export const notifyOrderPlaced = (order) =>
  sendAlert(formatOrderAlert(order, { adminUrl: adminUrl() })).catch((error) => {
    console.error("[notify] order alert failed", error?.message || error);
    return [];
  });

/** Used by the Settings "send test alert" button. */
export const sendTestAlert = () =>
  sendAlert({
    subject: "Test alert from Cakestyles",
    text: "This is a test alert. If you can read this, order notifications are working.",
    html: "<p>This is a test alert. If you can read this, order notifications are working.</p>",
    telegram: "<b>Test alert</b>\nIf you can read this, order notifications are working.",
    ntfyTitle: "Cakestyles test alert",
    ntfyBody: "If you can read this, order notifications are working.",
    orderUrl: "",
  });

// Status changes, invoices and enquiries stay on the console for now: they are
// frequent, and alert fatigue on the phone is worse than a quiet log.
const logEvent = (event, payload) => console.log(`[notify] ${event}`, JSON.stringify(payload));

export const notifyOrderStatus = (order, status) =>
  logEvent("order.status", { orderNumber: order.orderNumber, status });

export const notifyInvoiceIssued = (invoice) =>
  logEvent("invoice.issued", { invoiceNumber: invoice.invoiceNumber, total: invoice.total });

export const notifyEnquiryReceived = (enquiry) =>
  logEvent("enquiry.received", { name: enquiry.customerSnapshot?.name, eventDate: enquiry.eventDate });
