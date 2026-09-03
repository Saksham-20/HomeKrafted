import { chromium } from '@playwright/test';
import path from 'node:path';
const OUT = process.env.SHOT_DIR ?? '.';
const [name, url, sel, zoom] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await context.addInitScript(() => {
  try { window.localStorage.setItem('hk_location_v1', JSON.stringify({ source: 'skipped', asked: true })); } catch {}
});
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url));
if (zoom) await page.evaluate((z) => { document.body.style.zoom = z; }, zoom);
if (sel) {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -60);
  }, sel);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, `${name}.png`) });
console.log('wrote', name);
await browser.close();
