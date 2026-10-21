// Shared display metadata for enums that come from the API.

export const ORDER_STATUS_META = {
  pending_payment: { label: "Pending Payment", color: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-800" },
  in_preparation: { label: "In Preparation", color: "bg-indigo-100 text-indigo-800" },
  ready: { label: "Ready", color: "bg-teal-100 text-teal-800" },
  out_for_delivery: { label: "Out for Delivery", color: "bg-cyan-100 text-cyan-800" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", color: "bg-gray-200 text-gray-700" },
  refunded: { label: "Refunded", color: "bg-rose-100 text-rose-800" },
  partially_refunded: { label: "Partially Refunded", color: "bg-rose-50 text-rose-700" },
};

export const PAYMENT_STATUS_META = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800" },
  partial: { label: "Partial", color: "bg-orange-100 text-orange-800" },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", color: "bg-rose-100 text-rose-800" },
  refunded: { label: "Refunded", color: "bg-gray-200 text-gray-700" },
  partially_refunded: { label: "Partially Refunded", color: "bg-gray-100 text-gray-600" },
};

export const INVOICE_STATUS_META = {
  draft: { label: "Draft", color: "bg-gray-200 text-gray-700" },
  issued: { label: "Issued", color: "bg-blue-100 text-blue-800" },
  partially_paid: { label: "Partially Paid", color: "bg-orange-100 text-orange-800" },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800" },
  overdue: { label: "Overdue", color: "bg-rose-100 text-rose-800" },
  cancelled: { label: "Cancelled", color: "bg-gray-200 text-gray-600" },
};

export const ENQUIRY_STATUS_META = {
  new: { label: "New", color: "bg-sky-100 text-sky-800" },
  contacted: { label: "Contacted", color: "bg-indigo-100 text-indigo-800" },
  quote_sent: { label: "Quote Sent", color: "bg-violet-100 text-violet-800" },
  awaiting_confirmation: { label: "Awaiting Confirmation", color: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmed", color: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completed", color: "bg-teal-100 text-teal-800" },
  lost: { label: "Lost", color: "bg-gray-200 text-gray-600" },
};

export const SOURCE_LABELS = {
  website: "Website",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  phone: "Phone",
  walk_in: "Walk-in",
  repeat: "Repeat Customer",
  bni: "BNI",
  jbn: "JBN",
  other: "Other",
};

export const EXPENSE_CATEGORIES = [
  "ingredients", "packaging", "rent", "utilities", "salaries",
  "delivery", "marketing", "equipment", "repairs", "software", "other",
];

export const PAYMENT_METHOD_LABELS = {
  razorpay: "Razorpay (Online)",
  upi: "UPI",
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  other: "Other",
};

export const ROLE_LABELS = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
  accounts: "Accounts",
};
