/*
 * Login timing measured from the DOM, not from a Playwright locator.
 *
 * `login-timing.mjs` waits on `locator('h1').waitFor({state:'visible'})`
 * and reports ~850ms for a seller. That number is not what a person
 * experiences: instrumented in-page, the dashboard's own `<h1>` ("Hi,
 * <kitchen>") is in the DOM with a 223x26 box at ~380ms, no long tasks
 * fire, and a `requestAnimationFrame` heartbeat records zero dropped
 * frames across the whole transition. The extra ~470ms is the harness
 * resolving its selector, not the app painting.
 *
 * So this measures the same phases with an in-page `setInterval`, which
 * is on the same clock the user's eyes are: the moment the destination's
 * heading exists is the moment the page is there.
 *
 * **Two markers for the seller, not one (M31).** `destination-h1` is the
 * `Hi, <kitchen>` heading, which needs `GET /seller/me`; `stats` is the
 * first StatCard, which needs `GET /seller/dashboard`. They are different
 * requests, and reporting only the heading made it impossible to say
 * which one a HomeKrafter was actually waiting on — the question that
 * decides whether gating paint on the record costs anything. Response
 * times for both are printed alongside.
 *
 * `LOGIN_TIMING_BASE` points it at any origin, so the same script
 * measures production after a deploy rather than a hand-edited copy.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.LOGIN_TIMING_BASE ?? 'http://localhost:3100';
const CASES = [
  { name: 'consumer', id: 'ananya.iyer@example.com', landing: /\/account/, marker: 'Hi, ' },
  { name: 'seller', id: 'anjali@anjaliskitchen.example', landing: /\/seller/, marker: 'Hi, ' },
];

const browser = await chromium.launch();
for (const c of CASES) {
  for (let run = 1; run <= 2; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => window.localStorage.setItem('hk_location_v1', JSON.stringify({ source: 'area', asked: true, areaId: 'chd-sector-17', label: 'Sector 17', lat: 30.7418, lng: 76.7822 })));
    const page = await ctx.newPage();
    const api = [];
    const responses = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/')) api.push({ u: r.url().replace(/^.*\/api\/v1/, ''), t: Date.now() }); });
    page.on('response', (r) => { if (r.url().includes('/api/v1/')) responses.push({ u: r.url().replace(/^.*\/api\/v1/, ''), t: Date.now() }); });

    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await page.getByLabel(/mobile number or email|email address/i).fill(c.id);
    await page.getByLabel(/password/i).fill('Passw0rd!123');

    await page.evaluate((marker) => {
      window.__t0 = performance.now();
      window.__res = {};
      window.__poll = setInterval(() => {
        const now = Math.round(performance.now() - window.__t0);
        if (!window.__res.gate && /Sign in as a HomeKrafter/i.test(document.body.innerText)) window.__res.gate = now;
        const h1 = [...document.querySelectorAll('h1')].find((h) => h.textContent.includes(marker));
        if (h1 && !window.__res.h1) {
          const r = h1.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) window.__res.h1 = now;
        }
        if (!window.__res.stats) {
          const card = document.querySelector('[data-testid="stat-card"]');
          if (card) {
            const r = card.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) window.__res.stats = now;
          }
        }
      }, 8);
    }, c.marker);

    const t0 = Date.now();
    await page.getByRole('button', { name: /continue/i }).click();
    await page.waitForURL(c.landing, { timeout: 30000 });
    const tNav = Date.now() - t0;
    await page.waitForFunction(() => window.__res.h1 !== undefined, null, { timeout: 30000 });
    const res = await page.evaluate(() => window.__res);

    const landed = (path) => {
      const hit = responses.find((r) => r.t >= t0 && r.u.startsWith(path));
      return hit ? `${hit.t - t0}ms` : '—';
    };

    console.log(
      `${c.name} run${run}: urlchange=${tNav}ms  destination-h1=${res.h1}ms` +
        `  stats=${res.stats ?? '—'}ms  sign-in-wall-flash=${res.gate ?? 'none'}`,
    );
    if (c.name === 'seller') {
      console.log(`   seller/me landed ${landed('/seller/me')}   seller/dashboard landed ${landed('/seller/dashboard')}`);
    }
    console.log('   api:', api.filter((r) => r.t >= t0).map((r) => `${r.u.slice(0, 34)}@${r.t - t0}`).join('  '));
    await ctx.close();
  }
}
await browser.close();
