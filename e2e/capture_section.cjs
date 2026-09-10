const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const OUT_DIR = "/Users/sakshampanjla/.gemini/antigravity/brain/16ed4a7d-0385-4528-ae1f-28e4f315fb56/screenshots";

async function main() {
  const target = process.argv[2] || "all";
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Dismiss location modal
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "hk_location_v1",
      JSON.stringify({ source: "none", asked: true }),
    );
  });

  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);

  if (target === "hero" || target === "all") {
    console.log("Capturing hero...");
    const hero = page.locator('section[aria-label="Welcome to HomeKrafted"]');
    if (await hero.count() > 0) {
      await hero.screenshot({ path: path.join(OUT_DIR, "step_hero.png") });
    }
  }

  if (target === "bestsellers" || target === "all") {
    console.log("Capturing bestsellers...");
    const bestsellers = page.locator('section:has(h2:has-text("Bestsellers"))');
    if (await bestsellers.count() > 0) {
      await bestsellers.screenshot({ path: path.join(OUT_DIR, "step_bestsellers_all.png") });
      const foodTab = bestsellers.locator('button[role="tab"]:has-text("Food")');
      await foodTab.click();
      await page.waitForTimeout(400);
      await bestsellers.screenshot({ path: path.join(OUT_DIR, "step_bestsellers_food.png") });
      const giftTab = bestsellers.locator('button[role="tab"]:has-text("Gifts")');
      await giftTab.click();
      await page.waitForTimeout(400);
      await bestsellers.screenshot({ path: path.join(OUT_DIR, "step_bestsellers_gifts.png") });
    }
  }

  if (target === "quickentry" || target === "all") {
    console.log("Capturing quickentry...");
    const qe = page.locator('nav[aria-label="Curated ways to order"]');
    if (await qe.count() > 0) {
      await qe.screenshot({ path: path.join(OUT_DIR, "step_quickentry.png") });
    }
  }

  if (target === "categories" || target === "all") {
    console.log("Capturing categories...");
    const cat = page.locator('section:has(h2:has-text("What are you in the mood for"))');
    if (await cat.count() > 0) {
      await cat.screenshot({ path: path.join(OUT_DIR, "step_categories.png") });
    }
  }

  if (target === "occasions" || target === "all") {
    console.log("Capturing occasions...");
    const occ = page.locator('section:has(h2:has-text("Someone you owe a present"))');
    if (await occ.count() > 0) {
      await occ.screenshot({ path: path.join(OUT_DIR, "step_occasions.png") });
    }
  }

  if (target === "howitworks" || target === "all") {
    console.log("Capturing how it works...");
    const hiw = page.locator('section:has(h2:has-text("How this works"))');
    if (await hiw.count() > 0) {
      await hiw.screenshot({ path: path.join(OUT_DIR, "step_howitworks.png") });
    }
  }

  if (target === "full" || target === "all") {
    console.log("Capturing full landing page...");
    await page.screenshot({ path: path.join(OUT_DIR, "step_full.png"), fullPage: true });
  }

  await browser.close();
  console.log("Capture completed for:", target);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

