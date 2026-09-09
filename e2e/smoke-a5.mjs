/**
 * Account-surface smoke test: does every screen tell the truth when the
 * API stops answering?
 *
 * Run it against a production build (`cd client && npm run build && npx
 * next start -p 3000`) with the API on :4000 and a consumer account you
 * do not mind writing to:
 *
 *   node smoke-a5.mjs you@example.com [password]
 *
 * **Serve on :3000.** `CLIENT_ORIGIN` on the server is that exact
 * origin, and a different port is a CORS failure the app correctly
 * reports as "we are not responding" — which looks like a defect and is
 * not one.
 *
 * The failure half blocks `localhost:4000` **at the browser** rather than
 * killing the process: the app sees the same rejected fetch (status 0),
 * the web server stays up so the reachability probe still answers — which
 * is what makes the classification say "we are broken" instead of "you
 * are offline" — and nothing has to be torn down and restarted.
 *
 * It asks three questions of each screen, and each is a defect this
 * codebase has shipped more than once:
 *
 *   1. does it settle at all, or wait on a loading line for ever?
 *   2. does it say what went wrong, and name the right party?
 *   3. does it avoid the empty state — "your cart is empty", "nothing
 *      saved yet", "you dont have a meal plan yet", a zero balance — over
 *      data it simply could not read?
 *
 * Written 2026-09-06. On its first run it found four: a destroyed session
 * (`AuthContext` cleared a valid refresh token on an unanswered read), an
 * uncaught `getServerCart()` on every page, a subscriptions screen that
 * hung on its own failure branch, and a zero wallet balance quoted at
 * checkout from a read that never happened.
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.argv[2];
const PASS = process.argv[3] ?? "SmokeTest123!";

if (!EMAIL) {
  console.error("usage: node smoke-a5.mjs <email> [password]");
  process.exit(2);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

// ---- sign in -------------------------------------------------------
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
const cont = page.getByRole("button", { name: /^continue$/i }).first();
// The button is gated on `guessIdentifierKind`, so it only enables once
// React has hydrated AND seen the typed identifier. Filling before
// hydration types into a DOM node nothing is listening to.
await cont.waitFor({ state: "visible" });
await page.locator('input[type="text"]').first().pressSequentially(EMAIL, { delay: 8 });
await page.locator('input[type="password"]').first().pressSequentially(PASS, { delay: 8 });
await cont.waitFor({ state: "attached" });
await page.waitForFunction(
  () => [...document.querySelectorAll("button")].some((b) => /continue/i.test(b.innerText) && !b.disabled),
  { timeout: 15000 },
);
await cont.click();
await page.waitForTimeout(3500);
const signedIn = !page.url().includes("/login");
check("sign in", signedIn, page.url());
if (!signedIn) {
  console.log(await page.locator("body").innerText().then((t) => t.slice(0, 400)));
  await browser.close();
  process.exit(1);
}

const ROUTES = [
  "/cart",
  "/account",
  "/account/profile",
  "/account/wishlist",
  "/account/following",
  "/account/reviews",
  "/account/notifications",
  "/account/referrals",
  "/account/subscriptions",
  "/wallet",
];

async function visit(path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

// ---- happy path ----------------------------------------------------
console.log("\n=== API UP: every screen settles, nothing hangs ===");
const HANG = /Loading|Checking|Warming|…$/;
for (const path of ROUTES) {
  const text = await visit(path);
  const stuck = /Loading your|Checking today|Loading…/.test(text);
  check(`${path} settles`, !stuck, stuck ? text.slice(0, 120) : "");
}

const walletText = await visit("/wallet");
check("wallet shows a real balance", /₹/.test(walletText), walletText.slice(0, 100));
const refText = await visit("/account/referrals");
check("referral code rendered", /A5250/.test(refText));

// ---- failure path: kill the API ------------------------------------
console.log("\n=== API DOWN: does every screen name the right party? ===");
// Blocked at the browser rather than by killing the process: it is the
// same thing the app sees (a rejected fetch, `status: 0`), it leaves the
// web server up so the reachability probe still answers — which is what
// makes the classification say "we are broken", not "you are offline" —
// and it does not require tearing down the servers this run needs.
await page.route("**://localhost:4000/**", (route) => route.abort("connectionrefused"));
await page.waitForTimeout(500);

const EXPECT = {
  "/cart": /couldn.t open your cart|try again/i,
  "/account/wishlist": /couldn.t|could not|try again/i,
  "/account/following": /that.s on us|try again/i,
  "/account/reviews": /that.s on us|try again|couldn.t/i,
  "/account/notifications": /couldn.t|could not|try again/i,
  "/account/referrals": /couldn.t|could not|try again/i,
  "/account/subscriptions": /couldn.t|could not|try again/i,
  "/wallet": /couldn.t|could not|try again/i,
};
const FORBIDDEN = {
  "/cart": /your cart is empty/i,
  "/account/wishlist": /nothing saved yet/i,
  "/account/subscriptions": /don.t have a meal plan yet/i,
  "/account/following": /aren.t following/i,
  "/wallet": /₹0(?!\d)/,
};

for (const [path, expect] of Object.entries(EXPECT)) {
  const text = await visit(path);
  const stuck = /Loading your|Checking today|Loading…/.test(text);
  check(`${path} does not hang`, !stuck);
  check(`${path} explains the failure`, expect.test(text), expect.test(text) ? "" : text.slice(0, 200));
  const bad = FORBIDDEN[path];
  if (bad) check(`${path} does NOT show the empty/zero state`, !bad.test(text), bad.test(text) ? text.slice(0, 160) : "");
}

console.log("\n=== console errors ===");
const real = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource/i.test(e));
console.log(real.length ? real.slice(0, 8).join("\n") : "none");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
