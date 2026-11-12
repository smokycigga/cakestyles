const { chromium } = require("playwright-core");
const fs = require("fs");

const BASE = "https://www.cakestyles.in";
const OUT = "C:/Users/Gorakhnath Samal/Downloads/cakestyles/.tmp-check";
fs.mkdirSync(OUT, { recursive: true });

const fails = [];
const log = (...a) => console.log(...a);
const check = (ok, label, detail = "") => {
  log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) fails.push(label + (detail ? " — " + detail : ""));
};

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
  const errors = [];
  const failed = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText || "";
    if (why.includes("ERR_ABORTED")) return; // cancelled by navigation
    failed.push(`${r.url().slice(0, 90)} ${why}`);
  });

  // --- Home -----------------------------------------------------------------
  const t0 = Date.now();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  const domReady = Date.now() - t0;
  await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
  check(true, "home loads", `DOMContentLoaded ${domReady}ms`);

  const hero = await page.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { poster: v.getAttribute("poster") } : null;
  });
  check(hero !== null && hero.poster === "/images/gallery/hero-poster.webp", "hero shows poster frame", JSON.stringify(hero));

  // The rest of the page is scroll-triggered, so walk down it to wake the
  // lazily loaded sections and images.
  for (let y = 0; y < 9000; y += 600) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(180);
  }
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);

  const homeImgs = await page.evaluate(() =>
    [...document.querySelectorAll("img")].map((i) => ({
      src: (i.currentSrc || i.src || "").slice(0, 100),
      natural: i.naturalWidth,
      complete: i.complete,
      cloud: (i.currentSrc || i.src || "").includes("res.cloudinary.com"),
    }))
  );
  const homeBroken = homeImgs.filter((i) => i.complete && i.natural === 0);
  check(homeImgs.length > 0 && homeBroken.length === 0, "no broken images on home", `${homeImgs.filter((i) => i.natural > 0).length}/${homeImgs.length} decoded, ${homeBroken.length} broken`);
  log(`      ${homeImgs.filter((i) => i.cloud).length} of ${homeImgs.length} home images from Cloudinary`);
  await page.screenshot({ path: OUT + "/01-home.png" });

  // --- Menu -----------------------------------------------------------------
  await page.goto(BASE + "/menu", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
  const cardCount = await page.locator("a[href*='/menu/product/']").count();
  check(cardCount > 0, "menu lists products", `${cardCount} cards`);

  const menuImgs = await page.evaluate(() =>
    [...document.querySelectorAll("img")].map((i) => ({
      src: i.currentSrc || i.src || "",
      natural: i.naturalWidth,
      srcset: Boolean(i.getAttribute("srcset")),
    }))
  );
  check(menuImgs.every((i) => i.natural > 0), "all menu images decode", `${menuImgs.filter((i) => i.natural > 0).length}/${menuImgs.length}`);
  const widths = [...new Set(menuImgs.map((i) => (i.src.match(/w_(\d+)/) || [])[1]).filter(Boolean))];
  check(widths.length > 0, "browser picks a sized variant", `w_${widths.join(", w_")}`);
  check(menuImgs.some((i) => i.srcset), "cards advertise srcset");
  await page.screenshot({ path: OUT + "/02-menu.png" });

  // --- Product detail -------------------------------------------------------
  const slug = await page.evaluate(() => {
    const a = document.querySelector("a[href*='/menu/product/']");
    return a ? a.getAttribute("href").split("/menu/product/")[1] : null;
  });
  // The admin editor keys on the Mongo id, not the slug.
  const productId = await page.evaluate(async () => {
    const res = await fetch("/api/products");
    const { products } = await res.json();
    return products?.[0]?._id || null;
  });
  await page.goto(`${BASE}/menu/product/${slug}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(800);

  const heroImg = await page.evaluate(() => {
    const i = document.querySelector("img[class*='aspect-square']");
    return i ? { src: i.currentSrc || i.src, natural: i.naturalWidth, srcset: Boolean(i.getAttribute("srcset")) } : null;
  });
  check(Boolean(heroImg && heroImg.natural > 0), "product hero image decodes", heroImg ? (heroImg.src.match(/w_\d+/) || ["no width"])[0] : "missing");
  check(Boolean(heroImg && heroImg.srcset), "product hero has srcset");
  await page.screenshot({ path: OUT + "/03-product.png" });

  // --- Add to cart ----------------------------------------------------------
  const d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await page.locator("input[type='date']").first().fill(d);

  const slot = page.locator("select").first();
  const slotOptions = await slot.locator("option").allTextContents();
  const usableSlot = slotOptions.find((o) => o && !/choose/i.test(o));
  if (usableSlot) await slot.selectOption({ label: usableSlot });
  await page.waitForTimeout(600);

  const addBtn = page.getByRole("button", { name: /add to cart/i }).first();
  const addLabel = await addBtn.innerText().catch(() => "");
  await addBtn.click({ force: true });
  await page.waitForTimeout(1800);

  await page.goto(BASE + "/cart", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const cartText = await page.locator("body").innerText();
  check(!/your cart is empty/i.test(cartText), "item reaches the cart", `clicked "${addLabel.replace(/\s+/g, " ")}" · ${d} · ${usableSlot || "no slot"}`);
  check(/subtotal|total/i.test(cartText), "cart shows a total");

  const plus = page.locator("button").filter({ has: page.locator("svg.lucide-plus") }).first();
  if (await plus.count()) {
    for (let i = 0; i < 5; i++) await plus.click({ force: true });
    await page.waitForTimeout(600);
    const qty = (await page.locator(".min-w-10").first().innerText().catch(() => "")).trim();
    check(Number(qty) > 1, "quantity stepper works", `now ${qty}`);
  }
  await page.screenshot({ path: OUT + "/04-cart.png" });

  // --- Admin ----------------------------------------------------------------
  await page.goto(BASE + "/admin/login", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.fill("input[type='email']", "owner@cakestyles.test");
  await page.fill("input[type='password']", "Cakestyles@123");
  await page.click("button[type='submit']");
  await page.waitForTimeout(5000);
  check(!/login/.test(page.url()), "admin login succeeds", page.url().replace(BASE, ""));
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: OUT + "/05-admin.png" });

  // A product edit screen is where uploaded photos are listed — the real test
  // of whether admin-uploaded images are now Cloudinary-backed.
  await page.goto(`${BASE}/admin/products/${productId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  check(!/\/admin\/login/.test(page.url()) && page.url() !== BASE + "/", "product editor opens", page.url().replace(BASE, ""));
  const adminImgs = await page.evaluate(() =>
    [...document.querySelectorAll("img")].map((i) => ({
      src: (i.currentSrc || i.src || "").slice(0, 100),
      natural: i.naturalWidth,
      complete: i.complete,
    }))
  );
  const brokenAdmin = adminImgs.filter((i) => i.complete && i.natural === 0);
  const cloudAdmin = adminImgs.filter((i) => i.src.includes("res.cloudinary.com"));
  const stillViaApi = adminImgs.filter((i) => i.src.includes("/api/media/"));
  check(adminImgs.length > 0, "product form lists images", `${adminImgs.length} image(s)`);
  check(brokenAdmin.length === 0, "no broken images on product form", `${brokenAdmin.length} broken`);
  check(cloudAdmin.length > 0, "uploaded photos come from Cloudinary", `${cloudAdmin.length} of ${adminImgs.length}`);
  check(stillViaApi.length === 0, "no photo still routed through /api/media", `${stillViaApi.length} remaining`);
  await page.screenshot({ path: OUT + "/06-admin-product-form.png" });

  // --- Console health -------------------------------------------------------
  check(errors.length === 0, "no console errors", errors.slice(0, 3).join(" | "));
  check(failed.length === 0, "no failed requests", failed.slice(0, 3).join(" | "));

  await browser.close();
  log("\n=== Summary ===");
  log(fails.length === 0 ? "All browser checks passed." : `${fails.length} failed:\n  - ` + fails.join("\n  - "));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error("E2E crashed:", e.message);
  process.exit(1);
});
