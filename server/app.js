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
import maintenanceRoutes from "./routes/maintenanceRoutes.js";

const app = express();

// Ensure the Mongo connection is warm on cold serverless invocations.
app.use((req, res, next) => {
  if (mongoose.connection.readyState === 0) {
    return connectDB().then(() => next()).catch(next);
  }
  next();
});

// CORS with an actual allowlist.
//
// `origin: process.env.CLIENT_URL || true` reflected whatever Origin the caller
// sent, together with credentials: true — so any site could call the API from a
// visitor's browser and read the response. Auth is a Bearer token rather than a
// cookie, which is the only reason that was not worse.
//
// The storefront and the API share a host, so the common case needs no CORS at
// all. An explicit CLIENT_URL (comma-separated) still wins, which is what a
// split frontend or a dev server on another port needs.
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;
    let allow = true;

    if (origin) {
      if (allowedOrigins.length > 0) {
        allow = allowedOrigins.includes(origin);
      } else {
        // No allowlist configured: allow the site's own host only.
        try {
          allow = new URL(origin).host === req.headers.host;
        } catch {
          allow = false;
        }
      }
    }

    callback(null, { origin: allow, credentials: true });
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
app.use("/api/maintenance", maintenanceRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  // A malformed :id — /api/customers/summary, a truncated link someone pasted —
  // is a bad URL, not a server fault. Mongoose raises a CastError for it, and
  // answering 500 both blamed the server and filled the logs with noise.
  const castError = err.name === "CastError";
  const status = castError ? 404 : err.status || 500;

  if (!castError) console.error("Unhandled error:", err);

  // A deliberate 4xx carries a message written for whoever is looking at the
  // screen. Anything else is a fault, and its message is a Mongo error or a
  // stack detail — logged in full above, never handed to the client.
  res.status(status).json({
    message: castError
      ? "Not found"
      : (status < 500 && err.message) || "Something went wrong. Please try again.",
  });
});

export default app;

