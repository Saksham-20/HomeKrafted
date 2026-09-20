import {
  DESTINATIONS,
  DESTINATION_OPEN,
  isDestinationOpen,
  resolveDestination,
  type DestinationAvailability,
} from "./destinations";

const ALL_OPEN: DestinationAvailability = { me: true, gift: true, isb: true };
const ONLY_ISB: DestinationAvailability = { me: false, gift: false, isb: true };
const GIFT_AND_ISB: DestinationAvailability = { me: false, gift: true, isb: true };

describe("DESTINATION_OPEN", () => {
  it("names every destination the control renders, and no other", () => {
    expect(Object.keys(DESTINATION_OPEN).sort()).toEqual([...DESTINATIONS].sort());
  });

  it("leaves something open — checkout with nothing to choose has no way to place an order", () => {
    expect(DESTINATIONS.some((destination) => DESTINATION_OPEN[destination])).toBe(true);
  });
});

describe("isDestinationOpen", () => {
  it("reads the map it is given", () => {
    expect(isDestinationOpen("me", ONLY_ISB)).toBe(false);
    expect(isDestinationOpen("isb", ONLY_ISB)).toBe(true);
  });

  it("defaults to the shipped map", () => {
    for (const destination of DESTINATIONS) {
      expect(isDestinationOpen(destination)).toBe(DESTINATION_OPEN[destination]);
    }
  });
});

describe("resolveDestination — gift checkout", () => {
  it("keeps a pick that is open", () => {
    expect(resolveDestination("isb", "gift", ONLY_ISB)).toBe("isb");
    expect(resolveDestination("gift", "gift", GIFT_AND_ISB)).toBe("gift");
  });

  it("moves a closed pick to the first open destination", () => {
    // `"me"` is what the state starts as, and `"gift"` is what the product
    // page's "Make it a gift" block sets — both closed while ISB is the
    // only door, and both must land on it.
    expect(resolveDestination("me", "gift", ONLY_ISB)).toBe("isb");
    expect(resolveDestination("gift", "gift", ONLY_ISB)).toBe("isb");
  });

  it("falls back in display order, not to the last option", () => {
    expect(resolveDestination("me", "gift", GIFT_AND_ISB)).toBe("gift");
  });

  it("with everything open, leaves the pick alone — the screen as it was before the switch", () => {
    for (const destination of DESTINATIONS) {
      expect(resolveDestination(destination, "gift", ALL_OPEN)).toBe(destination);
    }
  });
});

describe("resolveDestination — food checkout", () => {
  it("never reads as campus: that layout has no such control", () => {
    expect(resolveDestination("isb", "food", ONLY_ISB)).toBe("me");
    expect(resolveDestination("isb", "food", ALL_OPEN)).toBe("me");
  });

  it("keeps me and gift, and does not consult the gift checkout's switch", () => {
    expect(resolveDestination("me", "food", ONLY_ISB)).toBe("me");
    expect(resolveDestination("gift", "food", ONLY_ISB)).toBe("gift");
  });
});
