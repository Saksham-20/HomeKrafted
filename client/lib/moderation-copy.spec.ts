import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { moderationNotice, moderationPill } from "./moderation-copy";
import type { ProductModerationStatus } from "@/lib/types";

/**
 * One vocabulary for a listing's review state.
 *
 * **The bug this exists to catch.** A HomeKrafter added their first snack
 * and `/seller/menu` showed a green **AVAILABLE** pill and nothing else —
 * the row read `Snack.available` (their own switch) and never
 * `moderationStatus` (the admin's), so an item no buyer could see was
 * presented as live. Reported from the live site.
 *
 * Underneath it was a drift problem. `moderationNotice` was extracted in
 * M27 precisely so the four states could not grow two phrasings, and by
 * then `/seller/listings` had a private `reviewState()`, `/seller/meal-plans`
 * a private `MODERATION_LABEL` saying "Waiting for review", and
 * `/seller/menu` nothing at all. Three list rows, three answers to one
 * question, one of them silence — none of which fails a build, renders
 * wrong, or trips axe.
 */
describe("moderationPill", () => {
  const ALL: ProductModerationStatus[] = ["pending", "active", "rejected", "hidden", "flagged"];

  it("says nothing for a live listing", () => {
    expect(moderationPill("active")).toBeNull();
    // Pre-M22 rows have no status at all and are live by definition; a
    // badge here would brand the entire existing catalogue as unreviewed.
    expect(moderationPill(undefined)).toBeNull();
  });

  it.each(ALL.filter((s) => s !== "active"))("labels %s", (status) => {
    const pill = moderationPill(status);
    expect(pill).not.toBeNull();
    expect(pill!.label.trim().length).toBeGreaterThan(0);
    // A pill sits in a row beside a price and two icon buttons. A sentence
    // here wraps the row; the sentence belongs in the editor.
    expect(pill!.label.length).toBeLessThanOrEqual(24);
  });

  /**
   * `pending` must not look like a refusal. "We have not looked yet" and
   * "we looked and you must change something" are different situations, and
   * one colour for both tells a kitchen off for having listed something.
   */
  it("separates waiting-on-us from needs-your-attention", () => {
    expect(moderationPill("pending")!.tone).toBe("pending");
    for (const status of ["rejected", "hidden", "flagged"] as const) {
      expect(moderationPill(status)!.tone).toBe("attention");
    }
  });

  /** The row and the editor it links to must not name the state differently. */
  it("agrees with the long form on every state", () => {
    for (const status of ALL) {
      const pill = moderationPill(status);
      const notice = moderationNotice(status, undefined);
      expect(Boolean(pill)).toBe(Boolean(notice));
      expect(pill?.tone).toBe(notice?.tone);
    }
    expect(moderationPill("pending")!.label).toBe("Waiting for approval");
    expect(moderationNotice("pending", undefined)!.text).toMatch(/^Waiting for approval\b/);
  });

  /**
   * Never paraphrase the reason. It is the only thing telling a HomeKrafter
   * what to change (M22), so it passes through verbatim and is never
   * shortened into the pill.
   */
  it("quotes the admin's reason verbatim, and keeps it out of the pill", () => {
    const note = "the photo is too dark to see the jar";
    expect(moderationNotice("rejected", note)!.text).toContain(note);
    expect(moderationNotice("hidden", note)!.text).toContain(note);
    expect(moderationPill("rejected")!.label).not.toContain(note);
  });
});

/**
 * Scanned at source, because the failure is a *second copy* rather than a
 * wrong value — nothing an assertion on this module's return can see. Same
 * technique and same reason as `keyboard-activation.spec.ts`: the client
 * test environment is `node`, with no DOM to render into.
 */
describe("the seller list rows", () => {
  const DIR = join(__dirname, "..", "components", "seller");
  const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

  it("finds components to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("do not keep their own copy of the state vocabulary", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(join(DIR, file), "utf8")
        // Comments first, or this flags the files that *explain* the rule.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

      // The state labels, as literals. Any of these in a component means a
      // fourth phrasing is being born; import `moderationPill` instead.
      if (/["'`]\s*(Waiting for (approval|review)|Needs a change|Hidden by us)/i.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
