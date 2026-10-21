import { describe, it, expect } from "vitest";
import { PERMISSIONS as SERVER } from "../middleware/permissions.js";
import { PERMISSIONS as CLIENT, hasPermission } from "../../client/src/lib/permissions.js";

// The admin UI keeps its own copy of the matrix to decide what to render. When
// the two drift, the server's answer wins and the UI is simply wrong: a
// permission missing from the client copy makes can() return false, which hid
// the outstanding-invoices and expense reports from the owner.
describe("client/server permission matrix parity", () => {
  it("declares exactly the same permissions on both sides", () => {
    expect(Object.keys(CLIENT).sort()).toEqual(Object.keys(SERVER).sort());
  });

  it("grants each permission to the same roles on both sides", () => {
    for (const [perm, roles] of Object.entries(SERVER)) {
      expect([...(CLIENT[perm] || [])].sort(), `roles for ${perm}`).toEqual([...roles].sort());
    }
  });

  it("answers an unknown permission with a refusal rather than a crash", () => {
    expect(hasPermission("owner", "not:a:permission")).toBe(false);
    expect(hasPermission(undefined, "finance:read")).toBe(false);
  });

  it("lets the roles that can read money see the reports built on it", () => {
    // The Reports page gates its cards on these exact permissions.
    for (const perm of ["analytics:read", "customers:read", "finance:read", "expenses:read"]) {
      expect(hasPermission("owner", perm), `owner needs ${perm}`).toBe(true);
    }
    expect(hasPermission("staff", "finance:read")).toBe(false);
    expect(hasPermission("staff", "expenses:read")).toBe(false);
  });
});
