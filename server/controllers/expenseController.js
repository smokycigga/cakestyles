import { z } from "zod";

import Expense from "../models/Expense.js";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../config/constants.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { writeAudit } from "../utils/audit.js";
import { round2 } from "../utils/pricing.js";
import { sendCSV } from "../utils/csv.js";

const expenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(1).max(500),
  amount: z.number().min(0),
  vendor: z.string().max(200).optional(),
  paymentMethod: z.enum([...PAYMENT_METHODS, ""]).optional(),
  attachment: z.string().optional(),
  recurring: z.object({ isRecurring: z.boolean(), frequency: z.enum(["weekly", "monthly", "yearly", ""]).optional() }).optional(),
  notes: z.string().max(1000).optional(),
});

const buildFilter = (query) => {
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.vendor) filter.vendor = new RegExp(query.vendor, "i");
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = query.from;
    if (query.to) filter.date.$lte = query.to;
  }
  return filter;
};

export const list = [protect, requirePerm("expenses:read"), async (req, res) => {
  const expenses = await Expense.find(buildFilter(req.query)).sort({ date: -1, createdAt: -1 }).limit(500);

  const total = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const byCategory = {};
  for (const e of expenses) {
    byCategory[e.category] = round2((byCategory[e.category] || 0) + e.amount);
  }

  res.json({ expenses, total, byCategory });
}];

export const create = [protect, requirePerm("expenses:write"), validate(expenseSchema), async (req, res) => {
  const expense = await Expense.create({
    ...req.body,
    createdBy: { userId: req.user._id, name: req.user.name },
  });
  await writeAudit({ req, action: "expense.create", entity: "Expense", entityId: expense._id, meta: `₹${expense.amount} ${expense.category}` });
  res.status(201).json({ expense });
}];

export const update = [protect, requirePerm("expenses:write"), validate(expenseSchema.partial()), async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ message: "Expense not found" });

  const before = expense.toObject();
  Object.assign(expense, req.body);
  await expense.save();

  await writeAudit({ req, action: "expense.update", entity: "Expense", entityId: expense._id, before, after: expense.toObject(), fields: ["amount", "category", "date", "description"] });
  res.json({ expense });
}];

export const remove = [protect, requirePerm("expenses:write"), async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ message: "Expense not found" });

  await expense.deleteOne();
  await writeAudit({ req, action: "expense.delete", entity: "Expense", entityId: expense._id, meta: `₹${expense.amount} ${expense.category}` });
  res.json({ message: "Expense deleted" });
}];

// Category and month-wise totals for the dashboard widgets.
export const summary = [protect, requirePerm("expenses:read"), async (req, res) => {
  const filter = buildFilter(req.query);
  const expenses = await Expense.find(filter).select("date category amount");

  const byCategory = {};
  const byMonth = {};
  let total = 0;
  for (const e of expenses) {
    total += e.amount;
    byCategory[e.category] = round2((byCategory[e.category] || 0) + e.amount);
    const month = e.date.slice(0, 7);
    byMonth[month] = round2((byMonth[month] || 0) + e.amount);
  }

  res.json({ total: round2(total), byCategory, byMonth });
}];

export const exportCsv = [protect, requirePerm("expenses:read"), async (req, res) => {
  const expenses = await Expense.find(buildFilter(req.query)).sort({ date: -1 });
  sendCSV(res, "cakestyles-expenses.csv", expenses, [
    { label: "date", key: "date" },
    { label: "category", key: "category" },
    { label: "description", key: "description" },
    { label: "amount", key: "amount" },
    { label: "vendor", key: "vendor" },
    { label: "paymentMethod", key: "paymentMethod" },
    { label: "recurring", get: (e) => (e.recurring?.isRecurring ? e.recurring.frequency || "yes" : "no") },
    { label: "notes", key: "notes" },
  ]);
}];
