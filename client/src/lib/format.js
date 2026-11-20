import dayjs from "dayjs";

export const inr = (n) =>
  `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))}`;

export const fmtDate = (d) => (d ? dayjs(d).format("DD MMM YYYY") : "—");
export const fmtDateTime = (d) => (d ? dayjs(d).format("DD MMM YYYY, hh:mm A") : "—");
export const fmtDay = (d) => (d ? dayjs(d).format("ddd, DD MMM") : "");

export const todayStr = () => dayjs().format("YYYY-MM-DD");

export const daysFromNow = (n) => dayjs().add(n, "day").format("YYYY-MM-DD");

export const titleize = (s) =>
  String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

// A line quantity is any positive number with up to three decimals — a whole
// cake, half a cake, 0.75 kg. Blank, zero or junk snaps back to `fallback` so
// a cleared field can never submit an impossible line. Mirrors
// server/utils/quantity.js.
export const normalizeQuantity = (raw, fallback = 1) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 1000) / 1000;
};
