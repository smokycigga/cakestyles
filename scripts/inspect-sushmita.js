// Read-only sweep: find the two invoices the user referenced (5100 / 5400) and
// any customer named like "sushmita". Connects via server/.env, reads raw
// collections, writes nothing.
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../server/.env") });
const toStr = (v) => (v ? String(v) : null);

async function inspect() {
  const conn = await mongoose.connect(process.env.MONGO_URI);
  const db = conn.connection.db;
  const nameRe = /sush/i;

  const money = [5100, 5400];

  const invoices = await db.collection("invoices").find({
    $or: [
      { invoiceNumber: { $in: ["5100", "5400"] } },
      { invoiceNumber: /5100|5400/ },
      { total: { $in: money } },
      { subtotal: { $in: money } },
      { "customerSnapshot.name": nameRe },
    ],
  }).sort({ createdAt: 1 }).toArray();

  const orders = await db.collection("orders").find({
    $or: [
      { orderNumber: /5100|5400/ },
      { grandTotal: { $in: money } },
      { "customerSnapshot.name": nameRe },
    ],
  }).sort({ createdAt: 1 }).toArray();

  const customers = await db.collection("customers").find({ name: nameRe }).toArray();

  console.log("=== CUSTOMERS (name ~ /sush/)", customers.length, "===");
  for (const c of customers) console.log({ _id: toStr(c._id), name: c.name, phone: c.phone });

  console.log("=== ORDERS", orders.length, "===");
  for (const o of orders) console.log(JSON.stringify({
    orderNumber: o.orderNumber, _id: toStr(o._id), customer: toStr(o.customer),
    name: o.customerSnapshot?.name, phone: o.customerSnapshot?.phone, invoice: toStr(o.invoice),
    grandTotal: o.grandTotal, amountPaid: o.amountPaid, status: o.status, source: o.source, createdAt: o.createdAt,
  }, null, 2));

  console.log("=== INVOICES", invoices.length, "===");
  for (const inv of invoices) console.log(JSON.stringify({
    invoiceNumber: inv.invoiceNumber, _id: toStr(inv._id), customer: toStr(inv.customer),
    name: inv.customerSnapshot?.name, phone: inv.customerSnapshot?.phone, order: toStr(inv.order),
    subtotal: inv.subtotal, discount: inv.discount, total: inv.total, amountPaid: inv.amountPaid,
    balanceDue: inv.balanceDue, status: inv.status, dueDate: inv.dueDate, createdAt: inv.createdAt,
    lines: (inv.lines || []).map((l) => ({ desc: l.description, qty: l.quantity, price: l.unitPrice, amount: l.amount })),
  }, null, 2));

  await mongoose.disconnect();
}

inspect().catch((err) => { console.error(err); process.exit(1); });
