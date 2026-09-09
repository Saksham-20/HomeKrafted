/**
 * The rule that decides whether a credential may be deleted.
 *
 * Written after a browser smoke test showed one page load with the API
 * unreachable wiping a valid `hk_session_v1` and telling a signed-in
 * person "You're signed out" — permanently, because the tokens that
 * would have recovered were the ones destroyed.
 */
import { ApiError } from "@/lib/api/http";
import { isSessionAnswer } from "@/lib/auth/session-answer";

describe("the server answered: the session is over", () => {
  test("401 — token revoked, expired or reused", () => {
    expect(isSessionAnswer(new ApiError(401, "UNAUTHORIZED", "no"))).toBe(true);
  });

  test("403 — refused", () => {
    expect(isSessionAnswer(new ApiError(403, "FORBIDDEN", "no"))).toBe(true);
  });
});

describe("nobody answered — the session must survive", () => {
  test("status 0 is our code for no response at all, not a refusal", () => {
    // The measured case: API unreachable, tokens still valid.
    expect(isSessionAnswer(new ApiError(0, "NETWORK_ERROR", "offline"))).toBe(false);
    expect(isSessionAnswer(new ApiError(0, "SERVER_UNREACHABLE", "we are down"))).toBe(false);
  });

  test("a 5xx is our fault, never evidence their credential is dead", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isSessionAnswer(new ApiError(status, "SERVER_ERROR", "boom"))).toBe(false);
    }
  });

  test("429 is a throttle, and throttling somebody is not signing them out", () => {
    expect(isSessionAnswer(new ApiError(429, "TOO_MANY", "slow down"))).toBe(false);
  });

  test("a 404 is not an answer about the session either", () => {
    expect(isSessionAnswer(new ApiError(404, "NOT_FOUND", "no route"))).toBe(false);
  });

  test("anything that is not an ApiError fails toward keeping them signed in", () => {
    // Costs one retry. The other direction costs somebody their account,
    // and for a HomeKrafter the way back needs SMS that is not wired.
    expect(isSessionAnswer(new TypeError("Failed to fetch"))).toBe(false);
    expect(isSessionAnswer("boom")).toBe(false);
    expect(isSessionAnswer(undefined)).toBe(false);
    expect(isSessionAnswer(null)).toBe(false);
  });
});
