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
