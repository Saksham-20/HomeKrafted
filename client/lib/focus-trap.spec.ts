import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A dialog must not roll its own focus trap.
 *
 * **The bug this exists to catch.** CLAUDE.md (M16) says a dialog owes
 * three things — focus in, Tab trapped at both ends, focus restored to the
 * opener — and names `MobileDrawer` and `LocationPrompt` as the reference
 * implementations. Both were correct. Both also carried their own private
 * copy of the `FOCUSABLE` selector string and their own wrap arithmetic,
 * and `ReelViewer` — a full-screen video player claiming
 * `aria-modal="true"`, reachable from the home rail — had **neither**, from
 * the day it shipped until M29. It was not caught by review because the
 * markup is right: the role is right, the label is right, Escape works, and
 * a mouse never notices. Only pressing Tab finds it, and pressing Tab is
 * not something a code review does.
 *
 * Two copies of a recipe is a coincidence; three is a pattern, and the
 * failure mode is silent — a trap that gets the selector wrong lets Tab out
 * and nothing looks broken. So the recipe now lives in `lib/focus-trap.ts`
 * and this test fails the build on a fourth private copy.
 *
 * Scanned at source rather than rendered, because the client test
 * environment is `node` with no DOM — same reason and same technique as
 * `keyboard-activation.spec.ts` and `seo-titles.spec.ts`. The behavioural
 * half lives in `e2e/tests/focus-traps.spec.ts`, which actually presses
 * Tab; this half only guards against the duplication that made the miss
 * possible.
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

/** Strips comments, so prose about the selector never counts as a copy. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const files = tsxFiles(COMPONENTS_DIR).map((path) => ({
  path,
  rel: path.slice(path.indexOf("components/")),
  body: code(readFileSync(path, "utf8")),
}));

describe("the shared focus trap", () => {
  it("finds the components under test (guards against an empty scan)", () => {
    // A rule that silently matches nothing is worse than no rule. If the
    // component tree moves, this fails first and says so.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.rel.endsWith("layout/MobileDrawer.tsx"))).toBe(true);
  });

  it("is the only place the focusable-element selector is written", () => {
    // The tell is the selector's own opening: any component that needs to
    // enumerate focusable descendants has re-derived the list.
    const offenders = files
      .filter((f) => f.body.includes("a[href], button:not("))
      .map((f) => f.rel);

    expect(offenders).toEqual([]);
  });

  it("is used by every dialog that claims aria-modal", () => {
    /*
     * `aria-modal="true"` is a promise that focus is contained. A component
     * making it while importing nothing from `lib/focus-trap` is either
     * re-implementing the trap (the duplication above) or — the ReelViewer
     * case — not honouring the claim at all.
     *
     * The exception list is deliberately empty. If a dialog genuinely does
     * not need a trap, it does not need `aria-modal` either; drop the
     * attribute rather than adding a name here.
     */
    const offenders = files
      .filter((f) => /aria-modal=\{?["']?true/.test(f.body))
      .filter((f) => !f.body.includes("@/lib/focus-trap"))
      .map((f) => f.rel);

    expect(offenders).toEqual([]);
  });
});
