const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");

const OUT_DIR = "/Users/sakshampanjla/.gemini/antigravity/brain/16ed4a7d-0385-4528-ae1f-28e4f315fb56/screenshots";

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  // Desktop
  console.log("Capturing Desktop 1440x900...");
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const desktopPage = await desktopContext.newPage();
  await desktopPage.addInitScript(() => {
    window.localStorage.setItem(
      "hk_location_v1",
      JSON.stringify({ source: "none", asked: true })
    );
  });

  await desktopPage.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await desktopPage.evaluate(() => document.fonts.ready);
  await desktopPage.waitForTimeout(800);

  // 1. Top of page view
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "desktop_01_hero_split.png") });

  // 2. Hero element specifically
  const heroEl = desktopPage.locator("#hk-hero-section");
  if (await heroEl.count() > 0) {
    await heroEl.screenshot({ path: path.join(OUT_DIR, "desktop_hero_element.png") });
  }

  // 3. Scroll past hero
  await desktopPage.evaluate(() => window.scrollTo(0, 950));
  await desktopPage.waitForTimeout(600);
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "desktop_02_scrolled.png") });

  await desktopContext.close();

  // Mobile
  console.log("Capturing Mobile 390x844...");
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
      JSON.stringify({ source: "none", asked: true })
    );
  });

  await mobilePage.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await mobilePage.evaluate(() => document.fonts.ready);
  await mobilePage.waitForTimeout(800);

  await mobilePage.screenshot({ path: path.join(OUT_DIR, "mobile_01_hero_split.png") });

  await mobilePage.evaluate(() => window.scrollTo(0, 750));
  await mobilePage.waitForTimeout(600);
  await mobilePage.screenshot({ path: path.join(OUT_DIR, "mobile_02_scrolled.png") });

  await mobileContext.close();
  await browser.close();

  console.log("All screenshots captured successfully!");
}

main().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});

