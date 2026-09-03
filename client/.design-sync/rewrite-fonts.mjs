// Keeps only latin/latin-ext @font-face blocks from the Google CSS, downloads
// each woff2 into fonts/, rewrites url() to a local relative path, and appends
// the --font-* variable bridge globals.css expects from next/font.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const raw = readFileSync(new URL('./fonts/.raw.css', import.meta.url), 'utf8');
const out = [];
let subset = null;
for (const part of raw.split(/\/\*\s*([a-z-]+)\s*\*\//)) {
  if (/^[a-z-]+$/.test(part) && !part.includes('@')) { subset = part; continue; }
  if (!part.includes('@font-face')) continue;
  if (subset !== 'latin' && subset !== 'latin-ext') continue;
  out.push(part.trim());
}
let css = out.join('\n');
const seen = new Map();
css = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g, (_m, url) => {
  let name = seen.get(url);
  if (!name) {
    const fam = /font-family:\s*'([^']+)'/.exec(css.slice(0, css.indexOf(url)).split('@font-face').pop() ?? '')?.[1] ?? 'font';
    name = `${fam.replace(/\s+/g, '')}-${seen.size + 1}.woff2`;
    execFileSync('curl', ['-sS', '-L', url, '-o', new URL(`./fonts/${name}`, import.meta.url).pathname]);
    seen.set(url, name);
  }
  return `url(./fonts/${name})`;
});
css += `\n/* next/font bridge: app/layout.tsx sets these on <html>; outside Next\n   they must be declared or globals.css resolves --hk-font-* to nothing. */\n:root {\n  --font-fraunces: 'Fraunces';\n  --font-plex-sans: 'IBM Plex Sans';\n  --font-plex-mono: 'IBM Plex Mono';\n}\n`;
writeFileSync(new URL('./fonts/fonts.css', import.meta.url), css);
console.log(`fonts.css: ${out.length} @font-face, ${seen.size} woff2 downloaded`);
