import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";

import Order from "../models/Order.js";
import Product from "../models/Product.js";
import Customer from "../models/Customer.js";
import Setting from "../models/Setting.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import {
  ORDER_SOURCES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
} from "../config/constants.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "../utils/audit.js";
import { nextOrderNumber } from "../utils/numbers.js";
import { computeTotals, lineTotal, sumPayments, round2, paymentStatusFor } from "../utils/pricing.js";
import { normalizePhone } from "../utils/misc.js";
import { istDateString, startOfIstDay, istToUtc } from "../utils/dates.js";
import { notifyOrderPlaced, notifyOrderStatus } from "../utils/notify.js";
import {
  calculateEarnPoints,
  calculateTier,
  normalizeLoyaltySettings,
} from "../utils/loyalty.js";

export const isMongoObjectId = (value) =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value) && mongoose.isValidObjectId(value);

const objectIdSchema = z.string().refine(isMongoObjectId, "Must be a valid Mongo ObjectId");

const catalogItemSchema = z.object({
  productId: objectIdSchema,
  variantName: z.string().optional(),
  quantity: z.number().int().min(1).max(99),
  addOns: z.array(z.string()).optional(),
  notes: z.string().max(500).optional(),
});

const customItemSchema = z.object({
  name: z.string().min(1),
  unitPrice: z.number().min(0),
  quantity: z.number().int().min(1).max(999),
  notes: z.string().max(500).optional(),
});

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  pincode: z.string().min(1),
  notes: z.string().optional(),
});

const fulfilmentSchema = z.object({
  type: z.enum(["pickup", "delivery"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.string().optional(),
  address: addressSchema.optional(),
}).superRefine((fulfilment, ctx) => {
  if (fulfilment.type === "delivery" && !fulfilment.address) {
    ctx.addIssue({ code: "custom", path: ["address"], message: "Delivery address is required" });
  }
});

const checkoutSchema = z.object({
  items: z.array(catalogItemSchema).min(1),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(8),
    email: z.string().email().optional().or(z.literal("")),
  }),
  fulfilment: fulfilmentSchema,
  specialInstructions: z.string().max(1000).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
});

// ---- Shared helpers -------------------------------------------------------

// Prices ALWAYS come from the database, never the client (PRD §24).
export const isProductPublic = (product, now = new Date()) =>
  product.status === "published" ||
  Boolean(product.status === "scheduled" && product.publishAt && new Date(product.publishAt) <= now);

export const hashCheckoutToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const priceCatalogItem = (item, product) => {
  if (!product) throw Object.assign(new Error(`Product ${item.productId} no longer exists`), { status: 400 });
  if (!isProductPublic(product)) {
    throw Object.assign(new Error(`${product.name} is not currently available`), { status: 400 });
  }
  if (product.availability !== "active") {
    throw Object.assign(new Error(`${product.name} is currently ${product.availability.replace("_", " ")}`), { status: 400 });
  }
  if (product.orderability !== "online") {
    throw Object.assign(new Error(`${product.name} is browse-only and cannot be ordered online`), { status: 400 });
  }

  const variants = product.variants || [];
  if (variants.length > 0 && !item.variantName) {
    throw Object.assign(new Error(`Please choose a variant for ${product.name}`), { status: 400 });
  }
  const variant = item.variantName
    ? variants.find((candidate) => candidate.name === item.variantName)
    : null;
  if (item.variantName && !variant) {
    throw Object.assign(new Error(`Variant "${item.variantName}" not available for ${product.name}`), { status: 400 });
  }

  const requestedAddOns = item.addOns || [];
  if (new Set(requestedAddOns).size !== requestedAddOns.length) {
    throw Object.assign(new Error(`Duplicate add-ons are not allowed for ${product.name}`), { status: 400 });
  }
  const availableAddOns = product.addOns || [];
  const unknownAddOn = requestedAddOns.find((name) => !availableAddOns.some((addOn) => addOn.name === name));
  if (unknownAddOn) {
    throw Object.assign(new Error(`Add-on "${unknownAddOn}" not available for ${product.name}`), { status: 400 });
  }
  const addOns = requestedAddOns.map((name) => {
    const addOn = availableAddOns.find((candidate) => candidate.name === name);
    return { name: addOn.name, price: addOn.price };
  });
  const unitPrice = variant ? variant.price : product.basePrice;

  return {
    product: product._id,
    name: product.name,
    variantName: variant?.name || "",
    unitPrice,
    quantity: item.quantity,
    addOns,
    lineTotal: lineTotal({ unitPrice, quantity: item.quantity, addOns }),
    isCustom: false,
    notes: item.notes || "",
  };
};

