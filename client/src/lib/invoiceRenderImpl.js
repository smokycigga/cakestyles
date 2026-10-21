// Shared invoice rendering engine.
// One layout function, two output backends:
//   - PdfPainter    -> jsPDF, downloads <invoiceNumber>.pdf
//   - CanvasPainter -> Canvas2D, downloads <invoiceNumber>.png
// Runs fully client-side so it works identically locally and on Vercel.

import { jsPDF } from "jspdf";
import api from "./api";
import { fmtDate } from "./format";
import { PAYMENT_METHOD_LABELS, INVOICE_STATUS_META } from "./meta";
import { renderLogo, LOGO_W, LOGO_H } from "./logo";

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

  image(img, x, y, w, h) {
    const src = typeof img.toDataURL === "function" ? img.toDataURL("image/png") : img;
    this.doc.addImage(src, "PNG", x, y, w, h);
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

  image(img, x, y, w, h) {
    this.ctx.drawImage(img, x, y, w, h);
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
  const words = String(str || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";

  const breakToken = (token) => {
    let chunk = "";
    for (const ch of token) {
      const trial = chunk + ch;
      if (p.textWidth(trial, opts) <= maxWidth || !chunk) chunk = trial;
      else {
        lines.push(chunk);
        chunk = ch;
      }
    }
    return chunk;
  };

  for (const word of words) {
    if (p.textWidth(word, opts) > maxWidth) {
      if (cur) lines.push(cur);
      cur = breakToken(word);
      continue;
    }
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

function drawWrapped(p, str, x, y, maxWidth, opts, gap) {
  const lines = wrap(p, str, maxWidth, opts);
  const lh = gap ?? (opts.size || 10) + 3;
  lines.forEach((line, i) => p.text(line, x, y + i * lh, opts));
  return y + lines.length * lh;
}

function drawInvoice(p, invoice, store, logo = null) {
  const rupee = p.rupee;
  const right = W - M;
  // Keep the brand column from running into INVOICE / dates / the status pill.
  const leftColW = 300;
  let y = 56;

  let leftY;
  if (logo) {
    const logoH = 42;
    const logoW = Math.min(leftColW, (logoH * LOGO_W) / LOGO_H);
    p.image(logo, M, y - 26, logoW, logoH);
    leftY = y - 26 + logoH + 12;
  } else {
    p.text(store.name || "Cakestyles", M, y, { size: 20, bold: true, color: C.wine });
    leftY = y + 16;
  }
  if (store.tagline) {
    leftY = drawWrapped(p, store.tagline, M, leftY, leftColW, { size: 8.5, color: C.muted }, 11);
  }
  const addr = [store.address?.line1, store.address?.city, store.address?.pincode].filter(Boolean).join(", ");
  if (addr) {
    leftY = drawWrapped(p, addr, M, leftY, leftColW, { size: 8.5, color: C.muted }, 11);
  }
  if (store.phone) {
    p.text(store.phone, M, leftY, { size: 8.5, color: C.muted });
    leftY += 11;
  }
  if (store.email) {
    leftY = drawWrapped(p, store.email, M, leftY, leftColW, { size: 8.5, color: C.muted }, 11);
  }
  const contact = [store.phone, store.email].filter(Boolean).join(" · ");

  p.text("INVOICE", right, y, { size: 16, bold: true, color: C.ink, align: "right" });
  p.text(invoice.invoiceNumber, right, y + 17, { size: 10.5, bold: true, color: C.wine, align: "right" });
  p.text(`Date: ${fmtDate(invoice.createdAt)}`, right, y + 31, { size: 9, color: C.muted, align: "right" });
  let metaY = y + 31;
  if (invoice.dueDate) {
    metaY += 13;
    p.text(`Due: ${fmtDate(invoice.dueDate)}`, right, metaY, { size: 9, color: C.muted, align: "right" });
  }

  const statusLabel = (INVOICE_STATUS_META[invoice.status]?.label || invoice.status || "").toUpperCase();
  const pillColor = STATUS_PILL[invoice.status] || C.faint;
  const pillW = p.textWidth(statusLabel, { size: 8, bold: true }) + 16;
  const pillTop = metaY + 10;
  p.rect(right - pillW, pillTop, pillW, 16, { fill: pillColor, radius: 8 });
  p.text(statusLabel, right - pillW / 2, pillTop + 11.5, { size: 8, bold: true, color: C.white, align: "center" });

  y = Math.max(leftY, pillTop + 16) + 16;
  p.line(M, y, right, y);
  y += 22;

  const billedTop = y;
  p.text("BILLED TO", M, y, { size: 8, bold: true, color: C.faint });
  y += 15;
  y = drawWrapped(p, invoice.customerSnapshot?.name || "", M, y, leftColW, { size: 11, bold: true }, 14);
  if (invoice.customerSnapshot?.phone) {
    p.text(invoice.customerSnapshot.phone, M, y, { size: 9.5, color: C.muted });
    y += 13;
  }
  if (invoice.customerSnapshot?.email) {
    y = drawWrapped(p, invoice.customerSnapshot.email, M, y, leftColW, { size: 9.5, color: C.muted }, 13);
  }
  if (invoice.order?.orderNumber) {
    p.text(`Order ${invoice.order.orderNumber}`, right, billedTop + 15, { size: 9, color: C.muted, align: "right" });
  }
  // Keep the customer email (and any wrapped lines) clear of the table header.
  y += 22;

  const colAmt = right - 8;
  const colRate = right - 108;
  const colQty = right - 176;
  const descW = colQty - M - 28;

  const drawTableHeader = () => {
    p.rect(M, y - 13, W - 2 * M, 24, { fill: C.cream });
    p.text("Description", M + 8, y + 3, { size: 9, bold: true });
    p.text("Qty", colQty, y + 3, { size: 9, bold: true, align: "right" });
    p.text("Rate", colRate, y + 3, { size: 9, bold: true, align: "right" });
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
    p.text(String(line.quantity), colQty, y + 11, { size: 9.5, align: "right" });
    p.text(money(line.unitPrice, rupee), colRate, y + 11, { size: 9.5, align: "right" });
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
    // Labels right-align against the value column: a long label like
    // "Balance Due" must never run into the amount it describes.
    p.text(label, colRate - 8, y, { size, bold, color, align: "right" });
    p.text(value, colAmt, y, { size, bold, color, align: "right" });
    y += size + 7;
  };
  tRow("Subtotal", money(invoice.subtotal, rupee), { color: C.muted });
  if (invoice.discount > 0) tRow("Discount", `- ${money(invoice.discount, rupee)}`, { color: C.muted });
  if (invoice.tax?.amount > 0) {
    // An inclusive tax is already inside the subtotal — say so, or the column
    // reads as if it were added on and the total looks wrong.
    const label = `${invoice.tax.label} (${invoice.tax.rate}%)${invoice.tax.inclusive ? " incl." : ""}`;
    tRow(label, money(invoice.tax.amount, rupee), { color: C.muted });
  }
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
      const payLine = `${fmtDate(pay.date)} · ${PAYMENT_METHOD_LABELS[pay.method] || pay.method} · ${money(pay.amount, rupee)}${pay.ref ? ` · ref ${pay.ref}` : ""}`;
      y = drawWrapped(p, payLine, M, y, W - 2 * M, { size: 9, color: C.muted }, 13);
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
  if (contact) {
    const footerLines = wrap(p, contact, W - 2 * M, { size: 8 });
    footerLines.forEach((line, i) => p.text(line, W / 2, y + 13 + i * 11, { size: 8, color: C.faint, align: "center" }));
    y += 13 + footerLines.length * 11;
  }
  y += 18;

  // Watermark on top of everything
  const wm = WATERMARK[invoice.status];
  if (wm) p.watermark(wm, STATUS_PILL[invoice.status], Math.max(y, PAGE_H));

  return y;
}

// ---------------------------------------------------------------- public API

// Store identity for the invoice header. Public endpoint, so any staff role works.
// Deliberately uncached: a stale header misrepresents the business on a
// financial document, so Settings edits must take effect on the next PDF.
export async function fetchStoreInfo() {
  try {
    const { data } = await api.get("/settings/public");
    return data.store || {};
  } catch {
    return {};
  }
}

export async function downloadInvoicePdf(invoice) {
  const [store, logo] = await Promise.all([fetchStoreInfo(), renderLogo(480, C.wine)]);
  const p = new PdfPainter();
  drawInvoice(p, invoice, store, logo);
  p.save(invoice.invoiceNumber);
}

export async function downloadInvoicePng(invoice) {
  const [store, logo] = await Promise.all([fetchStoreInfo(), renderLogo(480, C.wine)]);
  const p = new CanvasPainter(2);
  const finalY = drawInvoice(p, invoice, store, logo);
  const canvas = p.crop(finalY);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${invoice.invoiceNumber}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
