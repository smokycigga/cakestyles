import { z } from "zod";

import Category from "../models/Category.js";
import { optionalProtect, protect, requirePerm } from "../middleware/auth.js";
import { PERMISSIONS } from "../middleware/permissions.js";
import { validate } from "../middleware/validate.js";
import { slugify } from "../utils/misc.js";
import { writeAudit } from "../utils/audit.js";

const upsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  order: z.number().optional(),
  active: z.boolean().optional(),
  image: z.string().optional(),
});

// Public: the storefront needs the visible categories. ?all=1 additionally
// returns hidden ones, but only for a role that may edit the catalogue — the
// admin Menu screen and the product form both rely on it.
export const list = [optionalProtect, async (req, res) => {
  const canSeeHidden =
    req.query.all === "1" && req.user && PERMISSIONS["catalog:read"].includes(req.user.role);
  const filter = canSeeHidden ? {} : { active: true };
  const categories = await Category.find(filter).sort({ order: 1, name: 1 });
  res.json({ categories });
}];

export const create = [protect, requirePerm("catalog:write"), validate(upsertSchema), async (req, res) => {
  const { name, description, order, active, image } = req.body;

  let slug = slugify(name);
  if (await Category.exists({ slug })) {
    return res.status(409).json({ message: "A category with this name already exists" });
  }

  const category = await Category.create({
    name,
    slug,
    description: description || "",
    order: order ?? 0,
    active: active ?? true,
    image: image || "",
  });

  await writeAudit({ req, action: "category.create", entity: "Category", entityId: category._id });
  res.status(201).json({ category });
}];

export const update = [protect, requirePerm("catalog:write"), validate(upsertSchema.partial()), async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: "Category not found" });

  const before = category.toObject();
  Object.assign(category, req.body);
  await category.save();

  await writeAudit({
    req,
    action: "category.update",
    entity: "Category",
    entityId: category._id,
    before,
    after: category.toObject(),
    fields: ["name", "description", "order", "active", "image"],
  });

  res.json({ category });
}];

export const remove = [protect, requirePerm("catalog:write"), async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: "Category not found" });

  const Product = (await import("../models/Product.js")).default;
  const inUse = await Product.countDocuments({ category: category._id });
  if (inUse > 0) {
    return res.status(400).json({ message: `Category has ${inUse} products. Move them first or mark the category inactive.` });
  }

  await category.deleteOne();
  await writeAudit({ req, action: "category.delete", entity: "Category", entityId: category._id });
  res.json({ message: "Category deleted" });
}];

