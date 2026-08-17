import mongoose from "mongoose";
import { z } from "zod";

import Campaign, {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  RECIPIENT_STATUSES,
} from "../models/Campaign.js";
import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import Invoice from "../models/Invoice.js";
import { computeCustomerSegments } from "./crmController.js";
import { protect, requirePerm } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { sendCSV } from "../utils/csv.js";

const objectIdSchema = z.string().refine((value) => mongoose.isValidObjectId(value), "Invalid customer ID");
const audienceSchema = z.object({
  tags: z.array(z.string().min(1)).optional(),
  leadSources: z.array(z.string().min(1)).optional(),
  marketingConsentOnly: z.boolean().optional(),
  segment: z.string().optional(),
  customerIds: z.array(objectIdSchema).optional(),
});
const campaignFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  content: z.string().max(10000).optional(),
  channel: z.enum(CAMPAIGN_CHANNELS).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  audience: audienceSchema.optional(),
});
const createSchema = campaignFieldsSchema.extend({ name: z.string().trim().min(1).max(200) });
const recipientUpdateSchema = z.object({
  status: z.enum(RECIPIENT_STATUSES),
  notes: z.string().max(2000).optional(),
  contactedAt: z.coerce.date().nullable().optional(),
});

const values = (items) => (items || []).map((item) => String(item));

export const matchesAudience = (customer, audience = {}) => {
  if (customer.active === false) return false;

  const customerId = String(customer._id || customer.id || "");
  const customerTags = values(customer.tags);
  const selectedIds = values(audience.customerIds);

  if (selectedIds.length && !selectedIds.includes(customerId)) return false;
  if (audience.tags?.length && !audience.tags.some((tag) => customerTags.includes(tag))) return false;
  if (audience.leadSources?.length && !audience.leadSources.includes(customer.leadSource)) return false;
  if (audience.marketingConsentOnly && customer.marketingConsent !== true) return false;

  const segment = audience.segment?.trim();
  if (segment && segment !== "all" && customer.segment !== segment && !customerTags.includes(segment)) return false;

  return true;
};

export const summarizeRecipientStatuses = (recipients = []) => {
  const summary = { total: recipients.length, pending: 0, contacted: 0, converted: 0, skipped: 0 };
  for (const recipient of recipients) {
    if (RECIPIENT_STATUSES.includes(recipient.status)) summary[recipient.status] += 1;
  }
  return summary;
};

const withSummary = (campaign) => {
  const value = typeof campaign.toObject === "function" ? campaign.toObject() : campaign;
  return { ...value, recipientSummary: summarizeRecipientStatuses(value.recipients) };
};

const customerQueryFor = (audience) => {
  const filter = { active: true };
  if (audience.customerIds?.length) filter._id = { $in: audience.customerIds };
  if (audience.tags?.length) filter.tags = { $in: audience.tags };
  if (audience.leadSources?.length) filter.leadSource = { $in: audience.leadSources };
  if (audience.marketingConsentOnly) filter.marketingConsent = true;
  return filter;
};

export const list = [protect, requirePerm("analytics:read"), async (req, res) => {
  const filter = {};
  if (CAMPAIGN_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  const campaigns = await Campaign.find(filter).sort({ updatedAt: -1 }).limit(300).lean();
  res.json({ campaigns: campaigns.map(withSummary) });
}];

export const getOne = [protect, requirePerm("analytics:read"), async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  res.json({ campaign: withSummary(campaign) });
}];

export const create = [protect, requirePerm("customers:write"), validate(createSchema), async (req, res) => {
  const campaign = await Campaign.create({
    ...req.body,
    createdBy: { userId: req.user._id, name: req.user.name },
  });
  res.status(201).json({ campaign: withSummary(campaign) });
}];

export const update = [protect, requirePerm("customers:write"), validate(campaignFieldsSchema), async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });

  Object.assign(campaign, req.body);
  await campaign.save();
  res.json({ campaign: withSummary(campaign) });
}];

export const buildRecipients = [protect, requirePerm("customers:write"), async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  if (campaign.status === "archived") {
    return res.status(400).json({ message: "Archived campaigns cannot rebuild recipients" });
  }

  const audience = campaign.audience?.toObject ? campaign.audience.toObject() : campaign.audience;
  const candidates = await Customer.find(customerQueryFor(audience)).lean();
  const segmentName = audience.segment?.trim();
  let segmentIds = null;

  if (segmentName && segmentName !== "all") {
    const candidateIds = candidates.map((customer) => customer._id);
    const [orders, invoices] = await Promise.all([
      Order.find({ customer: { $in: candidateIds } }).select("customer status grandTotal createdAt").lean(),
      Invoice.find({ customer: { $in: candidateIds } }).select("customer status balanceDue").lean(),
    ]);
    const segments = computeCustomerSegments(candidates, orders, invoices);
    if (!Object.hasOwn(segments, segmentName)) {
      return res.status(400).json({ message: "Unknown customer segment" });
    }
    segmentIds = new Set(segments[segmentName].map((customer) => String(customer._id)));
  }

  const audienceWithoutSegment = { ...audience, segment: "" };
  const customers = candidates.filter((customer) =>
    matchesAudience(customer, audienceWithoutSegment)
    && (!segmentIds || segmentIds.has(String(customer._id)))
  );
  campaign.recipients = customers.map((customer) => ({
    customer: customer._id,
    name: customer.name,
    phone: customer.phone || "",
    email: customer.email || "",
    status: "pending",
    notes: "",
    contactedAt: null,
  }));
  if (campaign.status === "draft" && campaign.recipients.length) campaign.status = "ready";
  await campaign.save();
  res.json({ campaign: withSummary(campaign) });
}];

export const updateRecipient = [protect, requirePerm("customers:write"), validate(recipientUpdateSchema), async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });

  const recipient = campaign.recipients.id(req.params.recipientId);
  if (!recipient) return res.status(404).json({ message: "Campaign recipient not found" });

  recipient.status = req.body.status;
  if (req.body.notes !== undefined) recipient.notes = req.body.notes;
  if (req.body.contactedAt !== undefined) {
    recipient.contactedAt = req.body.contactedAt;
  } else if (["contacted", "converted"].includes(req.body.status) && !recipient.contactedAt) {
    recipient.contactedAt = new Date();
  }
  if (["contacted", "converted"].includes(req.body.status) && ["draft", "ready"].includes(campaign.status)) {
    campaign.status = "in_progress";
  }

  await campaign.save();
  res.json({ campaign: withSummary(campaign), recipient });
}];

export const exportRecipientsCsv = [protect, requirePerm("analytics:read"), async (req, res) => {
  const campaign = await Campaign.findById(req.params.id).lean();
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });

  const safeName = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "campaign";
  sendCSV(res, `${safeName}-recipients.csv`, campaign.recipients, [
    { label: "customerId", get: (recipient) => String(recipient.customer) },
    { label: "name", key: "name" },
    { label: "phone", key: "phone" },
    { label: "email", key: "email" },
    { label: "status", key: "status" },
    { label: "notes", key: "notes" },
    { label: "contactedAt", get: (recipient) => recipient.contactedAt?.toISOString() || "" },
  ]);
}];
