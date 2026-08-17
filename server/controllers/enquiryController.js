import { z } from "zod";

import Enquiry from "../models/Enquiry.js";
import Order from "../models/Order.js";
import Customer from "../models/Customer.js";
import { ENQUIRY_STATUSES, ORDER_SOURCES, PAYMENT_METHODS } from "../config/constants.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "../utils/audit.js";
import { normalizePhone } from "../utils/misc.js";
import { nextOrderNumber } from "../utils/numbers.js";
import { computeTotals, lineTotal, paymentStatusFor } from "../utils/pricing.js";
import { notifyEnquiryReceived } from "../utils/notify.js";

const publicCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
  email: z.string().email().optional().or(z.literal("")),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.number().int().min(1).optional(),
  size: z.string().optional(),
  flavours: z.string().optional(),
  designNotes: z.string().max(3000).optional(),
  budgetRange: z.string().optional(),
  fulfilmentPref: z.object({ type: z.enum(["pickup", "delivery", ""]), address: z.string().optional() }).optional(),
});

const adminCreateSchema = publicCreateSchema.extend({
  source: z.enum(ORDER_SOURCES).optional(),
  referenceImages: z.array(z.string()).optional(),
});

const statusSchema = z.object({ status: z.enum(ENQUIRY_STATUSES), note: z.string().max(500).optional() });
const noteSchema = z.object({ text: z.string().min(1).max(1000) });

const convertSchema = z.object({
  amount: z.number().min(0.01),
  fulfilment: z.object({
    type: z.enum(["pickup", "delivery"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot: z.string().optional(),
    address: z.object({
      line1: z.string().min(1), line2: z.string().optional(),
      city: z.string().min(1), pincode: z.string().min(1), notes: z.string().optional(),
    }).optional(),
  }),
  deposit: z.object({ amount: z.number().min(0), method: z.enum(PAYMENT_METHODS), ref: z.string().optional() }).optional(),
  balanceDueDate: z.string().optional(),
});

export const createPublic = [validate(publicCreateSchema), async (req, res) => {
  const body = req.body;
  const phone = normalizePhone(body.phone);

  let customer = await Customer.findOne({ phone });
  if (!customer) {
    customer = await Customer.create({ name: body.name, phone, email: body.email || "", leadSource: "website" });
  }

  const enquiry = await Enquiry.create({
    customer: customer._id,
    customerSnapshot: { name: body.name, phone, email: body.email || "" },
    source: "website",
    eventDate: body.eventDate,
    guestCount: body.guestCount || null,
    size: body.size || "",
    flavours: body.flavours || "",
    designNotes: body.designNotes || "",
    budgetRange: body.budgetRange || "",
    fulfilmentPref: body.fulfilmentPref || { type: "", address: "" },
  });

  await notifyEnquiryReceived(enquiry);
  res.status(201).json({ enquiry: { _id: enquiry._id } });
}];

export const createAdmin = [protect, requirePerm("enquiries:write"), validate(adminCreateSchema), async (req, res) => {
  const body = req.body;
  const phone = normalizePhone(body.phone);

  let customer = await Customer.findOne({ phone });
  if (!customer) {
    customer = await Customer.create({ name: body.name, phone, email: body.email || "", leadSource: body.source || "other" });
  }

  const enquiry = await Enquiry.create({
    customer: customer._id,
    customerSnapshot: { name: body.name, phone, email: body.email || "" },
    source: body.source || "other",
    eventDate: body.eventDate,
    guestCount: body.guestCount || null,
    size: body.size || "",
    flavours: body.flavours || "",
    designNotes: body.designNotes || "",
    budgetRange: body.budgetRange || "",
    referenceImages: body.referenceImages || [],
    fulfilmentPref: body.fulfilmentPref || { type: "", address: "" },
    createdBy: { userId: req.user._id, name: req.user.name },
  });

  await writeAudit({ req, action: "enquiry.create", entity: "Enquiry", entityId: enquiry._id });
  res.status(201).json({ enquiry });
}];

export const list = [protect, requirePerm("enquiries:read"), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const s = new RegExp(req.query.search, "i");
    filter.$or = [{ "customerSnapshot.name": s }, { "customerSnapshot.phone": s }];
  }

  const enquiries = await Enquiry.find(filter).sort({ createdAt: -1 }).limit(300);
  res.json({ enquiries });
}];

