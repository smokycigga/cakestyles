// Authorization sweep over every route mounted in app.js.
//
// The route list is discovered by introspection rather than written out by
// hand, and each route's permission requirement is read off the real
// middleware chain — so a route added tomorrow is swept tomorrow, with no test
// to remember to update. This exists because GET /api/reports/customers.csv
// shipped as a bare controller function with no guard at all, and handed the
// shop's entire customer list to anyone who requested the URL.
//
// helpers/integration.js must be imported before ../app.js — see the safety
// note in that file.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import request from "supertest";

import { missingId, signIn, useMemoryDatabase } from "./helpers/integration.js";
import { makeCustomer } from "./helpers/factories.js";
import app from "../app.js";
import { ROLES } from "../config/constants.js";

useMemoryDatabase();

// A route count is recorded so that mounting a new one trips a test and gets a
// human to look at whether it should be public.
const MOUNTED_ROUTE_COUNT = 99;

// Deliberately reachable without a token: the storefront and the login form.
const PUBLIC_ROUTES = [
  "GET /api/categories",
  "GET /api/media/:id",
  "GET /api/orders/track/:orderNumber",
  "GET /api/products",
  "GET /api/products/slug/:slug",
  "GET /api/settings/public",
  "POST /api/auth/login",
  "POST /api/enquiries",
  "POST /api/orders",
  "POST /api/payment/create-order",
  "POST /api/payment/verify",
];

// Guarded, but granted to all four roles — so 403 cannot happen on them. Every
// entry is a read, apart from changing your own password.
const EVERY_ROLE_ROUTES = [
  "GET /api/activities/customer/:customerId",
  "GET /api/auth/me",
  "GET /api/crm/important-dates",
  "GET /api/crm/overview",
  "GET /api/crm/segments",
  "GET /api/customers",
  "GET /api/customers/:id",
  "GET /api/customers/export.csv",
  "GET /api/loyalty/:customerId",
  "GET /api/loyalty/:customerId/history",
  "GET /api/orders",
  "GET /api/orders/:id",
  "GET /api/reports/customers.csv",
  "GET /api/settings",
  "GET /api/tasks",
  "GET /api/tasks/queue/:queue",
  "GET /api/users/assignable",
  "PUT /api/auth/password",
];

// ---------------------------------------------------------------------------
// Discovery: read the mount table out of app.js, then the routes out of each
// router. Parsing app.js rather than hardcoding the prefixes means a router
// mounted later is swept without anyone editing this file.
// ---------------------------------------------------------------------------

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

const routerModules = new Map(
  [...appSource.matchAll(/^import\s+(\w+)\s+from\s+"\.\/routes\/([^"]+)";/gm)]
    .map((m) => [m[1], m[2]])
);

const mounts = [...appSource.matchAll(/app\.use\(\s*"(\/api\/[^"]*)"\s*,\s*(\w+)\s*\)/g)]
  .map((m) => ({ prefix: m[1], local: m[2] }));

const discoverRoutes = async () => {
  const routes = [];
  for (const { prefix, local } of mounts) {
    const file = routerModules.get(local);
    if (!file) throw new Error(`app.js mounts ${local} at ${prefix} but does not import it from ./routes`);
    const router = (await import(/* @vite-ignore */ `../routes/${file}`)).default;
    const mounted = router.stack.filter((layer) => layer.route);
    if (mounted.length === 0) throw new Error(`${file} is mounted at ${prefix} but declares no routes`);

    for (const layer of mounted) {
      const path = layer.route.path === "/" ? prefix : `${prefix}${layer.route.path}`;
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({
          method: method.toUpperCase(),
          path,
          label: `${method.toUpperCase()} ${path}`,
          // The controller's middleware array, in order.
          handlers: layer.route.stack.map((entry) => entry.handle),
        });
      }
    }
  }
  return routes;
};

const ROUTES = await discoverRoutes();

// ---------------------------------------------------------------------------
// Offline probe: run each guard on its own with a stub request and see what it
// answers. protect with no Authorization header answers 401 for everyone;
// validate with no body answers 400 for everyone; only requirePerm answers 403,
// and only for the roles its permission excludes. So the guards describe their
// own requirements and no permission table has to be maintained here.
// ---------------------------------------------------------------------------

const probeGuard = (guard, role) =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (status) => {
      if (!settled) {
        settled = true;
        resolve(status);
      }
    };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json() {
        finish(this.statusCode);
        return this;
      },
      send() {
        finish(this.statusCode);
        return this;
      },
      setHeader() {
        return this;
      },
    };
    const req = { headers: {}, query: {}, params: {}, user: { _id: missingId(), name: "probe", role } };
    // next() means the guard let this role through.
    const returned = guard(req, res, () => finish(null));
    if (returned && typeof returned.then === "function") returned.then(() => finish(null), () => finish(null));
  });

// Everything but the final handler; the handler itself is never run offline.
const guardsOf = (route) => route.handlers.slice(0, -1);

const rolesRefusedBy = async (route) => {
  const refused = [];
  for (const role of ROLES) {
    for (const guard of guardsOf(route)) {
      if ((await probeGuard(guard, role)) === 403) {
        refused.push(role);
        break;
      }
    }
  }
  return refused;
};

const requiresAuth = async (route) => {
  for (const guard of guardsOf(route)) {
    if ((await probeGuard(guard, "owner")) === 401) return true;
  }
  return false;
};

const AUTHZ = await Promise.all(
  ROUTES.map(async (route) => ({
    ...route,
    guarded: await requiresAuth(route),
    refused: await rolesRefusedBy(route),
  }))
);

