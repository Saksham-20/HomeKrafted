import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "@/lib/testing/strip-comments";
import { ICON_BODIES } from "./icon-bodies.generated";
import { FALLBACK_ICON_ID, ICON_GROUPS, ICON_IDS, isCraftIconId } from "./registry";

/**
 * The icon registry and what is actually committed must agree (G3 §6).
 *
 * `scripts/build-icons.mjs` is a script somebody has to remember to run,
 * and the failure when they don't is **silent**: an id nobody generated a
 * body for falls back to the wrapped gift, so a department tile renders
 * something plausible instead of nothing. That is the shape this repo has
 * been bitten by repeatedly — a guard that fails open. So the build fails
 * instead.
 *
 * It also reads `CraftIcon.tsx` as text rather than importing it, because
 * that file is React and this one lives under `lib/`. The scan strips
 * comments with the shared state machine first: this repo quotes ids in
 * prose constantly, and a regex that counts a comment as code is the
 * other direction of the same fail-open bug.
 */
const CRAFT_SOURCE = stripComments(
  readFileSync(join(process.cwd(), "components", "ui", "icons", "CraftIcon.tsx"), "utf8"),
);

/** The `craft:*` keys `CRAFT_BY_ID` can actually draw. */
const drawableCraftIds = new Set(
  [...CRAFT_SOURCE.matchAll(/"(craft:[a-z0-9-]+)":/g)].map((match) => match[1]),
);

const craftIds = ICON_IDS.filter(isCraftIconId);
const generatedIds = ICON_IDS.filter((id) => !isCraftIconId(id));

describe("the registry and the committed bodies agree", () => {
  it("has something to check", () => {
    expect(ICON_IDS.length).toBeGreaterThan(30);
    expect(generatedIds.length).toBeGreaterThan(20);
    expect(craftIds.length).toBeGreaterThan(5);
  });

  it("generated a body for every monoline id in the registry", () => {
    const missing = generatedIds.filter((id) => !ICON_BODIES[id]);
    // Re-run: node scripts/build-icons.mjs
    expect(missing).toEqual([]);
  });

  it("committed nothing the registry does not offer", () => {
    // An orphan is an id somebody deleted from the registry without
    // re-running the script — dead weight in every page's payload.
    const orphans = Object.keys(ICON_BODIES).filter((id) => !ICON_IDS.includes(id));
    expect(orphans).toEqual([]);
  });

  it("can draw every hand-drawn id it offers", () => {
    const undrawable = craftIds.filter((id) => !drawableCraftIds.has(id));
    expect(undrawable).toEqual([]);
  });

  it("offers every hand-drawn mark that exists", () => {
    // The other direction: a mark drawn and never listed is one no admin
    // can pick, which is the same as not having drawn it.
    const unlisted = [...drawableCraftIds].filter((id) => !craftIds.includes(id));
    expect(unlisted).toEqual([]);
  });

  it("can draw the fallback", () => {
    expect(isCraftIconId(FALLBACK_ICON_ID)).toBe(true);
    expect(drawableCraftIds.has(FALLBACK_ICON_ID)).toBe(true);
  });

  it("lists no id twice", () => {
    expect(new Set(ICON_IDS).size).toBe(ICON_IDS.length);
  });

  it("labels every id", () => {
    for (const group of ICON_GROUPS) {
      for (const icon of group.icons) {
        expect(icon.label.length).toBeGreaterThan(2);
      }
    }
  });
});

describe("a committed body is inert", () => {
  /**
   * `Icon.tsx` writes these through `dangerouslySetInnerHTML`, which is
   * safe only because the input is a build-time constant from a file in
   * the repo. This is what keeps that true: an upstream set that started
   * shipping a script, a remote reference or an inline handler would
   * otherwise reach the page on the next `npm update`.
   */
  const bodies = Object.entries(ICON_BODIES);

  it.each(bodies)("%s carries no script, link or handler", (_id, icon) => {
    expect(icon.body).not.toMatch(/<script/i);
    expect(icon.body).not.toMatch(/\bhref=/i);
    expect(icon.body).not.toMatch(/\bxlink:/i);
    expect(icon.body).not.toMatch(/\bon[a-z]+=/i);
    expect(icon.body).not.toMatch(/javascript:/i);
  });

  it.each(bodies)("%s draws in the caller's colour", (_id, icon) => {
    // A hardcoded hex would ignore the `color` its surface sets — and on a
    // tinted tile that is the difference between clearing the 3:1
    // non-text floor and not.
    expect(icon.body).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it.each(bodies)("%s states a viewBox", (_id, icon) => {
    expect(icon.viewBox).toMatch(/^[\d.\-\s]+$/);
  });
});
