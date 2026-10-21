// Read-only: list every invoice and order in the cakestyles and test DBs.
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../server/.env") });
const toStr = (v) => (v ? String(v) : null);

async function run() {
  const conn = await mongoose.connect(process.env.MONGO_URI);
  for (const dbName of ["cakestyles", "test"]) {
    const db = conn.connection.useDb(dbName);
    const invs = await db.collection("invoices").find({}).sort({ createdAt: 1 }).toArray();
    const ords = await db.collection("orders").find({}).sort({ createdAt: 1 }).toArray();
    const custs = await db.collection("customers").find({}).sort({ name: 1 }).toArray();
    console.log(`\n########## DB ${dbName} ##########`);
    console.log("CUSTOMERS:");
    for (const c of custs) console.log(`  {_id: ${toStr(c._id)}, name: "${c.name}", phone: "${c.phone}"}`);
    console.log("ORDERS:");
    for (const o of ords) console.log(JSON.stringify({ orderNumber: o.orderNumber, _id: toStr(o._id), customer: toStr(o.customer), name: o.customerSnapshot?.name, phone: o.customerSnapshot?.phone, invoice: toStr(o.invoice), grandTotal: o.grandTotal, amountPaid: o.amountPaid, status: o.status, source: o.source, createdAt: o.createdAt }));
    console.log("INVOICES:");
    for (const inv of invs) console.log(JSON.stringify({ invoiceNumber: inv.invoiceNumber, _id: toStr(inv._id), customer: toStr(inv.customer), name: inv.customerSnapshot?.name, phone: inv.customerSnapshot?.phone, order: toStr(inv.order), subtotal: inv.subtotal, discount: inv.discount, total: inv.total, amountPaid: inv.amountPaid, balanceDue: inv.balanceDue, status: inv.status, dueDate: inv.dueDate, createdAt: inv.createdAt, lines: (inv.lines || []).map((l) => `${l.description} x${l.quantity} @${l.unitPrice}=${l.amount}`) }));
  }
  await mongoose.disconnect();
}
run().catch((err) => { console.error(err); process.exit(1); });
