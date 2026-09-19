import { getAutoReply } from "./autoReply";

describe("getAutoReply and the wallet", () => {
  it("answers a wallet question without mentioning cashback", () => {
    // The reply used to say "cashback and refunds show up there as credit
    // lines". Order cashback was removed on 2026-09-19.
    const reply = getAutoReply("Where can I see my wallet balance?");
    expect(reply).toMatch(/Wallet/);
    expect(reply).not.toMatch(/cashback/i);
  });

  it("no longer treats the word cashback as a wallet keyword", () => {
    // Somebody asking after a legacy cashback credit deserves a person, not
    // a canned line describing a feature that is gone — so it falls through
    // to the "our team will follow up" reply.
    expect(getAutoReply("where is my cashback")).toBe(getAutoReply("zzz no keyword here"));
  });
});
