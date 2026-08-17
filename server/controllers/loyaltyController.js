import mongoose from "mongoose";
import { z } from "zod";

import Customer from "../models/Customer.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Order from "../models/Order.js";
import Setting from "../models/Setting.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  calculateRedemptionValue,
  normalizeLoyaltySettings,
  validateRedemption,
} from "../utils/loyalty.js";

const adjustmentSchema = z.object({
  points: z.number().int().refine((points) => points !== 0, "Must be a non-zero integer"),
  note: z.string().trim().min(1).max(500),
});

const redemptionSchema = z.object({
  points: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
  orderId: z.string().regex(/^[a-f\d]{24}$/i, "Must be a valid Mongo ObjectId").optional(),
});

const actorFor = (user) => ({ userId: user._id, name: user.name });

const validCustomerId = (req, res) => {
  if (mongoose.isValidObjectId(req.params.customerId)) return true;
  res.status(400).json({ message: "Invalid customer id" });
  return false;
};

export const getSummary = [protect, requirePerm("customers:read"), async (req, res) => {
  if (!validCustomerId(req, res)) return;

  const [customer, settings] = await Promise.all([
    Customer.findById(req.params.customerId)
      .select("name phone pointsBalance totalEarned totalRedeemed tier"),
    Setting.getSettings(),
  ]);
  if (!customer) return res.status(404).json({ message: "Customer not found" });

  const loyalty = normalizeLoyaltySettings(settings.loyalty?.toObject?.() || settings.loyalty);
  res.json({
    loyalty: {
      customer,
      redemptionValue: loyalty.redemptionValue,
      redeemableValue: calculateRedemptionValue(customer.pointsBalance, loyalty.redemptionValue),
      minRedeem: loyalty.minRedeem,
      enabled: loyalty.enabled,
    },
  });
}];

export const getHistory = [protect, requirePerm("customers:read"), async (req, res) => {
  if (!validCustomerId(req, res)) return;

  const customer = await Customer.findById(req.params.customerId).select("_id");
  if (!customer) return res.status(404).json({ message: "Customer not found" });

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const history = await LoyaltyTransaction.find({ customer: customer._id })
    .populate("order", "orderNumber")
    .sort({ createdAt: -1 })
    .limit(limit);

  res.json({ history });
}];

export const adjust = [
  protect,
  requirePerm("customers:write"),
  validate(adjustmentSchema),
  async (req, res) => {
    if (!validCustomerId(req, res)) return;

    const session = await mongoose.startSession();
    let customer;
    let transaction;

    try {
      await session.withTransaction(async () => {
        customer = await Customer.findOneAndUpdate(
          {
            _id: req.params.customerId,
            ...(req.body.points < 0 ? { pointsBalance: { $gte: -req.body.points } } : {}),
          },
          { $inc: { pointsBalance: req.body.points } },
          { new: true, session }
        );

        if (!customer) {
          const exists = await Customer.exists({ _id: req.params.customerId }).session(session);
          throw Object.assign(
            new Error(exists ? "Adjustment would make the points balance negative" : "Customer not found"),
            { status: exists ? 400 : 404 }
          );
        }

        [transaction] = await LoyaltyTransaction.create([{
          customer: customer._id,
          type: "adjust",
          points: req.body.points,
          balanceAfter: customer.pointsBalance,
          note: req.body.note,
          actor: actorFor(req.user),
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    res.json({ customer, transaction });
  },
];

export const redeem = [
  protect,
  requirePerm("customers:write"),
  validate(redemptionSchema),
  async (req, res) => {
    if (!validCustomerId(req, res)) return;

    const settings = await Setting.getSettings();
    const loyalty = normalizeLoyaltySettings(settings.loyalty?.toObject?.() || settings.loyalty);
    const session = await mongoose.startSession();
    let customer;
    let transaction;

    try {
      await session.withTransaction(async () => {
        const current = await Customer.findById(req.params.customerId).session(session);
        if (!current) throw Object.assign(new Error("Customer not found"), { status: 404 });

        const validationError = validateRedemption({
          points: req.body.points,
          balance: current.pointsBalance,
          minRedeem: loyalty.minRedeem,
          enabled: loyalty.enabled,
        });
        if (validationError) throw Object.assign(new Error(validationError), { status: 400 });

        let order = null;
        if (req.body.orderId) {
          order = await Order.findOne({ _id: req.body.orderId, customer: current._id }).session(session);
          if (!order) {
            throw Object.assign(new Error("Order not found for this customer"), { status: 404 });
          }
        }

        current.pointsBalance -= req.body.points;
        current.totalRedeemed += req.body.points;
        await current.save({ session });
        customer = current;

        [transaction] = await LoyaltyTransaction.create([{
          customer: current._id,
          type: "redeem",
          points: -req.body.points,
          balanceAfter: current.pointsBalance,
          order: order?._id || null,
          note: req.body.note || "Loyalty points redeemed",
          actor: actorFor(req.user),
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    res.json({
      customer,
      transaction,
      redemptionAmount: calculateRedemptionValue(req.body.points, loyalty.redemptionValue),
    });
  },
];
