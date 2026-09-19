import { crossTabAction } from "@/lib/auth/cross-tab";

describe("another tab changed the session", () => {
  test("a sign-out elsewhere signs this tab out", () => {
    expect(crossTabAction(null, "u1")).toBe("sign-out");
  });

  test("...and it is harmless in a tab that was not signed in", () => {
    expect(crossTabAction(null, undefined)).toBe("sign-out");
  });

  test("a token rotation for the same account is not news", () => {
    // Every fifteen minutes, in every tab. Doing anything here would remount
    // the interface on a timer.
    expect(crossTabAction({ user: { id: "u1" } }, "u1")).toBe("none");
  });

  test("a different account signing in re-restores this tab rather than mixing two people", () => {
    expect(crossTabAction({ user: { id: "u2" } }, "u1")).toBe("re-restore");
  });

  test("a tab that is signed out leaves a sign-in elsewhere alone", () => {
    expect(crossTabAction({ user: { id: "u2" } }, undefined)).toBe("none");
  });
});