const priceCatalogItems = async (rawItems) => {
  const ids = [...new Set(rawItems.map((item) => item.productId))];
  const products = await Product.find({ _id: { $in: ids } });
  const byId = new Map(products.map((product) => [String(product._id).toLowerCase(), product]));

  return rawItems.map((item) => priceCatalogItem(item, byId.get(item.productId.toLowerCase())));
};

export const validateFulfilment = (fulfilment, settings, items, now = new Date()) => {
  const today = istDateString(now);
  if (fulfilment.date < today) {
    throw Object.assign(new Error("Fulfilment date cannot be in the past"), { status: 400 });
  }

  // Minimum notice from the strictest product prep time.
  const needed = items.reduce((max, it) => Math.max(max, it.prepTimeHours || 0), 0);

  let minimumNoticeHours = needed;
  if (fulfilment.type === "delivery") {
    if (!fulfilment.address) {
      throw Object.assign(new Error("Delivery address is required"), { status: 400 });
    }
    if (!settings.delivery?.enabled) {
      throw Object.assign(new Error("Delivery is currently not available"), { status: 400 });
    }
    const pincodes = settings.delivery.pincodes || [];
    if (pincodes.length > 0) {
      const pin = fulfilment.address.pincode.trim();
      if (!pincodes.includes(pin)) {
        throw Object.assign(new Error(`We don't deliver to this pincode yet. Please choose pickup.`), { status: 400 });
      }
    }
  } else {
    const slots = settings.pickup?.slots || [];
    if (slots.length === 0) {
      throw Object.assign(new Error("Pickup is currently not available"), { status: 400 });
    }
    if (!fulfilment.slot || !slots.includes(fulfilment.slot)) {
      throw Object.assign(new Error("Please choose a valid pickup slot"), { status: 400 });
    }
    minimumNoticeHours = Math.max(needed, Number(settings.pickup.cutoffHours) || 0);
  }

  const slotTime = (fulfilment.slot || "23:59").split(" - ")[0];
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slotTime)) {
    throw Object.assign(new Error("Invalid fulfilment slot configuration"), { status: 500 });
  }
  const slotStart = istToUtc(fulfilment.date, slotTime);
  const earliestAllowed = new Date(now.getTime() + minimumNoticeHours * 3600 * 1000);

  if (slotStart < earliestAllowed) {
    throw Object.assign(
      new Error(`This date/slot needs more preparation time. Please pick a later slot (min ${minimumNoticeHours}h notice).`),
      { status: 400 }
    );
  }
};

export const validateCheckoutPaymentMethod = (method, settings) => {
  if (method === "razorpay") {
    if (!settings.paymentMethods?.online?.enabled) {
      throw Object.assign(new Error("Online payment is currently unavailable. Please choose another method."), { status: 400 });
    }
    return;
  }

  if (!(settings.paymentMethods?.offline || []).includes(method)) {
    throw Object.assign(new Error("This payment method is not available. Please choose another method."), { status: 400 });
  }
};

const findOrCreateCustomer = async ({ name, phone, email, leadSource }) => {
  const normalized = normalizePhone(phone);
  let customer = await Customer.findOne({ phone: normalized });
  if (!customer) {
    customer = await Customer.create({
      name,
      phone: normalized,
      email: email || "",
      leadSource: leadSource || "",
    });
  } else if (email && !customer.email) {
    customer.email = email;
    await customer.save();
  }
  return customer;
};

const applyDeliveryFee = (settings, subtotal) => {
  if (!settings.delivery.enabled || settings.delivery.fee <= 0) return 0;
  if (settings.delivery.freeOver > 0 && subtotal >= settings.delivery.freeOver) return 0;
  return settings.delivery.fee;
};

