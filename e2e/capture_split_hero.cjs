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
  await desktopPage.waitForTimeout(1000);

  // Check video state
  const videoState = await desktopPage.evaluate(() => {
    const v = document.querySelector("video");
    if (!v) return { found: false };
    return {
      found: true,
      paused: v.paused,
      currentTime: v.currentTime,
      muted: v.muted,
      readyState: v.readyState,
      src: v.currentSrc,
    };
  });
  console.log("Desktop Video State:", videoState);

  // 1. Initial Start State (Logo, Slogan, and Expanding Preview Card with Video)
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "revamp2_01_initial_state.png") });

  // 2. Click to expand immediately or simulate wheel scroll to expand
  console.log("Expanding scroll hero on desktop...");
  const previewCard = desktopPage.locator('div[title="Click or scroll to expand"]');
  if (await previewCard.count() > 0) {
    await previewCard.click({ force: true });
    await desktopPage.waitForSelector('[class*="splitGrid"]', { timeout: 3000 });
    await desktopPage.waitForTimeout(600);
  }

  // 3. Expanded State: Full 50/50 split screen revealed
  await desktopPage.screenshot({ path: path.join(OUT_DIR, "revamp2_02_expanded_split_screen.png") });

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

  // Mobile Initial
  await mobilePage.screenshot({ path: path.join(OUT_DIR, "revamp2_03_mobile_initial.png") });

  // Mobile Expand
  console.log("Expanding scroll hero on mobile...");
  const mobileCard = mobilePage.locator('div[title="Click or scroll to expand"]');
  if (await mobileCard.count() > 0) {
    await mobileCard.click({ force: true });
    await mobilePage.waitForSelector('[class*="splitGrid"]', { timeout: 3000 });
    await mobilePage.waitForTimeout(600);
  }
  await mobilePage.screenshot({ path: path.join(OUT_DIR, "revamp2_04_mobile_expanded.png") });

  await mobileContext.close();
  await browser.close();

  console.log("Revamp 2 screenshots captured successfully!");
}

main().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
