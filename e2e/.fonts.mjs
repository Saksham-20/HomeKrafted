import { chromium } from '@playwright/test';
const b = await chromium.launch();
for (const r of ['/', '/shop', '/admin', '/checkout']) {
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  await page.goto(`https://homekrafted.in${r}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const rows = await page.evaluate(() => {
    const loaded = [...document.fonts].filter((f) => f.status === 'loaded')
      .map((f) => `${f.family} ${f.weight} ${f.style}`);
    const bytes = performance.getEntriesByType('resource')
      .filter((x) => /\.woff2/.test(x.name))
      .reduce((a, x) => a + (x.transferSize || 0), 0);
    return { loaded: [...new Set(loaded)].sort(), kb: Math.round(bytes / 1024) };
  });
  console.log(`\n${r}  — ${rows.kb}kB of fonts`);
  rows.loaded.forEach((l) => console.log('   ', l));
  await ctx.close();
}
await b.close();
