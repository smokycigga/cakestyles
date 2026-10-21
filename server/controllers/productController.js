import { z } from "zod";

import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Order from "../models/Order.js";
import {
  PRODUCT_AVAILABILITY,
  PRODUCT_ORDERABILITY,
  PRODUCT_STATUS,
} from "../config/constants.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { slugify } from "../utils/misc.js";
import { writeAudit } from "../utils/audit.js";
import { sendCSV } from "../utils/csv.js";

const variantSchema = z.object({ name: z.string().min(1), price: z.number().min(0), b2bPrice: z.number().min(0).nullable().optional() });
const addOnSchema = z.object({ name: z.string().min(1), price: z.number().min(0) });

const productFields = {
  name: z.string().min(1),
  sku: z.string().optional(),
  category: z.string().min(1),
  shortDescription: z.string().optional(),
  description: z.string().min(1),
  images: z.array(z.string()).optional(),
  basePrice: z.number().min(0),
  variants: z.array(variantSchema).optional(),
  addOns: z.array(addOnSchema).optional(),
  availability: z.enum(PRODUCT_AVAILABILITY).optional(),
  orderability: z.enum(PRODUCT_ORDERABILITY).optional(),
  featured: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  prepTimeHours: z.number().min(0).optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
  b2bPrice: z.number().min(0).nullable().optional(),
  internalNotes: z.string().optional(),
  status: z.enum(PRODUCT_STATUS).optional(),
  publishAt: z.string().nullable().optional(),
  seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
};

const createSchema = z.object(productFields);
const updateSchema = z.object(productFields).partial();

const AUDIT_FIELDS = [
  "name", "basePrice", "category", "availability", "orderability", "featured",
  "status", "variants", "addOns", "taxRate", "costPrice", "b2bPrice",
];

export const escapeSearchRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Scheduled products auto-appear once publishAt passes.
export const publicFilter = (now = new Date()) => ({
  $or: [{ status: "published" }, { status: "scheduled", publishAt: { $lte: now } }],
});

// Hiding a category in Admin > Menu must hide the products inside it too,
// not just the category chip on the storefront.
export const publicCatalogFilter = (categoryIds, now = new Date()) => ({
  ...publicFilter(now),
  category: { $in: categoryIds },
});

const visibleCategoryIds = async () => {
  const categories = await Category.find({ active: true }).select("_id");
  return categories.map((category) => category._id);
};

const uniqueSlug = async (base) => {
  let slug = slugify(base) || "product";
  let i = 2;
  while (await Product.exists({ slug })) {
    slug = `${slugify(base)}-${i++}`;
  }
  return slug;
};

// B2B wholesale rates are internal-only. The public endpoints exclude the
// top-level field via .select(), but a variant-level b2bPrice rides along in
// the variants array — strip it so a customer can never see wholesale rates.
const toPublicProduct = (product) => {
  const obj = product.toObject();
  delete obj.b2bPrice;
  if (Array.isArray(obj.variants)) {
    obj.variants = obj.variants.map(({ b2bPrice, ...variant }) => variant);
  }
  return obj;
};

export const listPublic = async (req, res) => {
  const visibleIds = await visibleCategoryIds();
  const filter = { ...publicCatalogFilter(visibleIds) };

  if (req.query.category) {
    const cat = await Category.findOne({ slug: req.query.category, active: true });
    if (!cat) return res.json({ products: [] });
    filter.category = cat._id;
  }
  if (req.query.featured === "1") filter.featured = true;
  if (req.query.search) {
    const search = new RegExp(escapeSearchRegex(req.query.search), "i");
    filter.$and = [
      publicFilter(),
      { $or: [
        { name: search },
        { shortDescription: search },
        { tags: search },
      ] },
    ];
    delete filter.$or;
  }

  if (req.query.bestsellers === "1") {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 4, 1), 20);
    const ranked = await Order.aggregate([
      { $match: { status: { $nin: ["cancelled", "refunded", "partially_refunded"] } } },
      { $unwind: "$items" },
      { $match: { "items.product": { $ne: null } } },
      {
        $group: {
          _id: "$items.product",
          unitsSold: { $sum: "$items.quantity" },
          salesRevenue: { $sum: "$items.lineTotal" },
          orderLines: { $sum: 1 },
        },
      },
      { $sort: { unitsSold: -1, salesRevenue: -1 } },
      { $limit: limit * 3 },
    ]);

    if (ranked.length > 0) {
      const rankById = new Map(ranked.map((entry, index) => [String(entry._id), { ...entry, salesRank: index + 1 }]));
      const rankedProducts = await Product.find({ ...filter, _id: { $in: ranked.map((entry) => entry._id) } })
        .select("-costPrice -internalNotes -b2bPrice")
        .populate("category", "name slug");
      const products = rankedProducts
        .map((product) => {
          const sales = rankById.get(String(product._id));
          return {
            ...toPublicProduct(product),
            salesRank: sales.salesRank,
            unitsSold: sales.unitsSold,
            salesRevenue: sales.salesRevenue,
          };
        })
        .sort((left, right) => left.salesRank - right.salesRank)
        .slice(0, limit);
      if (products.length > 0) return res.json({ products, source: "sales" });
    }

    const products = await Product.find({ ...filter, featured: true })
      .select("-costPrice -internalNotes -b2bPrice")
      .populate("category", "name slug")
      .sort({ name: 1 })
      .limit(limit);
    return res.json({ products: products.map(toPublicProduct), source: "featured" });
  }

  const products = await Product.find(filter)
    .select("-costPrice -internalNotes -b2bPrice")
    .populate("category", "name slug")
    .sort({ featured: -1, name: 1 });

  res.json({ products: products.map(toPublicProduct) });
};

