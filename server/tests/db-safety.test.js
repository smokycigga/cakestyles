// Proves the two safety measures in tests/helpers/integration.js actually
// hold. The repository's .env points at the live production Atlas cluster, so
// if this file fails, no other integration test in the suite is safe to run.
//
// The harness must be imported before app.js — that ordering is the whole
// first measure, and this file exercises it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import request from "supertest";

import {
  isLoopbackUri,
  redactUri,
  useMemoryDatabase,
} from "./helpers/integration.js";
import app from "../app.js";

useMemoryDatabase();

// Read straight from disk rather than process.env — the point is to compare
// what the deployed app would use against what the tests actually use.
const envFileValue = (key) => {
  let text = "";
  try {
    text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return null;
  }
  const match = text.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, "m"));
  if (!match) return null;
  return match[1].trim().replace(/^['"]|['"]$/g, "");
};

describe("integration test database safety", () => {
  it("has a production URI in .env that is not a loopback address", () => {
    const productionUri = envFileValue("MONGO_URI");
    // If this ever fails, the assertions below stop meaning anything: they
    // would be proving that a local URI is local.
    expect(productionUri).toBeTruthy();
    expect(isLoopbackUri(productionUri)).toBe(false);
  });

  it("keeps the production URI out of process.env even though app.js loads dotenv", () => {
    const productionUri = envFileValue("MONGO_URI");
    // dotenv never overwrites a key that is already set, and the harness sets
    // MONGO_URI at import time — so importing app.js cannot introduce it.
    expect(process.env.MONGO_URI).not.toBe(productionUri);
    expect(isLoopbackUri(process.env.MONGO_URI)).toBe(true);
  });

  it("keeps the production JWT secret out of process.env, so test tokens are worthless against the live API", () => {
    const productionSecret = envFileValue("JWT_SECRET");
    expect(productionSecret).toBeTruthy();
    expect(process.env.JWT_SECRET).not.toBe(productionSecret);
  });

  it("refuses to open a connection to the URI in .env", () => {
    const productionUri = envFileValue("MONGO_URI");
    // Throws before a socket is opened. Second measure: this covers a
    // mis-ordered import or a connect() added to the harness later.
    expect(() => mongoose.connect(productionUri)).toThrow(/non-loopback/);
  });

  it("refuses any non-loopback host, including one that merely starts like loopback", () => {
    expect(() => mongoose.connect("mongodb://127.0.0.1.evil.example/cakestyles")).toThrow(/non-loopback/);
    expect(() => mongoose.connect("mongodb+srv://cluster.example/cakestyles")).toThrow(/non-loopback/);
    expect(() => mongoose.connect("mongodb://db.internal:27017/cakestyles")).toThrow(/non-loopback/);
  });

  it("redacts credentials from the refusal message", () => {
    expect(redactUri("mongodb+srv://appuser:s3cret@cluster.example/db")).toBe(
      "mongodb+srv://***@cluster.example/db"
    );
  });

  it("is connected to a loopback host before any request is served", () => {
    expect(mongoose.connection.readyState).toBe(1);
    expect(["127.0.0.1", "localhost", "::1"]).toContain(mongoose.connection.host);
  });

  it("serves a database-backed request without app.js's warmup middleware ever reconnecting", async () => {
    // readyState 1 is what makes the warmup middleware a no-op. A request that
    // reads a collection proves the live connection is the in-memory one.
    expect(mongoose.connection.readyState).toBe(1);
    const res = await request(app).get("/api/settings/public");
    expect(res.status).toBe(200);
    expect(mongoose.connection.readyState).toBe(1);
    expect(mongoose.connection.client.options.hosts.map((h) => h.host)).toEqual(
      expect.arrayContaining(["127.0.0.1"])
    );
  });
});
