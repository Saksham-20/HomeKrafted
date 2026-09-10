const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const OUT_DIR = "/Users/sakshampanjla/.gemini/antigravity/brain/16ed4a7d-0385-4528-ae1f-28e4f315fb56/screenshots";

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  // ── TEST 1: Desktop Navbar Logo Scroll Behavior ────────────────────────
  console.log("Testing Desktop Navbar Logo...");
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.addInitScript(() => {
    window.localStorage.setItem(
      "hk_location_v1",
      JSON.stringify({ source: "none", asked: true }),
    );
  });

  await desktopPage.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await desktopPage.evaluate(() => document.fonts.ready);
  await desktopPage.waitForTimeout(600);

  // At top: Navbar logo should be hidden (opacity 0)
  const logoAtTop = desktopPage.locator('header a[class*="logo"]');
  const opacityAtTop = await logoAtTop.evaluate((el) => window.getComputedStyle(el).opacity);
  console.log("Navbar logo opacity at top:", opacityAtTop);
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "desktop_01_top_no_logo.png") });

  // Scroll past hero: Navbar logo should appear
  console.log("Scrolling past hero on desktop...");
  await desktopPage.evaluate(() => window.scrollTo(0, 950));
  await desktopPage.waitForTimeout(600);

  const opacityScrolled = await logoAtTop.evaluate((el) => window.getComputedStyle(el).opacity);
  const desktopHeaderRect = await desktopPage.locator("header").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height, bottom: r.bottom };
  });
  console.log("Navbar logo opacity after scroll:", opacityScrolled);
  console.log("Desktop Header rect after scroll:", desktopHeaderRect);
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "desktop_02_scrolled_with_logo.png") });
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "desktop_00_full_page.png"), fullPage: true });

  await desktopContext.close();

  // ── TEST 2: Mobile Web View (iPhone 14/15: 390 x 844) ────────────────────
  console.log("Testing Mobile Web View (390 x 844)...");
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.addInitScript(() => {
    window.localStorage.setItem(
      "hk_location_v1",
      JSON.stringify({ source: "none", asked: true }),
    );
  });

  await mobilePage.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await mobilePage.evaluate(() => document.fonts.ready);
  await mobilePage.waitForTimeout(600);

  // Mobile at top
  const mobileLogoAtTop = mobilePage.locator('header a[class*="logo"]');
  const mobileOpacityTop = await mobileLogoAtTop.evaluate((el) => window.getComputedStyle(el).opacity);
  console.log("Mobile Navbar logo opacity at top:", mobileOpacityTop);
  await mobilePage.screenshot({ path: path.join(OUT_DIR, "mobile_01_hero.png") });

  // Mobile scrolled
  await mobilePage.evaluate(() => window.scrollTo(0, 1300));
  await mobilePage.waitForTimeout(600);
  const mobileOpacityScrolled = await mobileLogoAtTop.evaluate((el) => window.getComputedStyle(el).opacity);
  const mobileHeaderRect = await mobilePage.locator("header").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height, bottom: r.bottom };
  });
  console.log("Mobile Navbar logo opacity after scroll:", mobileOpacityScrolled);
  console.log("Mobile Header rect after scroll:", mobileHeaderRect);
  await mobilePage.screenshot({ path: path.join(OUT_DIR, "mobile_02_scrolled_header.png") });

  // Capture Mobile Sections
  console.log("Capturing Mobile Sections...");
  // Bestsellers
  const bestsellers = mobilePage.locator('section:has(h2:has-text("Bestsellers"))');
  if (await bestsellers.count() > 0) {
    await bestsellers.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(300);
    await bestsellers.screenshot({ path: path.join(OUT_DIR, "mobile_03_bestsellers.png") });
  }

  // Quick Entry
  const quickEntry = mobilePage.locator('nav[aria-label="Curated ways to order"]');
  if (await quickEntry.count() > 0) {
    await quickEntry.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(300);
    await quickEntry.screenshot({ path: path.join(OUT_DIR, "mobile_04_quickentry.png") });
  }

  // Categories
  const categories = mobilePage.locator('section:has(h2:has-text("What are you in the mood for"))');
  if (await categories.count() > 0) {
    await categories.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(300);
    await categories.screenshot({ path: path.join(OUT_DIR, "mobile_05_categories.png") });
  }

  // Occasions
  const occasions = mobilePage.locator('section:has(h2:has-text("Someone you owe a present"))');
  if (await occasions.count() > 0) {
    await occasions.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(300);
    await occasions.screenshot({ path: path.join(OUT_DIR, "mobile_06_occasions.png") });
  }

  // How it works
  const howitworks = mobilePage.locator('section:has(h2:has-text("How this works"))');
  if (await howitworks.count() > 0) {
    await howitworks.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(300);
    await howitworks.screenshot({ path: path.join(OUT_DIR, "mobile_07_howitworks.png") });
  }

  // Full mobile page
  await mobilePage.screenshot({ path: path.join(OUT_DIR, "mobile_00_full_page.png"), fullPage: true });

  await mobileContext.close();
  await browser.close();
  console.log("Mobile & Scroll testing complete!");
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
