// Central enum definitions shared across models, API validation and the client.

export const ROLES = ["owner", "manager", "staff", "accounts"];

export const PRODUCT_AVAILABILITY = ["active", "paused", "sold_out"];
export const PRODUCT_ORDERABILITY = ["online", "browse_only"];
export const PRODUCT_STATUS = ["draft", "published", "scheduled", "archived"];

export const ORDER_SOURCES = [
  "website",
  "instagram",
  "whatsapp",
  "phone",
  "walk_in",
  "repeat",
  "other",
];

export const ORDER_STATUSES = [
  "pending_payment",
  "confirmed",
  "in_preparation",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded",
];

export const PAYMENT_METHODS = [
  "razorpay",
  "upi",
  "cash",
  "bank_transfer",
  "card",
  "other",
];

export const PAYMENT_STATUS = ["pending", "partial", "paid", "failed", "refunded", "partially_refunded"];

export const ENQUIRY_STATUSES = [
  "new",
  "contacted",
  "quote_sent",
  "awaiting_confirmation",
  "confirmed",
  "completed",
  "lost",
];

export const INVOICE_STATUSES = ["draft", "issued", "partially_paid", "paid", "overdue", "cancelled"];

export const EXPENSE_CATEGORIES = [
  "ingredients",
  "packaging",
  "rent",
  "utilities",
  "salaries",
  "delivery",
  "marketing",
  "equipment",
  "repairs",
  "software",
  "other",
];

export const TIMEZONE = "Asia/Kolkata";
export const CURRENCY = "INR";