export const getPublic = async (req, res) => {
  const visibleIds = await visibleCategoryIds();
  const product = await Product.findOne({
    slug: req.params.slug,
    ...publicCatalogFilter(visibleIds),
  })
    .select("-costPrice -internalNotes -b2bPrice")
    .populate("category", "name slug");
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json({ product: toPublicProduct(product) });
};

export const listAdmin = [protect, requirePerm("catalog:read"), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.availability) filter.availability = req.query.availability;
  if (req.query.search) {
    filter.$or = [
      { name: new RegExp(req.query.search, "i") },
      { sku: new RegExp(req.query.search, "i") },
    ];
  }

  const products = await Product.find(filter)
    .populate("category", "name slug")
    .sort({ updatedAt: -1 });

  res.json({ products });
}];

export const getAdmin = [protect, requirePerm("catalog:read"), async (req, res) => {
  const product = await Product.findById(req.params.id).populate("category", "name slug");
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json({ product });
}];

export const create = [protect, requirePerm("catalog:write"), validate(createSchema), async (req, res) => {
  const body = req.body;
  if (!body.publishAt) body.publishAt = null;

  const product = await Product.create({
    ...body,
    slug: await uniqueSlug(body.name),
  });

  await writeAudit({ req, action: "product.create", entity: "Product", entityId: product._id });
  res.status(201).json({ product });
}];

export const update = [protect, requirePerm("catalog:write"), validate(updateSchema), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const before = product.toObject();
  Object.assign(product, req.body);
  await product.save();

  await writeAudit({
    req,
    action: "product.update",
    entity: "Product",
    entityId: product._id,
    before,
    after: product.toObject(),
    fields: AUDIT_FIELDS,
  });

  res.json({ product });
}];

// Archive, never hard delete: history must survive (PRD §9.3, §22.2).
export const archive = [protect, requirePerm("catalog:write"), async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });

  product.status = "archived";
  await product.save();

  await writeAudit({ req, action: "product.archive", entity: "Product", entityId: product._id });
  res.json({ product });
}];

export const duplicate = [protect, requirePerm("catalog:write"), async (req, res) => {
  const source = await Product.findById(req.params.id);
  if (!source) return res.status(404).json({ message: "Product not found" });

  const copy = source.toObject();
  delete copy._id;
  delete copy.createdAt;
  delete copy.updatedAt;
  copy.name = `${source.name} (Copy)`;
  copy.slug = await uniqueSlug(copy.name);
  copy.sku = source.sku ? `${source.sku}-C` : "";
  copy.status = "draft";
  copy.featured = false;

  const product = await Product.create(copy);
  await writeAudit({ req, action: "product.duplicate", entity: "Product", entityId: product._id, meta: `from ${source.name}` });
  res.status(201).json({ product });
}];

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["publish", "unpublish", "activate", "pause", "sold_out", "price"]),
  priceChange: z.object({ type: z.enum(["percent", "flat"]), value: z.number() }).optional(),
});