export const awardLoyaltyForCompletedOrder = async (orderId, actor = {}) => {
  const settings = await Setting.getSettings();
  const loyalty = normalizeLoyaltySettings(settings.loyalty?.toObject?.() || settings.loyalty);
  const candidate = await Order.findById(orderId)
    .select("status customer grandTotal loyaltyAwarded loyaltyPoints orderNumber");

  if (!candidate || candidate.status !== "completed" || candidate.loyaltyAwarded) return null;

  const candidatePoints = calculateEarnPoints(candidate.grandTotal, loyalty.earnPerRupee);
  if (!loyalty.enabled || !candidate.customer || candidatePoints <= 0) {
    const claimed = await Order.findOneAndUpdate(
      { _id: candidate._id, status: "completed", loyaltyAwarded: false },
      { $set: { loyaltyAwarded: true, loyaltyPoints: 0 } },
      { new: true }
    );
    return claimed ? { awarded: true, points: 0, transaction: null } : null;
  }

  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({
        _id: candidate._id,
        status: "completed",
        loyaltyAwarded: false,
      }).session(session);
      if (!order) return;

      const points = calculateEarnPoints(order.grandTotal, loyalty.earnPerRupee);
      const customer = await Customer.findById(order.customer).session(session);
      if (!customer || points <= 0) {
        order.loyaltyAwarded = true;
        order.loyaltyPoints = 0;
        await order.save({ session });
        result = { awarded: true, points: 0, transaction: null };
        return;
      }

      customer.pointsBalance += points;
      customer.totalEarned += points;
      customer.tier = calculateTier(customer.totalEarned, loyalty.tierThresholds);
      await customer.save({ session });

      const [transaction] = await LoyaltyTransaction.create([{
        customer: customer._id,
        type: "earn",
        points,
        balanceAfter: customer.pointsBalance,
        order: order._id,
        note: `Points earned for order ${order.orderNumber}`,
        actor,
      }], { session });

      order.loyaltyAwarded = true;
      order.loyaltyPoints = points;
      await order.save({ session });
      result = { awarded: true, points, transaction };
    });
  } finally {
    await session.endSession();
  }

  return result;
};

// ---- Public endpoints -----------------------------------------------------

export const checkout = [validate(checkoutSchema), async (req, res) => {
  const settings = await Setting.getSettings();
  const body = req.body;

  const items = await priceCatalogItems(body.items);

  // Prep-time check needs raw product prep hours.
  const productIds = items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds } }).select("prepTimeHours");
  const prepById = new Map(products.map((p) => [String(p._id).toLowerCase(), p.prepTimeHours]));
  const itemsWithPrep = body.items.map((i) => ({
    prepTimeHours: prepById.get(String(i.productId).toLowerCase()) || 0,
  }));
  validateFulfilment(body.fulfilment, settings, itemsWithPrep);

  const taxRate = settings.tax.enabled ? settings.tax.rate : 0;
  const subtotalForFee = items.reduce((s, i) => s + i.lineTotal, 0);
  const totals = computeTotals({
    items,
    deliveryFee: body.fulfilment.type === "delivery" ? applyDeliveryFee(settings, subtotalForFee) : 0,
    taxRate,
    taxInclusive: settings.tax.inclusive,
  });

  const isOnline = body.paymentMethod === "razorpay";
  validateCheckoutPaymentMethod(body.paymentMethod, settings);

  const customer = await findOrCreateCustomer({
    ...body.customer,
    phone: normalizePhone(body.customer.phone),
    leadSource: "website",
  });

  const checkoutToken = crypto.randomBytes(32).toString("hex");
  const order = await Order.create({
    orderNumber: await nextOrderNumber(),
    checkoutToken: hashCheckoutToken(checkoutToken),
    customer: customer._id,
    customerSnapshot: {
      name: body.customer.name,
      phone: normalizePhone(body.customer.phone),
      email: body.customer.email || "",
    },
    source: "website",
    fulfilment: {
      type: body.fulfilment.type,
      date: body.fulfilment.date,
      slot: body.fulfilment.slot || "",
      address: body.fulfilment.type === "delivery" ? body.fulfilment.address : undefined,
    },
    items,
    ...totals,
    amountPaid: 0,
    specialInstructions: body.specialInstructions || "",
    payment: {
      status: "pending",
      method: body.paymentMethod,
    },
    status: isOnline ? "pending_payment" : "confirmed",
    statusHistory: [
      { status: isOnline ? "pending_payment" : "confirmed", note: "Order placed on website", by: { name: customer.name } },
    ],
  });

  // Save the delivery address to the customer's address book.
  if (body.fulfilment.type === "delivery" && body.fulfilment.address) {
    const c = await Customer.findById(customer._id);
    const exists = c.addresses.some((a) => a.line1 === body.fulfilment.address.line1 && a.pincode === body.fulfilment.address.pincode);
    if (!exists) {
      c.addresses.push({ ...body.fulfilment.address, label: "Delivery" });
      await c.save();
    }
  }

  await notifyOrderPlaced(order);
  const publicOrder = order.toObject();
  delete publicOrder.checkoutToken;
  res.status(201).json({ order: publicOrder, checkoutToken });
}];

