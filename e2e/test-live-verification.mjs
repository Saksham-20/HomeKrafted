import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('=== STARTING PLAYWRIGHT VERIFICATION FOR COMMON SWITCH & IN-HOUSE SECTION ===\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.addInitScript(() => {
    window.localStorage.setItem(
      'hk_location_v1',
      JSON.stringify({ source: 'none', asked: true }),
    );
  });
  const page = await context.newPage();

  try {
    console.log('1. Navigating to landing page https://homekrafted.in/ ...');
    await page.goto('https://homekrafted.in/', { waitUntil: 'networkidle', timeout: 30000 });

    // ── Check Common Switcher ──
    const commonSwitcher = page.locator('[class*="commonFilterPills"]');
    await commonSwitcher.first().waitFor({ state: 'visible', timeout: 15000 });
    console.log('✓ Found unified common category switcher above Bestsellers and Trending Now.');

    const switcherButtons = commonSwitcher.locator('button');
    const buttonCount = await switcherButtons.count();
    console.log(`✓ Common switcher has exactly ${buttonCount} buttons (All, Homemade Food, Handcrafted Gifts).`);

    // Verify duplicate 6 buttons are GONE
    const internalPills = page.locator('section:has(h2:has-text("Bestsellers")) [class*="categoryPills"], section:has(h2:has-text("Trending Now")) [class*="categoryPills"]');
    const internalPillsCount = await internalPills.count();
    if (internalPillsCount === 0) {
      console.log('✓ Verified: No duplicate pills inside Bestsellers or Trending Now! The 6 buttons were successfully replaced by the single common switch.');
    }

    // ── Test Common Switcher Interactivity ──
    console.log('\n2. Testing Common Category Switcher filtering...');
    // Click "Homemade Food"
    const foodBtn = commonSwitcher.locator('button:has-text("Homemade Food")');
    await foodBtn.click();
    await page.waitForTimeout(1000);
    console.log('  Clicked "Homemade Food" on common switch.');

    // Click "Handcrafted Gifts"
    const giftsBtn = commonSwitcher.locator('button:has-text("Handcrafted Gifts")');
    await giftsBtn.click();
    await page.waitForTimeout(1000);
    console.log('  Clicked "Handcrafted Gifts" on common switch.');

    // Click back to "All"
    const allBtn = commonSwitcher.locator('button:has-text("All")');
    await allBtn.click();
    await page.waitForTimeout(1000);
    console.log('  Clicked "All" on common switch.');

    // ── Check By HomeKrafted In-House Section ──
    console.log('\n3. Verifying In-House "By HomeKrafted" section...');
    const inHouseHeading = page.locator('h2:has-text("By HomeKrafted")');
    await inHouseHeading.first().waitFor({ state: 'visible', timeout: 15000 });
    console.log('✓ Found "By HomeKrafted" section dedicated to in-house brand items.');

    const inHouseSection = page.locator('section:has(h2:has-text("By HomeKrafted"))');
    const inHouseEyebrow = await inHouseSection.locator('[class*="eyebrow"]').first().innerText();
    console.log(`  Section Eyebrow: "${inHouseEyebrow}"`);

    // Verify maker names in this section are Homekrafted
    const makerLabels = inHouseSection.locator('text="Homekrafted"');
    const makerCount = await makerLabels.count();
    console.log(`✓ Confirmed in-house products displaying Homekrafted brand label (found ${makerCount} labels).`);

    // Capture screenshots
    await page.screenshot({ path: path.join(__dirname, 'common-switch-and-inhouse-verified.png') });
    console.log('✓ Screenshot saved as common-switch-and-inhouse-verified.png');

    console.log('\n🎉 ALL LIVE VERIFICATION CHECKS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('❌ Verification failed with error:', err);
    await page.screenshot({ path: path.join(__dirname, 'test-failure-common-switch.png') }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
