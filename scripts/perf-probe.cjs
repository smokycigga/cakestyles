const { chromium } = require("playwright-core");

const BASE = "https://www.cakestyles.in";
const TARGET = process.argv[2] || `${BASE}/menu/product/chocochip-butter-cake-copy`;
const LABEL = process.argv[3] || "product page";
const CHROME =
  "C:/Users/Gorakhnath Samal/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe";

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  // Throttle to a realistic phone connection: 4 Mbps down, 150ms RTT.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (1 * 1024 * 1024) / 8,
  });

  const reqs = [];
  page.on("response", async (res) => {
    const req = res.request();
    try {
      const size = (await res.body()).length;
      const timing = res.request().timing();
      reqs.push({
        url: res.url(),
        status: res.status(),
        type: req.resourceType(),
        size,
        start: timing.startTime,
        end: timing.startTime + timing.responseEnd,
      });
    } catch {}
  });

  const t0 = Date.now();
  await page.goto(TARGET, { waitUntil: "load", timeout: 120000 });
  const loadMs = Date.now() - t0;

  // When does the product's own content actually appear?
  await page.waitForSelector("h1, h2", { timeout: 60000 }).catch(() => {});
  const contentMs = Date.now() - t0;
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});

  const byType = {};
  for (const r of reqs) {
    byType[r.type] = byType[r.type] || { n: 0, bytes: 0 };
    byType[r.type].n += 1;
    byType[r.type].bytes += r.size;
  }

  console.log(`\n=== ${LABEL} (throttled: 4Mbps, 150ms RTT) ===`);
  console.log(`  load event:        ${loadMs} ms`);
  console.log(`  content painted:   ${contentMs} ms`);
  console.log(`  requests:          ${reqs.length}`);
  console.log(`  total transferred: ${(reqs.reduce((s, r) => s + r.size, 0) / 1024).toFixed(0)} KB\n`);

  console.log("  by type:");
  for (const [type, v] of Object.entries(byType).sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`    ${type.padEnd(12)} ${String(v.n).padStart(3)} req  ${(v.bytes / 1024).toFixed(0).padStart(6)} KB`);
  }

  // Anything over 100ms of dead time before a request starts is a chain link.
  const sorted = [...reqs].sort((a, b) => a.start - b.start);
  const base = sorted.length ? sorted[0].start : 0;
  console.log("\n  first 14 requests (ms from first byte request):");
  for (const r of sorted.slice(0, 14)) {
    const name = r.url.replace(BASE, "").slice(0, 62) || r.url.slice(0, 62);
    console.log(
      `    ${String(Math.round(r.start - base)).padStart(6)} -> ${String(Math.round(r.end - base)).padStart(6)} ms  ${(r.size / 1024).toFixed(1).padStart(7)} KB  ${name}`
    );
  }

  const big = sorted.filter((r) => r.size > 40000).sort((a, b) => b.size - a.size);
  if (big.length) {
    console.log("\n  heaviest responses:");
    for (const r of big.slice(0, 8)) {
      console.log(`    ${(r.size / 1024).toFixed(0).padStart(6)} KB  ${r.url.replace(BASE, "").slice(0, 70)}`);
    }
  }

  await browser.close();
})();
