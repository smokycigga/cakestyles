// Shared invoice rendering engine.
// One layout function, two output backends:
//   - PdfPainter    -> jsPDF, downloads <invoiceNumber>.pdf
//   - CanvasPainter -> Canvas2D, downloads <invoiceNumber>.png
// Runs fully client-side so it works identically locally and on Vercel.

import { jsPDF } from "jspdf";
import api from "./api";
import { fmtDate } from "./format";
import { PAYMENT_METHOD_LABELS, INVOICE_STATUS_META } from "./meta";

const W = 595; // A4 width in pt
const M = 40; // page margin
const PAGE_H = 842; // A4 height in pt (PDF pagination only)

const C = {
  wine: "#6d2141",
  ink: "#282828",
  muted: "#5a5046",
  faint: "#969696",
  cream: "#fdf6ee",
  border: "#e9c6d3",
  red: "#b4283c",
  emerald: "#047857",
  white: "#ffffff",
};

const STATUS_PILL = {
  draft: "#6b7280",
  issued: "#1d4ed8",
  partially_paid: "#c2410c",
  paid: "#047857",
  overdue: "#b4283c",
  cancelled: "#6b7280",
};

const WATERMARK = { paid: "PAID", overdue: "OVERDUE", cancelled: "CANCELLED" };

// jsPDF core fonts (WinAnsi) have no rupee glyph — use "Rs" there, ₹ on canvas.
const money = (n, rupee) =>
  `${rupee ? "₹" : "Rs "}${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))}`;

// ---------------------------------------------------------------- painters

class PdfPainter {
  constructor() {
    this.doc = new jsPDF({ unit: "pt", format: "a4" });
    this.y = 0;
    this.rupee = false;
  }

  text(str, x, y, { size = 10, bold = false, color = C.ink, align = "left" } = {}) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(color);
    this.doc.text(String(str), x, y, { align });
  }

  textWidth(str, { size = 10, bold = false } = {}) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    return this.doc.getTextWidth(String(str));
  }

  line(x1, y1, x2, y2, { color = C.border, width = 1 } = {}) {
    this.doc.setDrawColor(color);
    this.doc.setLineWidth(width);
    this.doc.line(x1, y1, x2, y2);
  }

  rect(x, y, w, h, { fill, radius = 0 } = {}) {
    this.doc.setFillColor(fill);
    if (radius > 0) this.doc.roundedRect(x, y, w, h, radius, radius, "F");
    else this.doc.rect(x, y, w, h, "F");
  }

  // Add a fresh page when the next block would overflow (canvas just grows).
  ensureSpace(needed) {
    if (this.y + needed > PAGE_H - 50) {
      this.doc.addPage();
      this.y = 60;
    }
  }

  watermark(label, color, pageH) {
    this.doc.saveGraphicsState();
    this.doc.setGState(new this.doc.GState({ opacity: 0.08 }));
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(80);
    this.doc.setTextColor(color);
    this.doc.text(label, W / 2, pageH / 2, { align: "center", angle: 45 });
    this.doc.restoreGraphicsState();
  }

  save(name) {
    this.doc.save(`${name}.pdf`);
  }
}

class CanvasPainter {
  constructor(scale = 2, height = 4000) {
    this.scale = scale;
    this.canvas = document.createElement("canvas");
    this.canvas.width = W * scale;
    this.canvas.height = height * scale;
    this.ctx = this.canvas.getContext("2d");
    this.ctx.scale(scale, scale);
    this.ctx.fillStyle = C.white;
    this.ctx.fillRect(0, 0, W, height);
    this.ctx.textBaseline = "alphabetic";
    this.y = 0;
    this.rupee = true;
  }

  text(str, x, y, { size = 10, bold = false, color = C.ink, align = "left" } = {}) {
    this.ctx.font = `${bold ? "700" : "400"} ${size}px Helvetica, Arial, sans-serif`;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.fillText(String(str), x, y);
    this.ctx.textAlign = "left";
  }

  textWidth(str, { size = 10, bold = false } = {}) {
    this.ctx.font = `${bold ? "700" : "400"} ${size}px Helvetica, Arial, sans-serif`;
    return this.ctx.measureText(String(str)).width;
  }