export const bulkUpdate = [protect, requirePerm("catalog:write"), validate(bulkSchema), async (req, res) => {
  const { ids, action, priceChange } = req.body;
  let modifier = {};

  switch (action) {
    case "publish": modifier = { status: "published" }; break;
    case "unpublish": modifier = { status: "draft" }; break;
    case "activate": modifier = { availability: "active" }; break;
    case "pause": modifier = { availability: "paused" }; break;
    case "sold_out": modifier = { availability: "sold_out" }; break;
    case "price": {
      if (!priceChange) return res.status(400).json({ message: "priceChange required for price action" });
      const products = await Product.find({ _id: { $in: ids } });
      for (const p of products) {
        const delta = priceChange.type === "percent"
          ? (p.basePrice * priceChange.value) / 100
          : priceChange.value;
        p.basePrice = Math.max(0, Math.round((p.basePrice + delta) * 100) / 100);
        await p.save();
      }
      await writeAudit({ req, action: "product.bulkPrice", entity: "Product", meta: `${ids.length} products, ${JSON.stringify(priceChange)}` });
      return res.json({ updated: ids.length });
    }
  }

  const result = await Product.updateMany({ _id: { $in: ids } }, modifier);
  await writeAudit({ req, action: `product.bulk.${action}`, entity: "Product", meta: `${ids.length} products` });
  res.json({ updated: result.modifiedCount });
}];

export const exportCsv = [protect, requirePerm("catalog:read"), async (req, res) => {
  const products = await Product.find().populate("category", "name").sort({ name: 1 });
  sendCSV(res, "cakestyles-products.csv", products, [
    { label: "name", key: "name" },
    { label: "sku", key: "sku" },
    { label: "category", get: (p) => p.category?.name || "" },
    { label: "basePrice", key: "basePrice" },
    { label: "shortDescription", key: "shortDescription" },
    { label: "description", key: "description" },
    { label: "availability", key: "availability" },
    { label: "orderability", key: "orderability" },
    { label: "status", key: "status" },
    { label: "featured", get: (p) => (p.featured ? "yes" : "no") },
    { label: "tags", get: (p) => p.tags.join("|") },
    { label: "variants", get: (p) => p.variants.map((v) => `${v.name}=${v.price}`).join("|") },
    { label: "addOns", get: (p) => p.addOns.map((a) => `${a.name}=${a.price}`).join("|") },
    { label: "prepTimeHours", key: "prepTimeHours" },
    { label: "taxRate", get: (p) => p.taxRate ?? "" },
    { label: "b2bPrice", get: (p) => p.b2bPrice ?? "" },
    { label: "b2bVariants", get: (p) => p.variants.filter((v) => v.b2bPrice != null).map((v) => `${v.name}=${v.b2bPrice}`).join("|") },
  ]);
}];

const importSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1),
});

// CSV import: upserts by name, creates missing categories (PRD §9.2).
export const importCsv = [protect, requirePerm("catalog:write"), validate(importSchema), async (req, res) => {
  const { rows } = req.body;
  let created = 0;
  let updated = 0;
  const errors = [];

  for (const [i, row] of rows.entries()) {
    try {
      const name = String(row.name || "").trim();
      const categoryName = String(row.category || "").trim();
      if (!name || !categoryName) throw new Error("name and category are required");

      let category = await Category.findOne({ slug: slugify(categoryName) });
      if (!category) {
        category = await Category.create({ name: categoryName, slug: slugify(categoryName) });
      }

      const doc = {
        name,
        category: category._id,
        sku: String(row.sku || ""),
        shortDescription: String(row.shortDescription || ""),
        description: String(row.description || name),
        basePrice: Number(row.basePrice) || 0,
        availability: PRODUCT_AVAILABILITY.includes(row.availability) ? row.availability : "active",
        orderability: PRODUCT_ORDERABILITY.includes(row.orderability) ? row.orderability : "online",
        status: PRODUCT_STATUS.includes(row.status) ? row.status : "draft",
        featured: String(row.featured).toLowerCase() === "yes",
        tags: String(row.tags || "").split("|").map((t) => t.trim()).filter(Boolean),
        prepTimeHours: Number(row.prepTimeHours) || 24,
        taxRate: row.taxRate === "" || row.taxRate == null ? null : Number(row.taxRate),
      };

      if (row.variants) {
        doc.variants = String(row.variants).split("|").map((v) => {
          const [vn, vp] = v.split("=");
          return { name: vn?.trim(), price: Number(vp) || 0 };
        }).filter((v) => v.name);
      }
      if (row.addOns) {
        doc.addOns = String(row.addOns).split("|").map((a) => {
          const [an, ap] = a.split("=");
          return { name: an?.trim(), price: Number(ap) || 0 };
        }).filter((a) => a.name);
      }

      const existing = await Product.findOne({ name });
      if (existing) {
        Object.assign(existing, doc);
        await existing.save();
        updated++;
      } else {
        await Product.create({ ...doc, slug: await uniqueSlug(name) });
        created++;
      }
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err.message}`);
    }
  }

  await writeAudit({ req, action: "product.import", entity: "Product", meta: `created ${created}, updated ${updated}` });
  res.json({ created, updated, errors });
}];

