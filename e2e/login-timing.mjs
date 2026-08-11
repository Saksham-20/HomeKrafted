// Login end-to-end timing against the QA stack.
// Phases per run: submit-click → auth response seen → URL changed → destination h1 visible → network quiet.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3100';
const CASES = [
  { name: 'consumer', id: 'ananya.iyer@example.com', landing: /\/account/, h1: /account/i },
  { name: 'seller', id: 'anjali@anjaliskitchen.example', landing: /\/seller/, h1: /dashboard|kitchen|today/i },
];

const browser = await chromium.launch();
for (const c of CASES) {
  for (let run = 1; run <= 2; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => {
      window.localStorage.setItem('hk_location_v1', JSON.stringify({ source: 'area', asked: true, areaId: 'chd-sector-17', label: 'Sector 17', lat: 30.7418, lng: 76.7822 }));
    });
    const page = await ctx.newPage();

    const reqs = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/')) reqs.push({ url: r.url().replace(/^.*\/api\/v1/, ''), t: Date.now(), method: r.method() }); });

    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await page.getByLabel(/mobile number or email|email address/i).fill(c.id);
    await page.getByLabel(/password/i).fill('Passw0rd!123');

    const t0 = Date.now();
    let tAuth = 0, tNav = 0, tH1 = 0;
    page.on('response', (r) => { if (r.url().includes('/auth/continue') && !tAuth) tAuth = Date.now(); });
    await page.getByRole('button', { name: /continue/i }).click();
    await page.waitForURL(c.landing, { timeout: 30000 });
    tNav = Date.now();
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 30000 });
    tH1 = Date.now();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const tIdle = Date.now();

    const apiAfterClick = reqs.filter((r) => r.t >= t0).map((r) => `${r.method} ${r.url.slice(0, 60)} @${r.t - t0}ms`);
    console.log(`\n${c.name} run${run}: auth=${tAuth - t0}ms urlchange=${tNav - t0}ms h1=${tH1 - t0}ms idle=${tIdle - t0}ms`);
    console.log('  api calls after click:');
    for (const line of apiAfterClick) console.log('   ', line);
    await ctx.close();
  }
}
await browser.close();