export const getOne = [protect, requirePerm("enquiries:read"), async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id).populate("customer", "name phone email tags").populate("convertedOrder", "orderNumber status grandTotal");
  if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
  res.json({ enquiry });
}];

export const updateStatus = [protect, requirePerm("enquiries:write"), validate(statusSchema), async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });

  const before = { status: enquiry.status };
  enquiry.status = req.body.status;
  if (req.body.note) {
    enquiry.notes.push({ text: req.body.note, by: { userId: req.user._id, name: req.user.name } });
  }
  await enquiry.save();

  await writeAudit({ req, action: "enquiry.status", entity: "Enquiry", entityId: enquiry._id, before, after: { status: enquiry.status }, fields: ["status"] });
  res.json({ enquiry });
}];

export const addNote = [protect, requirePerm("enquiries:write"), validate(noteSchema), async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });

  enquiry.notes.push({ text: req.body.text, by: { userId: req.user._id, name: req.user.name } });
  await enquiry.save();
  res.json({ enquiry });
}];

// Converts a confirmed enquiry into an order without re-entering customer
// details (PRD §11.4): custom line item + deposit + balance tracking.
export const convertToOrder = [protect, requirePerm("orders:write"), validate(convertSchema), async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
  if (enquiry.convertedOrder) {
    return res.status(400).json({ message: `Already converted to order ${enquiry.convertedOrder}` });
  }

  const { amount, fulfilment, deposit, balanceDueDate } = req.body;

  const item = {
    name: `Custom cake — ${enquiry.customerSnapshot.name} (${enquiry.eventDate})`,
    variantName: enquiry.size || "",
    unitPrice: amount,
    quantity: 1,
    addOns: [],
    lineTotal: lineTotal({ unitPrice: amount, quantity: 1 }),
    isCustom: true,
    notes: [enquiry.flavours, enquiry.designNotes].filter(Boolean).join(" — ").slice(0, 500),
  };

  const totals = computeTotals({ items: [item] });

  const payments = [];
  let amountPaid = 0;
  if (deposit && deposit.amount > 0) {
    if (deposit.amount > totals.grandTotal + 0.001) {
      return res.status(400).json({ message: "Deposit exceeds quoted amount" });
    }
    payments.push({
      amount: deposit.amount,
      method: deposit.method,
      ref: deposit.ref || "",
      note: "Deposit on enquiry confirmation",
      recordedBy: { userId: req.user._id, name: req.user.name },
    });
    amountPaid = deposit.amount;
  }

  const order = await Order.create({
    orderNumber: await nextOrderNumber(),
    customer: enquiry.customer,
    customerSnapshot: enquiry.customerSnapshot,
    source: enquiry.source === "website" ? "other" : enquiry.source,
    fulfilment,
    items: [item],
    ...totals,
    amountPaid,
    specialInstructions: balanceDueDate ? `Balance due by ${balanceDueDate}` : "",
    payment: {
      status: paymentStatusFor(totals.grandTotal, amountPaid),
      method: payments[0]?.method || null,
      payments,
    },
    status: "confirmed",
    statusHistory: [{ status: "confirmed", by: { userId: req.user._id, name: req.user.name }, note: "Converted from enquiry" }],
    enquiry: enquiry._id,
    createdBy: { userId: req.user._id, name: req.user.name },
  });

  enquiry.convertedOrder = order._id;
  enquiry.status = "confirmed";
  enquiry.quotedAmount = amount;
  await enquiry.save();

  await writeAudit({ req, action: "enquiry.convert", entity: "Enquiry", entityId: enquiry._id, meta: `-> ${order.orderNumber}` });
  res.status(201).json({ order });
}];
