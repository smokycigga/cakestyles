import { z } from "zod";

import Task from "../models/Task.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const TASK_TYPES = ["follow_up", "call", "meeting", "order", "customer", "general"];
const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];
const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled"];
const MUTABLE_TASK_STATUSES = ["pending", "in_progress", "cancelled"];
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "must be a valid id");
const optionalRef = objectId.nullable().optional();

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(3000).optional(),
  type: z.enum(TASK_TYPES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(MUTABLE_TASK_STATUSES).optional(),
  dueAt: z.coerce.date(),
  assignedTo: objectId,
  customer: optionalRef,
  enquiry: optionalRef,
  order: optionalRef,
});

const updateSchema = createSchema.partial();

export const taskQueueWindow = (queue, now = new Date()) => {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  if (queue === "overdue") return { $lt: start };
  if (queue === "today") return { $gte: start, $lt: end };
  if (queue === "upcoming") return { $gte: end };
  return null;
};

export const buildTaskFilter = (query = {}, now = new Date()) => {
  const filter = {};
  for (const field of ["status", "priority", "type", "assignedTo", "customer", "enquiry", "order"]) {
    if (query[field]) filter[field] = query[field];
  }

  const dueAt = taskQueueWindow(query.queue, now);
  if (dueAt) {
    filter.dueAt = dueAt;
    if (!filter.status) filter.status = { $nin: ["completed", "cancelled"] };
  }
  return filter;
};

const populateTask = (query) => query
  .populate("assignedTo", "name email role")
  .populate("customer", "name phone email tags")
  .populate("enquiry", "customerSnapshot eventDate status")
  .populate("order", "orderNumber status grandTotal")
  .populate("createdBy", "name")
  .populate("completedBy", "name");

export const list = [protect, requirePerm("customers:read"), async (req, res) => {
  const query = { ...req.query, queue: req.params.queue || req.query.queue };
  if (query.queue && !["overdue", "today", "upcoming"].includes(query.queue)) {
    return res.status(400).json({ message: "Unknown task queue" });
  }
  if (query.status && !TASK_STATUSES.includes(query.status)) {
    return res.status(400).json({ message: "Unknown task status" });
  }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 200, 1), 500);
  const tasks = await populateTask(Task.find(buildTaskFilter(query)))
    .sort({ dueAt: 1, priority: -1, createdAt: -1 })
    .limit(limit);
  res.json({ tasks });
}];

export const create = [protect, requirePerm("customers:write"), validate(createSchema), async (req, res) => {
  const task = await Task.create({ ...req.body, createdBy: req.user._id });
  await task.populate([
    { path: "assignedTo", select: "name email role" },
    { path: "customer", select: "name phone email tags" },
    { path: "createdBy", select: "name" },
  ]);
  res.status(201).json({ task });
}];

export const update = [protect, requirePerm("customers:write"), validate(updateSchema), async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: "Task not found" });
  if (task.status === "completed") {
    return res.status(400).json({ message: "Completed tasks cannot be edited" });
  }

  Object.assign(task, req.body);
  await task.save();
  await task.populate([{
    path: "assignedTo", select: "name email role",
  }, { path: "customer", select: "name phone email tags" }]);
  res.json({ task });
}];

export const complete = [protect, requirePerm("customers:write"), async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: "Task not found" });
  if (task.status === "cancelled") {
    return res.status(400).json({ message: "Cancelled tasks cannot be completed" });
  }

  if (task.status !== "completed") {
    task.status = "completed";
    task.completedBy = req.user._id;
    task.completedAt = new Date();
    await task.save();
  }
  await task.populate([{
    path: "assignedTo", select: "name email role",
  }, { path: "completedBy", select: "name" }]);
  res.json({ task });
}];

