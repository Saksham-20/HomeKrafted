import { CHANNEL_RULES, getChannelBadge, getChannelRule, type ChannelKey } from "@/lib/channel";

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
