import { chromium } from '@playwright/test';
const routes = ['/', '/shop', '/product/mango-avakaya-pickle', '/login', '/seller', '/admin'];
const b = await chromium.launch();
console.log('route                              LCPish   js(tx)  css(tx) font(tx) img(tx)  total(tx)  js(raw)');
for (const r of routes) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`https://homekrafted.in${r}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500); // let hydration-time chunks land, before prefetch storms matter
  const m = await page.evaluate(() => {
    const e = performance.getEntriesByType('resource');
    const bucket = { js: [0, 0], css: [0, 0], font: [0, 0], img: [0, 0], other: [0, 0] };
    for (const x of e) {
      // ignore RSC prefetches of other routes — they are not this page's cost
      if (x.name.includes('_rsc=')) continue;
      const k = /\.js(\?|$)/.test(x.name) ? 'js' : /\.css(\?|$)/.test(x.name) ? 'css'
        : /\.(woff2?|ttf)(\?|$)/.test(x.name) ? 'font'
        : /\.(png|jpe?g|webp|avif|svg|gif)|_next\/image/.test(x.name) ? 'img' : 'other';
      bucket[k][0] += x.transferSize || 0;
      bucket[k][1] += x.decodedBodySize || 0;
    }
    const paint = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
    return { bucket, fcp: Math.round(paint?.startTime ?? 0) };
  });
  const kb = (n) => (n / 1024).toFixed(0).padStart(6);
  const b2 = m.bucket;
  const tx = Object.values(b2).reduce((a, c) => a + c[0], 0);
  console.log(`${r.padEnd(34)} ${String(m.fcp).padStart(5)}ms ${kb(b2.js[0])} ${kb(b2.css[0])} ${kb(b2.font[0])} ${kb(b2.img[0])} ${kb(tx)}kB ${kb(b2.js[1])}`);
  await ctx.close();
}
await b.close();
