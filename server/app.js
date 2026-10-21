import "dotenv/config";

import express from "express";
import cors from "cors";
import mongoose from "mongoose";

import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import mediaRoutes from "./routes/mediaRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import enquiryRoutes from "./routes/enquiryRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import crmRoutes from "./routes/crmRoutes.js";
import loyaltyRoutes from "./routes/loyaltyRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";

const app = express();

// Ensure the Mongo connection is warm on cold serverless invocations.
app.use((req, res, next) => {
  if (mongoose.connection.readyState === 0) {
    return connectDB().then(() => next()).catch(next);
  }
  next();
});

app.use(
  cors({
    origin: process.env.CLIENT_URL || true,
    credentials: true,
  })
);
app.use(express.json({ limit: "3mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "Cakestyles", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/enquiries", enquiryRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/campaigns", campaignRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  // A deliberate 4xx carries a message written for whoever is looking at the
  // screen. Anything else is a fault, and its message is a Mongo error or a
  // stack detail — logged in full above, never handed to the client.
  res.status(status).json({
    message: (status < 500 && err.message) || "Something went wrong. Please try again.",
  });
});

export default app;

