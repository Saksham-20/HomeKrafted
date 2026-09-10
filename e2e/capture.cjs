const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const OUT_DIR = "/Users/sakshampanjla/.gemini/antigravity/brain/16ed4a7d-0385-4528-ae1f-28e4f315fb56/screenshots";

async function capture() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log("Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // crisp retina screenshots
  });
  const page = await context.newPage();

  console.log("Navigating to http://localhost:3000 ...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);

  console.log("1. Capturing full landing page...");
  await page.screenshot({ path: path.join(OUT_DIR, "00_full_landing.png"), fullPage: true });

  console.log("2. Capturing Header & Hero...");
  const hero = page.locator('section[aria-label="Welcome to HomeKrafted"]');
  if (await hero.count() > 0) {
    await hero.screenshot({ path: path.join(OUT_DIR, "01_hero.png") });
  }

  console.log("3. Capturing Bestsellers tabs and testing position stability...");
  const tabsSection = page.locator('section:has(h2:has-text("Bestsellers"))');
  if (await tabsSection.count() > 0) {
    const segmented = tabsSection.locator('div[role="tablist"]');
    
    // Screenshot 1: All
    const boxAll = await segmented.boundingBox();
    console.log("All tab control X position:", boxAll?.x);
    await tabsSection.screenshot({ path: path.join(OUT_DIR, "02_bestsellers_all.png") });

    // Click Food
    const foodTab = tabsSection.locator('button[role="tab"]:has-text("Food")');
    await foodTab.click();
    await page.waitForTimeout(400);
    const boxFood = await segmented.boundingBox();
    console.log("Food tab control X position:", boxFood?.x);
    await tabsSection.screenshot({ path: path.join(OUT_DIR, "03_bestsellers_food.png") });

    // Click Gifts
    const giftsTab = tabsSection.locator('button[role="tab"]:has-text("Gifts")');
    await giftsTab.click();
    await page.waitForTimeout(400);
    const boxGifts = await segmented.boundingBox();
    console.log("Gifts tab control X position:", boxGifts?.x);
    await tabsSection.screenshot({ path: path.join(OUT_DIR, "04_bestsellers_gifts.png") });

    // Click back to All
    const allTab = tabsSection.locator('button[role="tab"]:has-text("All")');
    await allTab.click();
    await page.waitForTimeout(300);

    const xDiff1 = Math.abs((boxFood?.x ?? 0) - (boxAll?.x ?? 0));
    const xDiff2 = Math.abs((boxGifts?.x ?? 0) - (boxAll?.x ?? 0));
    console.log(`Stability test result: X delta Food=${xDiff1}px, Gifts=${xDiff2}px`);
  }

  console.log("4. Capturing QuickEntryRow (Editorial Service Capsules)...");
  const quickEntry = page.locator('nav[aria-label="Curated ways to order"]');
  if (await quickEntry.count() > 0) {
    await quickEntry.screenshot({ path: path.join(OUT_DIR, "05_service_capsules.png") });
  }

  console.log("5. Capturing Occasions grid...");
  const occasions = page.locator('section:has(h2:has-text("Shop by Occasion"))');
  if (await occasions.count() > 0) {
    await occasions.screenshot({ path: path.join(OUT_DIR, "06_occasions_grid.png") });
  }

  console.log("6. Capturing How It Works...");
  const howItWorks = page.locator('section:has(h2:has-text("How it works"))');
  if (await howItWorks.count() > 0) {
    await howItWorks.screenshot({ path: path.join(OUT_DIR, "07_how_it_works.png") });
  }

  console.log("7. Capturing App Install Panel & Sell CTA...");
  const installPanel = page.locator('section:has(h2:has-text("Get the Homekrafted App"))');
  if (await installPanel.count() > 0) {
    await installPanel.screenshot({ path: path.join(OUT_DIR, "08_app_install.png") });
  }

  await browser.close();
  console.log("All screenshots captured successfully in:", OUT_DIR);
}

capture().catch((err) => {
  console.error("Capture error:", err);
  process.exit(1);
});

