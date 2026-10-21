// Renders the REAL drawInvoice layout (same code path as the PDF/PNG export)
// to an SVG preview, using live data from the database. The user can open the
// output in a browser to eyeball the fixed layout without generating a PDF.
//
// Run: node scripts/render-invoice-preview.mjs [invoiceNumber]
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import mongoose from "mongoose";

const require = createRequire(import.meta.url);
const { jsPDF } = require("../client/node_modules/jspdf");

const src = readFileSync("client/src/lib/invoiceRender.js", "utf8");
const logoSrc = readFileSync("client/src/lib/logo.js", "utf8");

// ---- load invoiceRender.js with browser modules stubbed --------------------
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const PAYMENT_METHOD_LABELS = { razorpay: "Razorpay (Online)", upi: "UPI", cash: "Cash", bank_transfer: "Bank Transfer", card: "Card", other: "Other" };
const INVOICE_STATUS_META = {
  draft: { label: "Draft" }, issued: { label: "Issued" }, partially_paid: { label: "Partially Paid" },
  paid: { label: "Paid" }, overdue: { label: "Overdue" }, cancelled: { label: "Cancelled" },
};

// Evaluate logo.js (pure data + browser-gated functions).
function loadPlain(source, extraGlobals = "{}") {
  const body = source
    .replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, "")
    .replace(/^export\s+/gm, "");
  return new Function("__g", `'use strict';\n${body}\nreturn { LOGO_W, LOGO_H, LOGO_FILLED, LOGO_STROKED, logoSvg };`)(extraGlobals);
}
const logo = loadPlain(logoSrc);

const moduleMap = {
  jspdf: { jsPDF },
  "./api": { default: { get: async () => ({ data: {} }) } },
  "./format": { fmtDate },
  "./meta": { PAYMENT_METHOD_LABELS, INVOICE_STATUS_META },
  "./logo": { renderLogo: async () => null, LOGO_W: logo.LOGO_W, LOGO_H: logo.LOGO_H },
};

function loadModule(source) {
  const imports = [...source.matchAll(/import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+"([^"]+)";/g)];
  const names = [];
  const lines = source
    .replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, (m) => {
      const match = imports.find((imp) => m === imp[0]);
      const spec = match[3];
      if (match[2]) names.push(`const ${match[2]} = __mods[${JSON.stringify(spec)}].default;`);
      else for (const piece of match[1].split(",")) {
        const name = piece.trim();
        if (name) names.push(`const ${name} = __mods[${JSON.stringify(spec)}].${name};`);
      }
      return "";
    })
    .replace(/^export\s+/gm, "");
  const fn = new Function("__mods", `'use strict';\n${names.join("\n")}\n${lines}\nreturn { drawInvoice };`);
  return fn(moduleMap);
}
const { drawInvoice } = loadModule(src);

// ---- SVG painter ------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

class SvgPainter {
  constructor() {
    this.doc = new jsPDF({ unit: "pt", format: "a4" });
    this.parts = [];
    this.y = 0;
    this.rupee = true;
  }
  textWidth(str, { size = 10, bold = false } = {}) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    return this.doc.getTextWidth(String(str));
  }
  text(str, x, y, { size = 10, bold = false, color = "#282828", align = "left" } = {}) {
    const anchor = align === "right" ? "end" : align === "center" ? "middle" : "start";
    this.parts.push(
      `<text x="${x}" y="${y}" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${color}" text-anchor="${anchor}" font-family="Helvetica, Arial, sans-serif">${esc(str)}</text>`
    );
  }
  line(x1, y1, x2, y2, { color = "#e9c6d3", width = 1 } = {}) {
    this.parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`);
  }
  rect(x, y, w, h, { fill, radius = 0 } = {}) {
    this.parts.push(radius > 0
      ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);
  }
  image(_img, x, y, w, h) {
    // Embed the real wordmark as a nested SVG.
    this.parts.push(`<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${logo.LOGO_W} ${logo.LOGO_H}">${
      logo.LOGO_FILLED.map((d) => `<path d="${esc(d)}" fill="#6d2141"/>`).join("")
    }${
      logo.LOGO_STROKED.map((s) => s.line
        ? `<line x1="${s.line.x1}" y1="${s.line.y1}" x2="${s.line.x2}" y2="${s.line.y2}" stroke="#6d2141" stroke-width="${s.width}"/>`
        : `<path d="${esc(s.d)}" stroke="#6d2141" stroke-width="${s.width}" fill="none"/>`
      ).join("")
    }</svg>`);
  }
  ensureSpace() {}
  watermark(label, color) {
    this.parts.push(
      `<g transform="translate(297.5 430) rotate(-45)" opacity="0.08"><text font-size="80" font-weight="700" fill="${color}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${label}</text></g>`
    );
  }
}

// ---- run with live data ------------------------------------------------------
await mongoose.connect(process.env.MONGO_URI);
const Invoice = (await import("../server/models/Invoice.js")).default;
const Setting = (await import("../server/models/Setting.js")).default;

const number = process.argv[2] || "INV-2026-0007";
const invoice = await Invoice.findOne({ invoiceNumber: number }).lean();
if (!invoice) throw new Error(`invoice ${number} not found`);
const settings = await Setting.getSettings();
const store = settings.store;

const p = new SvgPainter();
const finalY = drawInvoice(p, invoice, store, { logo: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="595" height="${Math.max(finalY + 20, 500)}" viewBox="0 0 595 ${Math.max(finalY + 20, 500)}" style="background:#ffffff">${p.parts.join("\n")}</svg>`;
const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${number} — invoice preview</title>
<style>body{margin:0;background:#f3e4ec;display:flex;justify-content:center;padding:24px}svg{background:#fff;box-shadow:0 2px 16px rgba(109,33,65,.18);max-width:100%;height:auto}</style>
</head><body>${svg}</body></html>`;

writeFileSync("invoice-preview.html", html);
console.log(`wrote invoice-preview.html for ${number} (${invoice.status}, total ₹${invoice.total})`);
await mongoose.disconnect();
