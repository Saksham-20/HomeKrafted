import {
  resolveCanonicalListingState,
  getCanonicalStateBadge,
  canTransitionListingState,
} from "./canonical-listing";

describe("canonical-listing", () => {
  describe("resolveCanonicalListingState", () => {
    it("identifies drafts", () => {
      expect(resolveCanonicalListingState({ isDraft: true })).toBe("draft");
    });

    it("identifies pending/submitted listings", () => {
      expect(resolveCanonicalListingState({ moderationStatus: "pending" })).toBe("submitted");
      expect(resolveCanonicalListingState({ moderationStatus: "submitted" })).toBe("submitted");
    });

    it("identifies rejected and flagged listings", () => {
      expect(resolveCanonicalListingState({ moderationStatus: "rejected" })).toBe("rejected");
      expect(resolveCanonicalListingState({ moderationStatus: "flagged" })).toBe("changes_requested");
    });

    it("identifies archived listings", () => {
      expect(resolveCanonicalListingState({ moderationStatus: "hidden" })).toBe("archived");
    });

    it("identifies paused listings when isAvailable is false", () => {
      expect(
        resolveCanonicalListingState({
          moderationStatus: "active",
          isAvailable: false,
          stock: 10,
        }),
      ).toBe("paused");
    });

    it("identifies out_of_stock listings when stock is 0", () => {
      expect(
        resolveCanonicalListingState({
          moderationStatus: "active",
          isAvailable: true,
          stock: 0,
        }),
      ).toBe("out_of_stock");

      expect(
        resolveCanonicalListingState({
          moderationStatus: "active",
          isAvailable: true,
          weightOptions: [{ stock: 0 }, { stock: 0 }],
        }),
      ).toBe("out_of_stock");
    });

    it("identifies live listings when active, available, and in stock", () => {
      expect(
        resolveCanonicalListingState({
          moderationStatus: "active",
          isAvailable: true,
          stock: 10,
        }),
      ).toBe("live");

      expect(
        resolveCanonicalListingState({
          moderationStatus: "active",
          isAvailable: true,
          weightOptions: [{ stock: 5 }],
        }),
      ).toBe("live");
    });
  });

  describe("getCanonicalStateBadge", () => {
    it("returns appropriate badge metadata for each state", () => {
      expect(getCanonicalStateBadge("live").variant).toBe("success");
      expect(getCanonicalStateBadge("submitted").variant).toBe("warning");
      expect(getCanonicalStateBadge("out_of_stock").variant).toBe("error");
      expect(getCanonicalStateBadge("paused").variant).toBe("neutral");
    });
  });

  describe("canTransitionListingState", () => {
    it("permits legal transitions", () => {
      expect(canTransitionListingState("draft", "submitted")).toBe(true);
      expect(canTransitionListingState("submitted", "approved")).toBe(true);
      expect(canTransitionListingState("submitted", "changes_requested")).toBe(true);
      expect(canTransitionListingState("live", "paused")).toBe(true);
      expect(canTransitionListingState("paused", "live")).toBe(true);
    });

    it("rejects illegal transitions", () => {
      expect(canTransitionListingState("draft", "live")).toBe(false);
      expect(canTransitionListingState("rejected", "live")).toBe(false);
    });
  });
});

