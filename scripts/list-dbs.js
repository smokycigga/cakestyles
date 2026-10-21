// Read-only: list every database on the connected cluster and show invoice/order
// counts, plus which ones hold the referenced invoice numbers or a /sush/ name.
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../server/.env") });

async function run() {
  const conn = await mongoose.connect(process.env.MONGO_URI);
  const adminDb = conn.connection.db.admin();
  const dbs = await adminDb.listDatabases();
  console.log("Databases:", dbs.databases.map((d) => d.name));

  for (const d of dbs.databases) {
    if (d.name === "admin" || d.name === "local" || d.name === "config") continue;
    const db = conn.connection.useDb(d.name);
    const invCol = db.collection("invoices");
    const ordCol = db.collection("orders");
    const custCol = db.collection("customers");

    let invCount = 0, ordCount = 0, custCount = 0;
    try { invCount = await invCol.countDocuments(); } catch {}
    try { ordCount = await ordCol.countDocuments(); } catch {}
    try { custCount = await custCol.countDocuments(); } catch {}

    const hitInvoices = [];
    try {
      hitInvoices = await invCol.find({
        $or: [{ invoiceNumber: /5100|5400/ }, { total: { $in: [5100, 5400] } }, { "customerSnapshot.name": /sush/i }],
      }).sort({ createdAt: 1 }).toArray();
    } catch {}
    const hitOrders = [];
    try {
      hitOrders = await ordCol.find({
        $or: [{ orderNumber: /5100|5400/ }, { grandTotal: { $in: [5100, 5400] } }, { "customerSnapshot.name": /sush/i }],
      }).sort({ createdAt: 1 }).toArray();
    } catch {}

    console.log(`\n--- DB ${d.name} --- invoices=${invCount} orders=${ordCount} customers=${custCount}`);
    for (const inv of hitInvoices) {
      console.log("  INV", inv.invoiceNumber, inv.customerSnapshot?.name, `total=${inv.total}`, `status=${inv.status}`, `order=${inv.order ? String(inv.order) : "none"}`, `_id=${String(inv._id)}`);
    }
    for (const o of hitOrders) {
      console.log("  ORD", o.orderNumber, o.customerSnapshot?.name, `grandTotal=${o.grandTotal}`, `status=${o.status}`, `invoice=${o.invoice ? String(o.invoice) : "none"}`, `_id=${String(o._id)}`);
    }
  }

  await mongoose.disconnect();
}
run().catch((err) => { console.error(err); process.exit(1); });
