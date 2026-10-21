import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../server/.env") });

async function inspect() {
  const conn = await mongoose.connect(process.env.MONGO_URI);
  const adminDb = conn.connection.db.admin();
  const dbs = await adminDb.listDatabases();
  console.log("Databases on cluster:", dbs.databases.map(d => d.name));
  const testDb = conn.connection.useDb("test");
  const testInvoices = await testDb.collection("invoices").find({}).sort({ invoiceNumber: 1 }).toArray();
  console.log("=== TEST DB INVOICES (" + testInvoices.length + ") ===");
  for (const inv of testInvoices) {
    console.log(inv.invoiceNumber, inv.customerSnapshot?.name, inv.total);
  }
  const db = mongoose.connection.db;

  const invoices = await db.collection("invoices").find({}).sort({ invoiceNumber: 1 }).toArray();
  console.log("=== INVOICES (" + invoices.length + ") ===");
  for (const inv of invoices) {
    console.log(JSON.stringify({
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customerSnapshot?.name,
      phone: inv.customerSnapshot?.phone,
      order: inv.order,
      subtotal: inv.subtotal,
      total: inv.total,
      status: inv.status,
      date: inv.date,
      dueDate: inv.dueDate,
      createdAt: inv.createdAt,
      lines: inv.lines?.map(l => ({ desc: l.description, qty: l.quantity, price: l.unitPrice, amount: l.amount }))
    }, null, 2));
  }

  const orders = await db.collection("orders").find({}).sort({ orderNumber: 1 }).toArray();
  console.log("=== ORDERS (" + orders.length + ") ===");
  for (const ord of orders) {
    console.log(JSON.stringify({
      orderNumber: ord.orderNumber,
      customer: ord.customerSnapshot?.name,
      phone: ord.customerSnapshot?.phone,
      invoice: ord.invoice,
      grandTotal: ord.grandTotal,
      status: ord.status,
      createdAt: ord.createdAt
    }, null, 2));
  }

  await mongoose.disconnect();
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
