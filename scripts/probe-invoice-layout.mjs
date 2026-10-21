// Layout probe: runs the REAL drawInvoice against a recording painter and
// checks the recorded draw calls for geometric collisions (text-on-text,
// text-inside-band). Catches exactly the class of bug where the customer
// email lands inside the table header band.
//
// Run: node scripts/probe-invoice-layout.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { jsPDF } = require("../client/node_modules/jspdf");

// Load invoiceRender.js source and evaluate it with jspdf/api/format/meta/logo
// stubbed via a tiny loader, so we exercise the production layout code.
const src = readFileSync("client/src/lib/invoiceRender.js", "utf8");

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const PAYMENT_METHOD_LABELS = { razorpay: "Razorpay (Online)", upi: "UPI", cash: "Cash", bank_transfer: "Bank Transfer", card: "Card", other: "Other" };
const INVOICE_STATUS_META = {
  draft: { label: "Draft" }, issued: { label: "Issued" }, partially_paid: { label: "Partially Paid" },
  paid: { label: "Paid" }, overdue: { label: "Overdue" }, cancelled: { label: "Cancelled" },
};

const moduleMap = {
  jspdf: { jsPDF },
  "./api": { default: { get: async () => ({ data: {} }) } },
  "./format": { fmtDate },
  "./meta": { PAYMENT_METHOD_LABELS, INVOICE_STATUS_META },
  "./logo": {
    renderLogo: async () => null,
    LOGO_W: 1927,
    LOGO_H: 438,
  },
};

function resolveSpecifier(spec) {
  if (moduleMap[spec]) return { exports: moduleMap[spec] };
  throw new Error(`probe cannot resolve "${spec}"`);
}

// Transform ESM imports into accesses on resolved modules, then eval.
function loadModule(source) {
  const imports = [...source.matchAll(/import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+"([^"]+)";/g)];
  const names = [];
  const lines = source
    .replace(/^import[\s\S]*?from\s+"[^"]+";$/gm, (m) => {
      const match = imports.find((imp) => m === imp[0]);
      const spec = match[3];
      const mod = resolveSpecifier(spec).exports;
      if (match[2]) {
        names.push(`const ${match[2]} = __mods[${JSON.stringify(spec)}].default;`);
      } else {
        for (const piece of match[1].split(",")) {
          const name = piece.trim();
          if (!name) continue;
          names.push(`const ${name} = __mods[${JSON.stringify(spec)}].${name};`);
        }
      }
      return "";
    })
    .replace(/^export\s+/gm, "");
  const body = names.join("\n") + "\n" + lines + "\nreturn { drawInvoice, fetchStoreInfo, downloadInvoicePdf, downloadInvoicePng };";
  const fn = new Function("__mods", "'use strict';\n" + body);
  return fn(moduleMap);
}

const mod = loadModule(src);
const drawInvoice = mod.drawInvoice;
console.log("drawInvoice loaded:", typeof drawInvoice);

// ------------------------------------------------------- recording painter
class ProbePainter {
  constructor() {
    this.doc = new jsPDF({ unit: "pt", format: "a4" });
    this.y = 0;
    this.rupee = false;
    this.calls = [];
    this.pages = 1;
  }
  text(str, x, y, { size = 10, bold = false, color = "#000", align = "left" } = {}) {
    const w = this.textWidth(str, { size, bold });
    const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    this.calls.push({ kind: "text", str: String(str), x: left, y, w, h: size, top: y - size * 0.78, bottom: y + size * 0.24 });
  }
  textWidth(str, { size = 10, bold = false } = {}) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    return this.doc.getTextWidth(String(str));
  }
  line() { this.calls.push({ kind: "line" }); }
  rect(x, y, w, h, opts = {}) { this.calls.push({ kind: "rect", x, y, w, h, fill: opts.fill }); }
  image(img, x, y, w, h) { this.calls.push({ kind: "image", x, y, w, h }); }
  ensureSpace() {}
  watermark() { this.calls.push({ kind: "watermark" }); }
}

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.top < b.bottom && b.top < a.bottom;