  line(x1, y1, x2, y2, { color = C.border, width = 1 } = {}) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  rect(x, y, w, h, { fill, radius = 0 } = {}) {
    this.ctx.fillStyle = fill;
    if (radius > 0 && typeof this.ctx.roundRect === "function") {
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, w, h, radius);
      this.ctx.fill();
    } else {
      this.ctx.fillRect(x, y, w, h);
    }
  }

  ensureSpace() {
    // Canvas is created oversized and cropped after layout; nothing to do.
  }

  watermark(label, color, pageH) {
    this.ctx.save();
    this.ctx.globalAlpha = 0.08;
    this.ctx.translate(W / 2, pageH / 2);
    this.ctx.rotate(-Math.PI / 4);
    this.ctx.font = "700 80px Helvetica, Arial, sans-serif";
    this.ctx.fillStyle = color;
    this.ctx.textAlign = "center";
    this.ctx.fillText(label, 0, 0);
    this.ctx.restore();
  }

  // Crop the oversized canvas to the used height and return it.
  crop(finalHeight) {
    const out = document.createElement("canvas");
    out.width = this.canvas.width;
    out.height = Math.ceil(finalHeight * this.scale);
    out.getContext("2d").drawImage(this.canvas, 0, 0);
    return out;
  }
}

// ---------------------------------------------------------------- layout

