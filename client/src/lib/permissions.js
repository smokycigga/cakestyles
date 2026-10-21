// Mirrors server/middleware/permissions.js. The server is the enforcer; this
// copy exists so the admin UI can hide affordances a role cannot use.
//
// It lives in its own module, and is checked against the server matrix by
// server/tests/permission-parity.test.js, because the inline copy it replaced
// had drifted: every ":read" permission except analytics:read was missing, and
// can() returns false for anything it does not know. That silently hid the
// outstanding-invoices and expense reports from the owner.
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

export const hasPermission = (role, perm) => (PERMISSIONS[perm] || []).includes(role);
