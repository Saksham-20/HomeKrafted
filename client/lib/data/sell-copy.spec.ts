import { sellerSteps } from "./sell";

/**
 * `/sell` must not tell an applicant the thing they are applying for is
 * unbuilt.
 *
 * **The bug this exists to catch, which shipped to production.** The
 * fourth step read *"Your storefront opens once HomeKrafter onboarding
 * launches."* That was true when written and false from M9 onward — the
 * form has posted to a real endpoint since then, M12 made every approved
 * application a full HomeKrafter, and M17/M21 gave them two ways to sign
 * in. Nothing failed. No test broke, no page 500'd, the flow worked end to
 * end when walked in a browser. The live site simply told every maker that
 * HomeKrafter onboarding had not launched, on the page where they were
 * being asked to join it — which is what "seller onboarding is not
 * working" turned out to mean.
 *
 * Copy that describes a feature's own state is the one kind of string that
 * rots into a lie rather than into noise, and the usual instruments cannot
 * see it: it is grammatical, it renders, it passes axe and it passes the
 * sweep. So it gets a test.
 *
 * This deliberately does **not** assert the wording — only that the steps
 * never claim the product is still coming. Pinning exact sentences would
 * make ordinary copy edits fail the build, which is how a test like this
 * gets deleted.
 */
describe("the /sell steps", () => {
  const text = sellerSteps.map((s) => `${s.title} ${s.description}`).join(" ");

  it("has four steps that all say something", () => {
    // Guards against the assertion below passing over an empty array —
    // the failure mode that makes a scanning test worse than none.
    expect(sellerSteps).toHaveLength(4);
    for (const step of sellerSteps) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.description.trim().length).toBeGreaterThan(0);
    }
  });

  it.each([
    ["coming soon", /coming soon/i],
    ["launches / will launch", /\blaunch(es|ing|ed)?\b/i],
    ["not yet / not available yet", /\bnot yet\b|\byet to\b/i],
    ["future / upcoming", /\b(in the )?future\b|\bupcoming\b/i],
    ["waitlist", /\bwait[- ]?list/i],
  ])("never says the product is still coming (%s)", (_label, pattern) => {
    expect(text).not.toMatch(pattern);
  });

  /**
   * The steps promised "our packaging + photography guide". There is no
   * such guide, and a step describing a deliverable nobody has written is
   * the same defect in the other direction — an applicant who says yes on
   * the strength of it has been misled.
   */
  it("does not promise a guide or a call that does not exist", () => {
    expect(text).not.toMatch(/photography guide|packaging guide/i);
    expect(text).not.toMatch(/short call|schedule a call/i);
  });
});