export const track = async (req, res) => {
  const phone = normalizePhone(req.query.phone || "");
  if (!phone) return res.status(400).json({ message: "Phone number required" });

  const order = await Order.findOne({
    orderNumber: (req.params.orderNumber || "").toUpperCase(),
    "customerSnapshot.phone": phone,
  }).select("orderNumber status statusHistory fulfilment items grandTotal amountPaid payment.status createdAt");

  if (!order) return res.status(404).json({ message: "No order found for this number and phone" });
  res.json({ order });
};

// ---- Admin endpoints ------------------------------------------------------

export const list = [protect, requirePerm("orders:read"), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.source) filter.source = req.query.source;
  if (req.query.paymentStatus) filter["payment.status"] = req.query.paymentStatus;
  if (req.query.search) {
    const s = new RegExp(req.query.search, "i");
    filter.$or = [
      { orderNumber: s },
      { "customerSnapshot.name": s },
      { "customerSnapshot.phone": s },
    ];
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = startOfIstDay(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(istToUtc(req.query.to, "23:59"));
  }

  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const orders = await Order.find(filter)
    .populate("customer", "name phone tags")
    .sort({ createdAt: -1 })
    .limit(limit);

  res.json({ orders });
}];

export const getOne = [protect, requirePerm("orders:read"), async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("customer", "name phone email tags addresses notes")
    .populate("invoice", "invoiceNumber status balanceDue");
  if (!order) return res.status(404).json({ message: "Order not found" });
  res.json({ order });
}];

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().max(500).optional(),
});

export const updateStatus = [protect, requirePerm("orders:write"), validate(statusSchema), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: "Order not found" });

  const before = { status: order.status };
  order.status = req.body.status;
  order.statusHistory.push({
    status: req.body.status,
    by: { userId: req.user._id, name: req.user.name },
    note: req.body.note || "",
  });
  await order.save();

  if (req.body.status === "completed") {
    const award = await awardLoyaltyForCompletedOrder(order._id, {
      userId: req.user._id,
      name: req.user.name,
    });
    if (award?.awarded) {
      order.loyaltyAwarded = true;
      order.loyaltyPoints = award.points;
    }
  }

  await writeAudit({
    req, action: "order.status", entity: "Order", entityId: order._id,
    before, after: { status: order.status }, fields: ["status"], meta: order.orderNumber,
  });
  await notifyOrderStatus(order, req.body.status);

  res.json({ order });
}];

const paymentSchema = z.object({
  amount: z.number().min(0.01),
  method: z.enum(PAYMENT_METHODS),
  ref: z.string().max(100).optional(),
  note: z.string().max(300).optional(),
  paidAt: z.string().optional(),
});

// Records deposits/advances and balance payments (PRD §10.4, §13.2).
export const recordPayment = [protect, requirePerm("finance:write"), validate(paymentSchema), async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: "Order not found" });

  const amount = round2(req.body.amount);
  if (order.amountPaid + amount > order.grandTotal + 0.001) {
    return res.status(400).json({ message: `Payment exceeds balance due (₹${round2(order.grandTotal - order.amountPaid)})` });
  }

  order.payment.payments.push({
    amount,
    method: req.body.method,
    ref: req.body.ref || "",
    note: req.body.note || "",
    paidAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(),
    recordedBy: { userId: req.user._id, name: req.user.name },
  });
  order.amountPaid = sumPayments(order.payment.payments);
  order.payment.status = paymentStatusFor(order.grandTotal, order.amountPaid);

  // A paid order awaiting payment confirmation becomes confirmed.
  if (order.status === "pending_payment" && order.payment.status === "paid") {
    order.status = "confirmed";
    order.statusHistory.push({ status: "confirmed", by: { userId: req.user._id, name: req.user.name }, note: "Payment received" });
  }

  await order.save();

  await writeAudit({
    req, action: "order.payment", entity: "Order", entityId: order._id,
    meta: `${order.orderNumber}: ₹${amount} via ${req.body.method}`,
  });

  res.json({ order });
}];