// A well-formed ObjectId for :param segments. A random word would raise a
// CastError inside the handler and answer 500, which would say nothing about
// the guards this file is testing.
const SAMPLE_ID = "651111111111111111111111";

const urlFor = (route) => route.path.replace(/:[A-Za-z0-9_]+/g, SAMPLE_ID);

const call = (route, token) => {
  const method = route.method.toLowerCase();
  let pending = request(app)[method](urlFor(route));
  if (token) pending = pending.set("Authorization", token);
  return method === "get" ? pending : pending.send({});
};

const tokensForEveryRole = async () => {
  const tokens = {};
  for (const role of ROLES) tokens[role] = (await signIn(role)).auth;
  return tokens;
};

describe("route authorization sweep", () => {
  it("discovers every mounted route, so a newly added one has to be looked at", () => {
    // Not a style rule: if this count moves, a route was added or removed, and
    // the public list below is the thing to re-check.
    expect(ROUTES).toHaveLength(MOUNTED_ROUTE_COUNT);
    expect(mounts.length).toBeGreaterThan(0);
  });

  it("answers 401 on every guarded route when no token is presented", async () => {
    const wrong = [];
    for (const route of AUTHZ.filter((r) => r.guarded)) {
      const res = await call(route);
      if (res.status !== 401) wrong.push(`${route.label} -> ${res.status}`);
    }
    expect(wrong).toEqual([]);
    expect(AUTHZ.filter((r) => r.guarded)).toHaveLength(ROUTES.length - PUBLIC_ROUTES.length);
  }, 120000);

  it("leaves exactly the storefront and login routes open", async () => {
    const open = AUTHZ.filter((r) => !r.guarded).map((r) => r.label).sort();
    expect(open).toEqual([...PUBLIC_ROUTES].sort());

    // And they really are reachable — a guard added by accident would 401 here.
    for (const route of AUTHZ.filter((r) => !r.guarded)) {
      const res = await call(route);
      expect(res.status, route.label).not.toBe(401);
    }
  }, 120000);

  it("answers 403 on every route for each role its permission excludes", async () => {
    const tokens = await tokensForEveryRole();
    const wrong = [];
    for (const route of AUTHZ) {
      for (const role of route.refused) {
        const res = await call(route, tokens[role]);
        if (res.status !== 403) wrong.push(`${route.label} as ${role} -> ${res.status}`);
      }
    }
    expect(wrong).toEqual([]);
  }, 120000);

  it("lets a permitted role past the guards on every route", async () => {
    const tokens = await tokensForEveryRole();
    const blocked = [];
    const failed = [];
    for (const route of AUTHZ) {
      const permitted = ROLES.find((role) => !route.refused.includes(role));
      const res = await call(route, tokens[permitted]);
      if (res.status === 401 || res.status === 403) blocked.push(`${route.label} as ${permitted} -> ${res.status}`);
      // An empty body is allowed to be rejected, but never with a server fault.
      if (res.status >= 500) failed.push(`${route.label} as ${permitted} -> ${res.status}`);
    }
    expect(blocked).toEqual([]);
    expect(failed).toEqual([]);
  }, 120000);
});

describe("routes where no role is excluded", () => {
  it("grants these to every role deliberately, so 403 is unreachable on them", () => {
    // orders:read, customers:read and settings:read are held by all four roles,
    // and /auth/me + /auth/password only need a session. Anything new appearing
    // in this list is a permission that was left off a route.
    const openToAllRoles = AUTHZ.filter((r) => r.guarded && r.refused.length === 0)
      .map((r) => r.label)
      .sort();
    expect(openToAllRoles).toEqual(EVERY_ROLE_ROUTES);
  });

  it("never grants a route that writes to every role", async () => {
    // The invariant behind the list above: reads can be shared, mutations
    // cannot. PUT /api/auth/password is the one exception — it changes only the
    // caller's own password.
    const writesOpenToAllRoles = AUTHZ.filter(
      (r) => r.guarded && r.refused.length === 0 && r.method !== "GET" && r.path !== "/api/auth/password"
    ).map((r) => r.label);
    expect(writesOpenToAllRoles).toEqual([]);
  });
});

describe("GET /api/reports/customers.csv", () => {
  it("refuses an unauthenticated request instead of exporting the customer list", async () => {
    // Named regression: this shipped as a bare controller function with no
    // guard, so the shop's whole customer list — names, phones, emails — was
    // one URL away for anyone who asked.
    const customer = await makeCustomer({ name: "Leaky Larry" });
    const res = await request(app).get("/api/reports/customers.csv");
    expect(res.status).toBe(401);
    expect(res.text || "").not.toContain(customer.phone);
    expect(res.text || "").not.toContain("Leaky Larry");
  });

  it("is mounted as a guarded middleware array rather than a bare handler", () => {
    // The shape is the fix: a plain exported function has no protect in front
    // of it, and reads as authenticated code while being wide open.
    const route = ROUTES.find((r) => r.label === "GET /api/reports/customers.csv");
    expect(route).toBeTruthy();
    expect(route.handlers.length).toBeGreaterThan(1);
  });

  it("still exports for a role holding customers:read", async () => {
    const customer = await makeCustomer({ name: "Invited Ivy" });
    const accounts = await signIn("accounts");
    const res = await request(app)
      .get("/api/reports/customers.csv")
      .set("Authorization", accounts.auth);
    expect(res.status).toBe(200);
    expect(res.text).toContain(customer.phone);
  });
});
