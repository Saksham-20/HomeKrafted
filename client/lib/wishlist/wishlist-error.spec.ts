import { wishlistErrorMessage } from "@/lib/wishlist/wishlist-error";

/**
 * The heart is a write, and a write that refuses has to say so. Until
 * 2026-09-06 a refused press did nothing and said nothing, which reads as
 * a broken control rather than as a refusal.
 */
describe("wishlistErrorMessage", () => {
  it("names signing in, because that is the commonest refusal", () => {
    // Auth is asked for at the point of a write, so a signed-out visitor
    // pressing a heart is the normal path, not an edge case.
    expect(wishlistErrorMessage({ status: 401 })).toBe("Sign in to save things you like.");
  });

  it("says a delisted listing is gone rather than blaming the press", () => {
    expect(wishlistErrorMessage({ status: 404 })).toBe("This listing isn't available any more.");
  });

  it("keeps the two-code unreachable taxonomy's own sentence", () => {
    // Status 0 carries "you are offline" or "we are having trouble" from
    // `unreachable.ts`, and which one it is matters — never tell somebody
    // to check a connection that is working.
    const offline = Object.assign(new Error("You appear to be offline."), { status: 0 });
    expect(wishlistErrorMessage(offline)).toBe("You appear to be offline.");
  });

  it("falls back without ever answering undefined", () => {
    // A mutation that reports nothing has discarded the only explanation
    // anybody was going to get (the M36 rule).
    for (const err of [undefined, null, {}, new Error(""), "a string"]) {
      expect(wishlistErrorMessage(err)).toBeTruthy();
    }
  });

  it("passes a server sentence through rather than replacing it", () => {
    expect(wishlistErrorMessage(Object.assign(new Error("Wishlist is full."), { status: 400 }))).toBe(
      "Wishlist is full.",
    );
  });
});
