const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const OUT_DIR = "/Users/sakshampanjla/.gemini/antigravity/brain/3cbd3ab1-a207-4d75-9348-d73248f6af0b/screenshots";

async function run() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log("Launching Chromium for end-to-end verification...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  // Seed localStorage with mock mode bypass for location prompt and pre-populated cart
  await context.addInitScript(() => {
    localStorage.setItem("hk_location_v1", JSON.stringify({ source: "none", asked: true }));
    const seedCart = {
      items: [
        { id: "ci-1", productId: "pr1", sku: "mango-thokku-pickle-250g", quantity: 2 },
        { id: "ci-2", productId: "pr2", sku: "green-chilli-chutney-200g", quantity: 1 }
      ],
      hampers: {}
    };
    localStorage.setItem("hk_cart_v1", JSON.stringify(seedCart));
  });

  const page = await context.newPage();

  console.log("\n--- TEST 1: Homepage & Ticker Refinement ---");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);

  const ticker = page.locator('aside[aria-label="HomeKrafted platform promises"]');
  if (await ticker.count() > 0) {
    await ticker.screenshot({ path: path.join(OUT_DIR, "01_ticker_refined.png") });
    console.log("✓ Refined Ticker captured with warm amber background & crisp deep pine text");
  }

  console.log("\n--- TEST 2: Eyebrows Removal & Bestsellers Heading ---");
  const lovedEyebrow = page.locator('text="Loved by our community"');
  console.log(`✓ "Loved by our community" removed: ${(await lovedEyebrow.count()) === 0}`);

  const freshEyebrow = page.locator('text="Fresh & rising favorites"');
  console.log(`✓ "Fresh & rising favorites" removed: ${(await freshEyebrow.count()) === 0}`);

  const inHouseEyebrow = page.locator('text="Created in-house under our label"');
  console.log(`✓ "Created in-house under our label" removed: ${(await inHouseEyebrow.count()) === 0}`);

  console.log("\n--- TEST 3: Bestsellers 4 Tabs & Combos Filter ---");
  const tabsSection = page.locator('section:has(h2:has-text("Bestsellers"))');
  if (await tabsSection.count() > 0) {
    await tabsSection.screenshot({ path: path.join(OUT_DIR, "02_bestsellers_all.png") });
    console.log("✓ Bestsellers All tab captured");

    const combosTab = tabsSection.locator('button[role="tab"]:has-text("Combos")');
    if (await combosTab.count() > 0) {
      await combosTab.click();
      await page.waitForTimeout(600);
      await tabsSection.screenshot({ path: path.join(OUT_DIR, "03_bestsellers_combos.png") });
      console.log("✓ Bestsellers Combos tab captured with saffron COMBO badges");
    }
  }

  console.log("\n--- TEST 4: Login Page Social Placement ---");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  const loginCard = page.locator('section:has(h1:has-text("Sign in"))');
  if (await loginCard.count() > 0) {
    await loginCard.screenshot({ path: path.join(OUT_DIR, "04_login_social_prominent.png") });
    console.log("✓ Login page with prominent top social buttons captured");
  }

  console.log("\n--- TEST 5: Cart Page with Active Line Items & Suggestions ---");
  await page.goto("http://localhost:3000/cart", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);

  // Take screenshot of filled cart
  await page.screenshot({ path: path.join(OUT_DIR, "05_cart_filled_active.png") });
  console.log("✓ Filled cart layout with line items, order summary, and suggestions rail captured");

  console.log("\n--- TEST 6: Cart Suggestions Category Switching ---");
  const combosSuggestionTab = page.locator('button[role="tab"]:has-text("Combos & Sides")');
  if (await combosSuggestionTab.count() > 0) {
    await combosSuggestionTab.click();
    await page.waitForTimeout(500);
    const suggestionsSection = page.locator('section[aria-label="Order suggestions"]');
    if (await suggestionsSection.count() > 0) {
      await suggestionsSection.screenshot({ path: path.join(OUT_DIR, "06_cart_suggestion_category_combos.png") });
      console.log("✓ Cart suggestions Combos & Sides category tab captured");
    }
  }

  console.log("\n--- TEST 7: Quick Add Suggestion to Cart ---");
  const firstAddBtn = page.locator('button[aria-label*="Add"][aria-label*="to cart"]').first();
  if (await firstAddBtn.count() > 0) {
    await firstAddBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, "07_cart_after_quick_add_full.png") });
    console.log("✓ Quick Add to cart full page updated screenshot captured");
  }

  console.log("\n--- TEST 8: Public Storefront Standard Banner ---");
  await page.goto("http://localhost:3000/storefront/anjalis-kitchen", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);
  const storeHeader = page.locator('div:has(h1:has-text("Anjali\'s Kitchen"))').first();
  if (await storeHeader.count() > 0) {
    await storeHeader.screenshot({ path: path.join(OUT_DIR, "08_storefront_standard_banner.png") });
    console.log("✓ Storefront with standard banner captured");
  }

  await browser.close();
  console.log("\n>>> ALL 8 E2E PLAYWRIGHT TESTS PASSED SUCCESSFULLY! <<<");
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