function runCase(label, invoice, store, logo) {
  const p = new ProbePainter();
  drawInvoice(p, invoice, store, logo);
  // The four column labels are drawn ON the table-header band by design.
  const headerLabels = new Set(["Description", "Qty", "Rate", "Amount"]);
  const texts = p.calls.filter((c) => c.kind === "text" && !headerLabels.has(c.str));
  const bands = p.calls.filter((c) => c.kind === "rect" && c.w > 300); // table header / totals bands
  const issues = [];

  for (const t of texts) {
    for (const band of bands) {
      const bandBox = { x: band.x, w: band.w, top: band.y, bottom: band.y + band.h };
      if (overlap(t, bandBox) && band.fill !== "#ffffff") {
        issues.push(`text "${t.str.slice(0, 40)}" (baseline y=${t.y.toFixed(0)}) intersects band (y=${band.y.toFixed(0)}..${(band.y + band.h).toFixed(0)})`);
      }
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (overlap(texts[i], texts[j])) {
        issues.push(`text "${texts[i].str.slice(0, 30)}" overlaps text "${texts[j].str.slice(0, 30)}"`);
      }
    }
  }
  const emails = texts.filter((t) => /@/.test(t.str));
  console.log(`\n[${label}]`);
  for (const e of emails) console.log(`  @-line: "${e.str.slice(0, 44)}" baseline y=${e.y.toFixed(1)} bottom=${e.bottom.toFixed(1)}`);
  const headerBand = bands.find((b) => b.y > 100 && b.y < 300);
  if (headerBand) console.log(`  table band: y=${headerBand.y.toFixed(1)}..${(headerBand.y + headerBand.h).toFixed(1)}`);
  const logoCall = p.calls.find((c) => c.kind === "image");
  console.log(`  logo drawn: ${logoCall ? `at (${logoCall.x}, ${logoCall.y}) ${logoCall.w.toFixed(0)}x${logoCall.h.toFixed(0)}` : "no"}`);
  console.log(`  collisions: ${issues.length === 0 ? "NONE ✓" : ""}`);
  for (const issue of issues) console.log(`    ✗ ${issue}`);
  return issues.length;
}

const store = {
  name: "Cakestyles",
  tagline: "Handcrafted cakes & bakes, made for your celebrations.",
  address: { line1: "83/1/2 Sambhunath Pandit St", city: "Kolkata", pincode: "700020" },
  phone: "+91 98765 43210",
  email: "hello@cakestyles.com",
};

const customer = { name: "Ananya Sharma", phone: "+91 98300 12345", email: "ananya.sharma.someverylongaddress@gmail.com" };
const baseInv = {
  invoiceNumber: "INV-2026-0007",
  createdAt: "2026-08-31T18:29:00.000Z",
  dueDate: "2026-09-07",
  status: "issued",
  customerSnapshot: customer,
  lines: [{ description: "Chocolate Truffle Cake (500 g) — handpiped rosettes, Belgian couverture shell", quantity: 2, unitPrice: 400, amount: 800 }],
  subtotal: 800, discount: 0, tax: { rate: 0, label: "Tax", amount: 0 }, total: 800,
  amountPaid: 0, balanceDue: 800, payments: [], notes: "Deliver before 6 PM. Handle with care.",
};

let bad = 0;
bad += runCase("phone + email (the reported overlap)", baseInv, store, null);
bad += runCase("phone + email + logo", baseInv, store, { fake: "logo" });
bad += runCase("email only", { ...baseInv, customerSnapshot: { name: customer.name, email: customer.email } }, store, null);
bad += runCase("no contact lines", { ...baseInv, customerSnapshot: { name: customer.name } }, store, null);
bad += runCase("multi-line wrapped description", { ...baseInv, lines: [{ description: "Custom three-tier wedding cake with sugar florals, handpainted gold leaf, raspberry compote filling and Belgian chocolate ganache finish, delivered chilled", quantity: 1, unitPrice: 12500, amount: 12500 }], subtotal: 12500, total: 12500, balanceDue: 12500 }, store, null);

console.log(`\n${bad === 0 ? "ALL CLEAN" : bad + " case(s) with collisions"}`);
process.exit(bad === 0 ? 0 : 1);
