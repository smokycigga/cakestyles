import { describe, it, expect } from "vitest";
import { PERMISSIONS } from "../middleware/permissions.js";

const can = (role, perm) => (PERMISSIONS[perm] || []).includes(role);

describe("role permission matrix (PRD §6, §20)", () => {
  it("owner can do everything", () => {
    for (const perm of Object.keys(PERMISSIONS)) {
      expect(can("owner", perm)).toBe(true);
    }
  });

  it("staff can process orders and look up customers but not touch finances", () => {
    expect(can("staff", "orders:read")).toBe(true);
    expect(can("staff", "orders:write")).toBe(true);
    expect(can("staff", "customers:read")).toBe(true);
    expect(can("staff", "customers:write")).toBe(false);
    expect(can("staff", "finance:write")).toBe(false);
    expect(can("staff", "expenses:write")).toBe(false);
    expect(can("staff", "settings:write")).toBe(false);
    expect(can("staff", "users:manage")).toBe(false);
  });

  it("manager runs catalog and invoices but not settings/users/audit", () => {
    expect(can("manager", "catalog:write")).toBe(true);
    expect(can("manager", "finance:read")).toBe(true);
    expect(can("manager", "settings:write")).toBe(false);
    expect(can("manager", "users:manage")).toBe(false);
    expect(can("manager", "audit:read")).toBe(false);
  });

  it("accounts handles money and reports but cannot edit the menu", () => {
    expect(can("accounts", "finance:write")).toBe(true);
    expect(can("accounts", "expenses:write")).toBe(true);
    expect(can("accounts", "analytics:read")).toBe(true);
    expect(can("accounts", "catalog:write")).toBe(false);
    expect(can("accounts", "orders:write")).toBe(false);
  });

  it("every permission declares at least one role", () => {
    for (const [perm, roles] of Object.entries(PERMISSIONS)) {
      expect(roles.length, `${perm} must have roles`).toBeGreaterThan(0);
    }
  });
});
