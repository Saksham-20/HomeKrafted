import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const svg = readFileSync(process.argv[2], "utf8");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1381, height: 789 }, deviceScaleFactor: 1 });
await p.setContent(`<body style="margin:0;background:#F4F3F0">${svg}</body>`);
await p.screenshot({ path: process.argv[3] });
await b.close();
console.log("rendered", process.argv[3]);
