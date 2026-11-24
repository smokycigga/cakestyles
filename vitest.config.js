import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/tests/**/*.test.js"],
    environment: "node",

    // Every database suite boots its own single-node replica set, and a replica
    // set is a real mongod process plus an rs.initiate handshake. At the default
    // concurrency vitest started eleven of them at once and each one blew
    // mongodb-memory-server's 10s startup budget, so every DB suite failed before
    // running a single assertion. Four at a time is the most this class of
    // machine starts reliably; the extra minutes buy a suite that tests something.
    maxWorkers: 4,
    env: {
      MONGOMS_STARTUP_TIMEOUT: "120000",
    },
    hookTimeout: 120000,
    testTimeout: 30000,
  },
});
