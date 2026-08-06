import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Anything that claims to be a button must answer to a keyboard.
 *
 * **The bug this exists to catch.** `ProductCard` was a
 * `<div role="button" tabIndex={0} onClick={...}>` — the prototype's
 * div+onClick technique, kept deliberately so the wishlist and add buttons
 * would not nest inside an `<a>`. The reasoning was sound and the result
 * was still broken: React's `onClick` on a div does **not** fire for Enter
 * or Space, and nothing supplied an `onKeyDown`. So every product card on
 * every grid — shop, gifts, storefront, home rails, occasion pages — was
 * focusable and could not be activated. A keyboard-only user could tab
 * through the entire catalogue and open nothing.
 *
 * It survived review because it is invisible three ways: the element is
 * focusable so it looks reachable, `role="button"` makes an audit tool
 * report a button, and every mouse test passes. Only pressing Enter finds
 * it, and pressing Enter is not something a code review does.
 *
 * Scanned at source rather than rendered, because the client test
 * environment is `node` with no DOM — the same reason and the same
 * technique as `seo-titles.spec.ts`. The fix `ProductCard` took (a real
 * stretched `<Link>`) is better than adding a key handler, and this rule
 * permits either: a component that carries no `role="button"` never
 * matches.
 */

const COMPONENTS_DIR = join(__dirname, "..", "components");

function tsxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

describe("a div that claims to be a button", () => {
  const files = tsxFiles(COMPONENTS_DIR);

  it("finds components to check (guards against the scan silently matching nothing)", () => {
    // Without this, a broken path would make every assertion below pass by
    // examining zero files — the failure mode that makes a scanning test
    // worse than no test.
    expect(files.length).toBeGreaterThan(50);
  });

  it("always handles Enter and Space itself", () => {
    const offenders: string[] = [];

    for (const file of files) {
      // Comments are stripped first. Without it the scan flags prose:
      // `ProductGridCard`'s comment *explaining* this very bug quotes
      // `role="button"`, and a test that fails on a file for describing
      // the problem it fixed is a test people delete.
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      // `role="button"` written as a literal, or conditionally as
      // `? "button" :` — ProductCard used the second form.
      const claimsButton = /role=\{?\s*["']button["']/.test(source) || /\?\s*["']button["']\s*:/.test(source);
      if (!claimsButton) continue;

      // A real `<button>` elsewhere in the file is irrelevant; what matters
      // is that the file wires up key handling for the div that is
      // pretending to be one.
      if (!/onKeyDown/.test(source)) {
        offenders.push(file.replace(join(__dirname, "..") + "/", ""));
      }
    }

    expect(offenders).toEqual([]);
  });
});
