import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
  The shared scanner, not a local copy (2026-09-06). Every spec here
  carried the same one-line regex, and it failed open: a route pattern in
  prose ("/seller" plus a star) reads as a comment opener and swallows
  everything to the next closer. 27 files under `client/` were partly
  invisible to these scans. See `lib/testing/strip-comments.ts`.
*/
import { stripComments } from "@/lib/testing/strip-comments";

/**
 * `client/lib` is a two-package contract.
 *
 * The native app (`mobile/`) compiles these exact files through Metro —
 * it does not copy them — so a file under `lib/` may not reach for
 * anything only the web has. Four bans, each of which has already cost
 * something or was measured as about to:
 *
 * 1. **`@/components/*`** — `lib/taxonomy-actions.ts` imported
 *    `ComboboxOption` from `@/components/ui/Combobox` as an `import type`.
 *    Babel elides that, so Metro survived; `tsc` does not, and it followed
 *    the chain into a CSS module whose ambient declaration lives in
 *    `next-env.d.ts` — which is **gitignored**. On a fresh clone the app's
 *    typecheck failed on a CSS module, from a package that has neither CSS
 *    modules nor React DOM.
 * 2. **`react` / `react-dom`** — Node resolution walks up from the
 *    *requiring* file, so a shared file requiring React finds
 *    `client/node_modules/react` (Next's pin) while the app has Expo's.
 *    Two Reacts is "Invalid hook call", with a stack trace naming neither
 *    package.
 * 3. **`next`** — there is no Next in the app, and the failure mode is a
 *    Metro resolution error deep in a file nobody wrote.
 * 4. **A `@/` alias that is not `@/lib/`** — the app maps `@/lib/*` at
 *    `../client/lib/*` precisely because 151 import sites inside `lib/`
 *    are written that way. Any other `@/` prefix resolves to the app's own
 *    root and silently means something different there.
 * 5. **A DOM global** — `window`, `document`, `navigator`, `localStorage`,
 *    `sessionStorage`. This ban was written down in `CLAUDE.md` from the
 *    day the contract was, and until 2026-09-06 nothing scanned for it,
 *    which is how `gift/gift-intent.ts` passed: it reads
 *    `window.sessionStorage` and **catches its own TypeError**. On Hermes
 *    `window` exists and `sessionStorage` does not, so on a phone every
 *    read answers `EMPTY_GIFT_INTENT` and every write is discarded — in
 *    silence, from inside a module whose comments promise the opposite.
 *    A ban with no scan is a comment.
 *
 * The allowlists are registries with a stated reason per entry, so adding
 * one is a claim somebody has to write down — and every entry is asserted
 * to still exist, so a rename fails the build instead of quietly widening
 * the rule.
 *
 * Comments are stripped before scanning: this repo quotes import paths in
 * prose constantly (this file included), and a scan that counts a comment
 * as code fails in whichever direction is most confusing.
 */

const CLIENT_ROOT = join(__dirname, "..");
const LIB_ROOT = join(CLIENT_ROOT, "lib");

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".spec.ts")) found.push(full);
  }
  return found;
}


/** Every module specifier this file imports from or re-exports. */
function specifiers(source: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  const bare = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  while ((m = bare.exec(source)) !== null) out.push(m[1]);
  // Deduped: the two patterns overlap on `import type … from`, and a
  // doubled line in a failure message reads like two separate defects.
  return [...new Set(out)];
}

interface Exempt {
  path: string;
  why: string;
}

/**
 * Web-only by construction. These are React context providers and DOM
 * hooks; the app re-implements them over its own storage rather than
 * importing them, so they are not part of the shared surface.
 */
const WEB_ONLY: Exempt[] = [
  { path: join("lib", "auth", "AuthContext.tsx"), why: "React provider; the app forks it over expo-secure-store" },
  { path: join("lib", "cart", "CartContext.tsx"), why: "React provider; the app forks it over AsyncStorage" },
  { path: join("lib", "wallet", "WalletContext.tsx"), why: "React provider" },
  { path: join("lib", "wishlist", "WishlistContext.tsx"), why: "React provider" },
  { path: join("lib", "location", "LocationContext.tsx"), why: "React provider + next/navigation; the app uses expo-location" },
  { path: join("lib", "location", "server.ts"), why: "next/headers — reads the hk_loc cookie during SSR, meaningless off the web" },
  { path: join("lib", "use-pincode-lookup.ts"), why: "React hook wrapping the pure lookupPincode" },
  { path: join("lib", "useScrollActiveIntoView.ts"), why: "DOM scrolling" },
  { path: join("lib", "seo.ts"), why: "imports Metadata from next; there is no head to write on a phone" },
];

