// Role → permission matrix, enforced server-side (PRD §6, §20).
// Owner: everything. Manager: catalog, orders, customers, invoices, analytics.
// Staff: order processing and customer lookup, no financials.
// Accounts: invoices, payments, expenses, exports and reports.

export const PERMISSIONS = {
  "catalog:read": ["owner", "manager"],
  "catalog:write": ["owner", "manager"],
  "orders:read": ["owner", "manager", "staff", "accounts"],
  "orders:write": ["owner", "manager", "staff"],
  "customers:read": ["owner", "manager", "staff", "accounts"],
  "customers:write": ["owner", "manager"],
  "enquiries:read": ["owner", "manager", "staff"],
  "enquiries:write": ["owner", "manager", "staff"],
  "finance:read": ["owner", "manager", "accounts"],
  "finance:write": ["owner", "accounts"],
  "expenses:read": ["owner", "accounts", "manager"],
  "expenses:write": ["owner", "accounts"],
  "analytics:read": ["owner", "manager", "accounts"],
  "settings:read": ["owner", "manager", "staff", "accounts"],
  "settings:write": ["owner"],
  "users:manage": ["owner"],
  "audit:read": ["owner"],
};