const manualOrderSchema = z.object({
  customerId: objectIdSchema.optional(),
  newCustomer: z.object({ name: z.string().min(1), phone: z.string().min(8), email: z.string().optional() }).optional(),
  source: z.enum(ORDER_SOURCES.filter((s) => s !== "website")),
  items: z.array(z.union([catalogItemSchema, customItemSchema])).min(1),
  fulfilment: z.object({
    type: z.enum(["pickup", "delivery"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    slot: z.string().optional(),
    address: addressSchema.optional(),
  }),
  specialInstructions: z.string().max(1000).optional(),
  deposit: z.object({ amount: z.number().min(0), method: z.enum(PAYMENT_METHODS), ref: z.string().optional() }).optional(),
  dueDate: z.string().optional(),
});

// Staff-created orders from Instagram/WhatsApp/phone/walk-in — identical
// records to website orders, just a different source (PRD §10.4, §22.5).
export const createManual = [protect, requirePerm("orders:write"), validate(manualOrderSchema), async (req, res) => {
  const body = req.body;

  let customer = null;
  if (body.customerId) {
    customer = await Customer.findById(body.customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
  } else if (body.newCustomer) {
    customer = await findOrCreateCustomer({ ...body.newCustomer, phone: normalizePhone(body.newCustomer.phone), leadSource: body.source });
  } else {
    return res.status(400).json({ message: "Select an existing customer or provide new customer details" });
  }

  // Split catalogue vs custom line items; custom items bypass catalogue pricing.
  const catalogItems = body.items.filter((i) => i.productId);
  const customItems = body.items.filter((i) => !i.productId && i.name);

  const pricedCatalog = await priceCatalogItems(catalogItems);
  const pricedCustom = customItems.map((i) => ({
    name: i.name,
    variantName: "",
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    addOns: [],
    lineTotal: lineTotal(i),
    isCustom: true,
    notes: i.notes || "",
  }));

  const items = [...pricedCatalog, ...pricedCustom];
  const totals = computeTotals({ items });

  const depositPayments = [];
  let amountPaid = 0;
  if (body.deposit && body.deposit.amount > 0) {
    if (body.deposit.amount > totals.grandTotal + 0.001) {
      return res.status(400).json({ message: "Deposit exceeds order total" });
    }
    depositPayments.push({
      amount: body.deposit.amount,
      method: body.deposit.method,
      ref: body.deposit.ref || "",
      note: "Deposit/advance at order creation",
      recordedBy: { userId: req.user._id, name: req.user.name },
    });
    amountPaid = body.deposit.amount;
  }

  const order = await Order.create({
    orderNumber: await nextOrderNumber(),
    customer: customer._id,
    customerSnapshot: { name: customer.name, phone: customer.phone, email: customer.email || "" },
    source: body.source,
    fulfilment: body.fulfilment,
    items,
    ...totals,
    amountPaid,
    specialInstructions: [body.specialInstructions || "", body.dueDate ? `Balance due by ${body.dueDate}` : ""].filter(Boolean).join(" | "),
    payment: {
      status: paymentStatusFor(totals.grandTotal, amountPaid),
      method: depositPayments[0]?.method || null,
      payments: depositPayments,
    },
    status: "confirmed",
    statusHistory: [
      {
        status: "confirmed",
        by: { userId: req.user._id, name: req.user.name },
        note: `Manual order (${body.source})`,
      },
    ],
    createdBy: { userId: req.user._id, name: req.user.name },
  });

  await writeAudit({ req, action: "order.createManual", entity: "Order", entityId: order._id, meta: order.orderNumber });
  res.status(201).json({ order });
}];