/**
 * Files that read a DOM global, and the reason each is allowed to.
 *
 * Three distinct reasons, and telling them apart is the point — an entry
 * here is a claim about what happens when the native app resolves this
 * file, not a note that the line is intentional on the web.
 *
 * **ALIASED** — Metro's `resolveRequest` redirects the specifier to
 * `mobile/src/platform/*`, so the app never compiles this file at all.
 * That is why the app does not merely *avoid* these three: with the
 * `@/lib/*` path map in place a wrong import **resolves**, and the DOM
 * read then arrives at runtime inside a file nobody in that package
 * wrote. `mobile/scripts/check-bundle.mjs` asserts both halves — the web
 * file absent from the bundle *and* the shim present — because an alias
 * that fails open has no symptom.
 *
 * **WEB-ONLY BY CONSTRUCTION** — the module's whole subject is a browser
 * capability. There is nothing to share and the app builds its own.
 *
 * **BROKEN ON HERMES** — one entry, and it is not an exemption so much as
 * a record. See `gift/gift-intent.ts` below.
 */
const DOM_GLOBALS: Exempt[] = [
  { path: join("lib", "api", "http.ts"), why: "ALIASED to mobile/src/platform/http.ts" },
  { path: join("lib", "auth", "session.ts"), why: "ALIASED to mobile/src/platform/session.ts" },
  { path: join("lib", "api", "unreachable.ts"), why: "ALIASED to mobile/src/platform/reachability.ts" },
  { path: join("lib", "focus-trap.ts"), why: "web-only: a Tab order is a DOM concept; RN traps focus differently" },
  { path: join("lib", "payments", "razorpay.ts"), why: "web-only: injects Razorpay's checkout.js into <head>; the app uses the native SDK" },
  { path: join("lib", "motion.ts"), why: "web-only: matchMedia; the app reads AccessibilityInfo.isReduceMotionEnabled()" },
  { path: join("lib", "network.ts"), why: "web-only: prefers-reduced-data + navigator.connection; the app has NetInfo" },
  {
    path: join("lib", "gift", "gift-intent.ts"),
    // NOT an exemption on the merits. `window` is defined on Hermes and
    // `sessionStorage` is not, so `window.sessionStorage.getItem` throws a
    // TypeError that this module's own catch swallows — reads answer
    // EMPTY_GIFT_INTENT, writes vanish, and the gift block looks like it
    // works. It stays blocked in `mobile/metro.config.js` and in
    // `check-bundle.mjs` so an app import is a build failure rather than
    // a silent one.
    //
    // A4 did the split it used to promise: `gift-intent-shape.ts` holds
    // the type, EMPTY_GIFT_INTENT, hasGiftIntent, the validating parse
    // and the storage key, is free of DOM globals and is **not** listed
    // here — it is what both packages import. What is left in this file
    // is the `sessionStorage` store, which is web-only by construction
    // now rather than a shared module with a hazard in it.
    why: "BROKEN ON HERMES — the store half; the shared half is gift-intent-shape.ts",
  },
];

describe("client/lib is importable by the native app", () => {
  const files = sourceFiles(LIB_ROOT);

  it("finds files to check (guards against the scan matching nothing)", () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it("every exempt file still exists, so a rename fails the build", () => {
    for (const entry of WEB_ONLY) {
      expect(files.some((file) => file.endsWith(entry.path))).toBe(true);
    }
  });

  it("never imports a component", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const spec of specifiers(source)) {
        if (spec.startsWith("@/components")) {
          offenders.push(`${file.replace(CLIENT_ROOT + "/", "")} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only ever aliases @/lib", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const spec of specifiers(source)) {
        if (spec.startsWith("@/") && !spec.startsWith("@/lib/")) {
          offenders.push(`${file.replace(CLIENT_ROOT + "/", "")} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never reads a DOM global outside the registry", () => {
    // Matched as a property/index read (`window.`, `localStorage[`) rather
    // than as a bare word: `location` and `history` are ordinary field
    // names all over this tree (`vendor.location`, `orderHistory`), and a
    // word-boundary scan reported 28 files, almost none of them real.
    //
    // A local shadowing one of these names would defeat it — which is why
    // `schedule.ts`'s `const window = DELIVERY_WINDOWS.find(...)` was
    // renamed to `slot` rather than special-cased here. The scan asks a
    // question a reader can also answer; a shadowing heuristic would fail
    // open, and this rule already spent a year failing open.
    const re = /(?<![.\w$])(window|document|navigator|localStorage|sessionStorage)\s*[.[]/g;
    const offenders: string[] = [];
    for (const file of files) {
      const relative = file.replace(CLIENT_ROOT + "/", "");
      if (DOM_GLOBALS.some((entry) => file.endsWith(entry.path))) continue;
      if (WEB_ONLY.some((entry) => file.endsWith(entry.path))) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      const found = [...new Set([...source.matchAll(re)].map((m) => m[1]))];
      if (found.length) offenders.push(`${relative} → ${found.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("every DOM-global exemption still exists, so a rename fails the build", () => {
    for (const entry of DOM_GLOBALS) {
      expect(files.some((file) => file.endsWith(entry.path))).toBe(true);
    }
  });

  it("never imports react or next outside the web-only registry", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (WEB_ONLY.some((entry) => file.endsWith(entry.path))) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      for (const spec of specifiers(source)) {
        if (spec === "react" || spec === "react-dom" || spec === "next" || spec.startsWith("next/")) {
          offenders.push(`${file.replace(CLIENT_ROOT + "/", "")} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
