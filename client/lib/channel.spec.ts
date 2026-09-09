import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { CHANNEL_RULES, getChannelBadge, getChannelRule, isChannelEnabled, type ChannelKey } from "@/lib/channel";

/**
 * The channel matrix is a **product decision**, not an oversight — snacks
 * having no cart is correct, and the audit's own guardrails say so in as
 * many words. This file is what makes "fixing" it fail loudly rather than
 * ship.
 *
 * These are intentionally assertions about specific flags rather than a
 * snapshot: a snapshot would go green on `-u`, which is exactly the
 * reflex someone would reach for while "adding a checkout button to
 * snacks".
 */

const ALL: ChannelKey[] = ["marketplace", "laundry", "snacks", "full-meals"];

describe("CHANNEL_RULES", () => {
  it("covers every module, keyed by itself", () => {
    expect(Object.keys(CHANNEL_RULES).sort()).toEqual([...ALL].sort());
    for (const key of ALL) {
      expect(CHANNEL_RULES[key].key).toBe(key);
    }
  });

  it("marks laundry withdrawn and every other module live", () => {
    // M19. Asserted rather than assumed: `enabled` gates nav entries,
    // routes and the server's create endpoints, so a silent flip here
    // would quietly restore or withdraw a whole module.
    expect(isChannelEnabled("laundry")).toBe(false);
    for (const key of ALL.filter((k) => k !== "laundry")) {
      expect(isChannelEnabled(key)).toBe(true);
    }
  });

  it("gives snacks a menu but no cart and no checkout", () => {
    const snacks = getChannelRule("snacks");
    expect(snacks.hasMenuOnWeb).toBe(true);
    expect(snacks.hasCartOnWeb).toBe(false);
    expect(snacks.hasCheckoutOnWeb).toBe(false);
    expect(snacks.orderVia).toBe("whatsapp");
  });

  it("gives full meals no menu at all — the web page is promotional", () => {
    const meals = getChannelRule("full-meals");
    expect(meals.hasMenuOnWeb).toBe(false);
    expect(meals.hasCartOnWeb).toBe(false);
    expect(meals.hasCheckoutOnWeb).toBe(false);
    expect(meals.orderVia).toBe("app-only");
  });

  it("gives marketplace and laundry full web checkout", () => {
    for (const key of ["marketplace", "laundry"] as const) {
      const rule = getChannelRule(key);
      expect(rule.hasMenuOnWeb).toBe(true);
      expect(rule.hasCartOnWeb).toBe(true);
      expect(rule.hasCheckoutOnWeb).toBe(true);
    }
    expect(getChannelRule("laundry").orderVia).toBe("web-checkout-or-cod");
    expect(getChannelRule("marketplace").orderVia).toBe("web-checkout");
  });

  it("offers pre-order everywhere, including where checkout is impossible", () => {
    // The whole point of keeping the two flags apart: scheduling is
    // information, not a transaction. Collapsing them would either kill
    // snack pre-orders or reopen the cart question.
    for (const key of ALL) {
      expect(CHANNEL_RULES[key].hasPreOrderOnWeb).toBe(true);
    }
    expect(getChannelRule("snacks").hasCheckoutOnWeb).toBe(false);
    expect(getChannelRule("full-meals").hasCheckoutOnWeb).toBe(false);
  });

  it("never lets a cart exist without a checkout, or a checkout without a menu", () => {
    // A cart you cannot pay from, or a checkout for something you cannot
    // browse, is a dead end rather than a channel rule.
    for (const key of ALL) {
      const rule = CHANNEL_RULES[key];
      if (rule.hasCartOnWeb) expect(rule.hasCheckoutOnWeb).toBe(true);
      if (rule.hasCheckoutOnWeb) expect(rule.hasMenuOnWeb).toBe(true);
    }
  });

  it("keeps live tracking off the web for laundry and meals", () => {
    expect(getChannelRule("laundry").liveTracking).toBe("app-only");
    expect(getChannelRule("full-meals").liveTracking).toBe("app-only");
    expect(getChannelRule("marketplace").liveTracking).toBe("status-only");
    expect(getChannelRule("snacks").liveTracking).toBe("whatsapp-status");
  });

  it("badges the WhatsApp-only module as WhatsApp", () => {
    expect(getChannelBadge("snacks")).toEqual({
      label: "Order on WhatsApp",
      variant: "whatsapp",
    });
    // Every module needs a badge, or a card renders a blank pill.
    for (const key of ALL) {
      expect(getChannelBadge(key).label).not.toHaveLength(0);
    }
  });
});

/**
 * A flag nothing consults is decoration.
 *
 * `CHANNEL_RULES` is the enforceable form of the channel table, and the
 * rule is to read it through `isChannelEnabled` / `getChannelRule` rather
 * than by reaching into the object. `enabled` is the reason: a withdrawn
 * module keeps its rule so the types and the order history referencing it
 * still resolve, and a screen that reads `CHANNEL_RULES.laundry.hasCartOnWeb`
 * directly gets a truthful answer to the wrong question — the module is
 * off, and the cart flag is about how a *live* module behaves.
 *
 * `SnacksClient` gated its pre-order picker on
 * `CHANNEL_RULES.snacks.hasPreOrderOnWeb` while `/app-promo` read the
 * same flag through the accessor. Scanned rather than asserted on
 * behaviour, because the defect is which spelling is used, not what it
 * evaluates to.
 */
describe("consumer screens read channel flags through the accessors", () => {
  const ROOT = join(__dirname, "..");

  function sources(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) found.push(...sources(full));
      else if (/\.tsx?$/.test(entry) && !entry.endsWith(".spec.ts")) found.push(full);
    }
    return found;
  }

  /**
   * `lib/channel.ts` defines the object and `lib/data/*` seeds fixtures
   * from it; both are allowed to name it. Every other file is a consumer.
   */
  const ALLOWED = [join("lib", "channel.ts")];

  it("nothing outside lib/channel.ts reaches into CHANNEL_RULES", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of sources(join(ROOT, dir))) {
        if (ALLOWED.some((allowed) => file.endsWith(allowed))) continue;
        const source = readFileSync(file, "utf8")
          // Comments stripped — this repo quotes flag names in prose
          // constantly, and a scan that counts prose as code fails on the
          // paragraph explaining the rule.
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        if (/CHANNEL_RULES\s*[.[]/.test(source)) {
          offenders.push(file.replace(`${ROOT}/`, ""));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
