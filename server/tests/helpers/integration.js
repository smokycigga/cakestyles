// Shared harness for the HTTP + database integration tests. Importing this
// module is what makes a test file safe to run against a real mongoose
// connection — see the safety note below.
import { afterAll, afterEach, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Setting from "../../models/Setting.js";
import User from "../../models/User.js";
import { addDaysIst, istDateString } from "../../utils/dates.js";

// ---------------------------------------------------------------------------
// SAFETY
//
// The repository's .env holds a live production Atlas URI. app.js imports
// dotenv, and its warmup middleware calls connectDB() on any request that
// arrives while mongoose is idle — so a careless integration test could write
// to the real shop's database. Two independent measures prevent that:
//
//   1. MONGO_URI is overwritten here, at import time. dotenv never overrides a
//      variable that is already set, so the production URI never so much as
//      reaches process.env.
//   2. mongoose.connect is wrapped to reject any host but loopback, before a
//      socket is opened. That covers a mis-ordered import, the warmup
//      middleware, and any connect() added here later.
//
// tests/db-safety.test.js asserts both measures actually hold.
// ---------------------------------------------------------------------------

const LOOPBACK_URI = /^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(?=[/,?]|$)/;

process.env.MONGO_URI = "mongodb://127.0.0.1:1/cakestyles-test-placeholder";
// Never the production secret: a token minted in a test must be worthless
// against the deployed API.
process.env.JWT_SECRET = "integration-tests-only-secret";

export const redactUri = (uri) => String(uri).replace(/\/\/[^@/]*@/, "//***@");

export const isLoopbackUri = (uri) => LOOPBACK_URI.test(String(uri));

if (!mongoose.connect.loopbackOnly) {
  const openConnection = mongoose.connect.bind(mongoose);
  const loopbackOnlyConnect = (uri, ...rest) => {
    if (!isLoopbackUri(uri)) {
      throw new Error(`Refusing to connect to a non-loopback database from tests: ${redactUri(uri)}`);
    }
    return openConnection(uri, ...rest);
  };
  loopbackOnlyConnect.loopbackOnly = true;
  mongoose.connect = loopbackOnlyConnect;
}

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

let replSet = null;

// Unique indexes are built asynchronously, and model.init() is what resolves
// once they exist. The Counter and orderNumber concurrency tests assert on
// duplicate-key behaviour, which is silently untestable without them.
export const ensureIndexes = () =>
  Promise.all(Object.values(mongoose.models).map((model) => model.init()));

export const resetDatabase = async () => {
  if (mongoose.connection.readyState !== 1) return;
  const collections = await mongoose.connection.db.collections();
  // deleteMany rather than dropDatabase: dropping the database takes the
  // unique indexes with it, and later tests in the file would then pass for
  // the wrong reason.
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

// Boots an in-memory database for the calling file and registers cleanup.
// A one-member replica set rather than a standalone: the loyalty paths use
// mongoose.startSession() + withTransaction, which Mongo only permits on a
// replica set. It also matches the deployed Atlas topology.
export const useMemoryDatabase = () => {
  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    const uri = replSet.getUri("cakestyles-test");
    // app.js's warmup middleware calls connectDB() when readyState is 0, and
    // connectDB reads MONGO_URI at call time. Point it here too, so even that
    // path lands on the in-memory server.
    process.env.MONGO_URI = uri;
    await mongoose.connect(uri);
    await ensureIndexes();
  }, 120000);

  afterEach(resetDatabase);

  afterAll(async () => {
    await mongoose.disconnect();
    // mongodb-memory-server registers no exit hook, so a missed stop() leaves
    // a mongod running after vitest exits.
    if (replSet) await replSet.stop();
    replSet = null;
  });
};

// ---------------------------------------------------------------------------
// Users, tokens and request headers
// ---------------------------------------------------------------------------

export const TEST_PASSWORD = "Sup3r-Secret-1";

// Cost 4 rather than the production cost: every test file mints users, and the
// hashing cost itself is not what these tests are about.
const PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

let userSeq = 0;

export const createUser = async ({ role = "owner", ...rest } = {}) => {
  userSeq += 1;
  return User.create({
    name: `Test ${role} ${userSeq}`,
    email: `${role}.${userSeq}@cakestyles.test`,
    passwordHash: PASSWORD_HASH,
    role,
    active: true,
    ...rest,
  });
};

// Mints the same payload the login controller signs, with the test secret.
export const tokenFor = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

export const bearer = (user) => `Bearer ${tokenFor(user)}`;

export const signIn = async (role = "owner", rest = {}) => {
  const user = await createUser({ role, ...rest });
  return { user, auth: bearer(user), token: tokenFor(user) };
};

// ---------------------------------------------------------------------------
// Store settings
//
// Totals depend on the Setting singleton, and resetDatabase() deletes it, so
// every test that cares about money seeds it explicitly.
// ---------------------------------------------------------------------------

export const NO_TAX = { enabled: false, rate: 0, label: "Tax", inclusive: false };
export const EXCLUSIVE_TAX = { enabled: true, rate: 18, label: "GST", inclusive: false };
export const INCLUSIVE_TAX = { enabled: true, rate: 5, label: "GST", inclusive: true };

export const seedSettings = async ({ tax, ...rest } = {}) => {
  const settings = await Setting.getSettings();
  if (Object.keys(rest).length) settings.set(rest);
  settings.set("tax", { ...NO_TAX, ...(tax || {}) });
  await settings.save();
  return settings;
};

export const PICKUP_SLOT = "10:00 - 13:00";

// ---------------------------------------------------------------------------
// Dates and ids
// ---------------------------------------------------------------------------

// Fulfilment validation rejects past dates and enforces a notice period, so
// tests book far enough ahead to be unaffected by the hour the suite runs at.
export const today = () => istDateString();
export const daysFromToday = (n) => addDaysIst(istDateString(), n);

// A well-formed ObjectId that matches no document — for the 404 cases. A
// random string would raise a CastError instead and take a different path.
export const missingId = () => new mongoose.Types.ObjectId().toString();

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// utils/csv.js joins with CRLF and quotes cells containing , " or newline.
export const csvLines = (body) => String(body).trim().split("\r\n");

export const csvHeader = (body) => csvLines(body)[0].split(",");

export const csvDataRows = (body) => {
  const lines = csvLines(body);
  return lines.length > 1 && lines[1] !== "" ? lines.slice(1) : [];
};