function wrap(p, str, maxWidth, opts) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (p.textWidth(trial, opts) <= maxWidth || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function drawInvoice(p, invoice, store) {
  const rupee = p.rupee;
  let y = 60;

  // Header: store identity (left) + invoice meta (right)
  p.text(store.name || "Cakestyles", M, y, { size: 22, bold: true, color: C.wine });
  let hy = y + 15;
  if (store.tagline) {
    p.text(store.tagline, M, hy, { size: 9, color: C.muted });
    hy += 12;
  }
  const addr = [store.address?.line1, store.address?.city, store.address?.pincode].filter(Boolean).join(", ");
  if (addr) {
    p.text(addr, M, hy, { size: 8.5, color: C.muted });
    hy += 11;
  }
  const contact = [store.phone, store.email].filter(Boolean).join(" · ");
  if (contact) p.text(contact, M, hy, { size: 8.5, color: C.muted });

  p.text("INVOICE", W - M, y, { size: 16, bold: true, color: C.ink, align: "right" });
  p.text(invoice.invoiceNumber, W - M, y + 17, { size: 10.5, bold: true, color: C.wine, align: "right" });
  p.text(`Date: ${fmtDate(invoice.createdAt)}`, W - M, y + 31, { size: 9, color: C.muted, align: "right" });
  if (invoice.dueDate) p.text(`Due: ${fmtDate(invoice.dueDate)}`, W - M, y + 44, { size: 9, color: C.muted, align: "right" });

  // Status pill
  const statusLabel = (INVOICE_STATUS_META[invoice.status]?.label || invoice.status || "").toUpperCase();
  const pillColor = STATUS_PILL[invoice.status] || C.faint;
  const pillW = p.textWidth(statusLabel, { size: 8, bold: true }) + 16;
  p.rect(W - M - pillW, y + 52, pillW, 16, { fill: pillColor, radius: 8 });
  p.text(statusLabel, W - M - pillW / 2, y + 63.5, { size: 8, bold: true, color: C.white, align: "center" });

  y = Math.max(y + 80, hy + 18);
  p.line(M, y, W - M, y);
  y += 22;

  // Billed to + source order
  p.text("BILLED TO", M, y, { size: 8, bold: true, color: C.faint });
  p.text(invoice.customerSnapshot?.name || "", M, y + 15, { size: 11, bold: true });
  let by = y + 28;
  if (invoice.customerSnapshot?.phone) {
    p.text(invoice.customerSnapshot.phone, M, by, { size: 9.5, color: C.muted });
    by += 12;
  }
  if (invoice.customerSnapshot?.email) p.text(invoice.customerSnapshot.email, M, by, { size: 9.5, color: C.muted });
  if (invoice.order?.orderNumber) {
    p.text(`Order ${invoice.order.orderNumber}`, W - M, y + 15, { size: 9, color: C.muted, align: "right" });
  }
  y += 52;

  // Lines table
  const colQty = W - 220;
  const colRate = W - 150;
  const colAmt = W - M - 8;
  const descW = colQty - M - 20;

  const drawTableHeader = () => {
    p.rect(M, y - 13, W - 2 * M, 24, { fill: C.cream });
    p.text("Description", M + 8, y + 3, { size: 9, bold: true });
    p.text("Qty", colQty, y + 3, { size: 9, bold: true });
    p.text("Rate", colRate, y + 3, { size: 9, bold: true });
    p.text("Amount", colAmt, y + 3, { size: 9, bold: true, align: "right" });
    y += 28;
  };

  p.y = y;
  p.ensureSpace(60);
  y = p.y;
  drawTableHeader();

  for (const line of invoice.lines || []) {
    const wrapped = wrap(p, line.description, descW, { size: 9.5 });
    const rowH = wrapped.length * 13 + 8;
    p.y = y;
    p.ensureSpace(rowH);
    if (p.y !== y) {
      // PDF jumped to a new page: redraw the table header there.
      y = p.y;
      drawTableHeader();
    }
    wrapped.forEach((wline, i) => p.text(wline, M + 8, y + 11 + i * 13, { size: 9.5 }));
    p.text(String(line.quantity), colQty, y + 11, { size: 9.5 });
    p.text(money(line.unitPrice, rupee), colRate, y + 11, { size: 9.5 });
    p.text(money(line.amount, rupee), colAmt, y + 11, { size: 9.5, align: "right" });
    y += rowH;
    p.line(M, y - 4, W - M, y - 4, { color: "#f3e4ec", width: 0.5 });
  }

  // Totals block
  p.y = y;
  p.ensureSpace(120);
  y = p.y + 8;
  p.line(W - 260, y, W - M, y);
  y += 18;
  const tRow = (label, value, { bold = false, size = 10, color = C.ink } = {}) => {
    p.text(label, colRate, y, { size, bold, color });
    p.text(value, colAmt, y, { size, bold, color, align: "right" });
    y += size + 7;
  };
  tRow("Subtotal", money(invoice.subtotal, rupee), { color: C.muted });
  if (invoice.discount > 0) tRow("Discount", `- ${money(invoice.discount, rupee)}`, { color: C.muted });
  if (invoice.tax?.amount > 0) tRow(`${invoice.tax.label} (${invoice.tax.rate}%)`, money(invoice.tax.amount, rupee), { color: C.muted });
  tRow("Total", money(invoice.total, rupee), { bold: true, size: 12, color: C.wine });
  tRow("Paid", money(invoice.amountPaid, rupee), { color: C.emerald });
  tRow("Balance Due", money(invoice.balanceDue, rupee), { bold: true, color: invoice.balanceDue > 0 ? C.red : C.emerald });

  // Payment history
  if ((invoice.payments || []).length > 0) {
    p.y = y;
    p.ensureSpace(30 + invoice.payments.length * 15);
    y = p.y + 14;
    p.text("PAYMENT HISTORY", M, y, { size: 8, bold: true, color: C.faint });
    y += 15;
    for (const pay of invoice.payments) {
      p.text(
        `${fmtDate(pay.date)} · ${PAYMENT_METHOD_LABELS[pay.method] || pay.method} · ${money(pay.amount, rupee)}${pay.ref ? ` · ref ${pay.ref}` : ""}`,
        M, y, { size: 9, color: C.muted }
      );
      y += 14;
    }
  }

  // Notes
  if (invoice.notes) {
    p.y = y;
    p.ensureSpace(50);
    y = p.y + 16;
    p.text("NOTES", M, y, { size: 8, bold: true, color: C.faint });
    y += 14;
    for (const nline of wrap(p, invoice.notes, W - 2 * M, { size: 9 })) {
      p.text(nline, M, y, { size: 9, color: C.muted });
      y += 13;
    }
  }

  // Footer
  y += 36;
  p.line(M, y, W - M, y, { color: C.border, width: 0.5 });
  y += 16;
  p.text(`Thank you for ordering from ${store.name || "Cakestyles"}.`, W / 2, y, { size: 9, color: C.muted, align: "center" });
  if (contact) p.text(contact, W / 2, y + 13, { size: 8, color: C.faint, align: "center" });
  y += 30;

  // Watermark on top of everything
  const wm = WATERMARK[invoice.status];
  if (wm) p.watermark(wm, STATUS_PILL[invoice.status], Math.max(y, PAGE_H));

  return y;
}

// ---------------------------------------------------------------- public API

let storeCache = null;

// Store identity for the invoice header. Public endpoint, so any staff role works.
export async function fetchStoreInfo() {
  if (storeCache) return storeCache;
  try {
    const { data } = await api.get("/settings/public");
    storeCache = data.store || {};
  } catch {
    storeCache = {};
  }
  return storeCache;
}

export async function downloadInvoicePdf(invoice) {
  const store = await fetchStoreInfo();
  const p = new PdfPainter();
  drawInvoice(p, invoice, store);
  p.save(invoice.invoiceNumber);
}

export async function downloadInvoicePng(invoice) {
  const store = await fetchStoreInfo();
  const p = new CanvasPainter(2);
  const finalY = drawInvoice(p, invoice, store);
  const canvas = p.crop(finalY);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${invoice.invoiceNumber}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
