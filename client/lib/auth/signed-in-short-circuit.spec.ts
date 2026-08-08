import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A sign-up must not skip its own confirmation step.
 *
 * **The bug this exists to catch**, found by driving the deployed site
 * rather than by any check that runs here. `LoginClient` renders an
 * "you're already signed in" card when `ready && isSignedIn`, and returns
 * early to do it. Signing *up* also signs you in — that is the whole
 * point — so the moment `POST /auth/continue` came back with a new
 * account, that early return fired and the confirm-your-contact step
 * below it became unreachable code. The account was created correctly,
 * the session was correct, and the step simply never appeared.
 *
 * Both halves were individually right, which is why nothing caught it:
 * the early return is correct for a visitor who arrives already signed
 * in, and the code step is correct for a visitor who just signed up. Only
 * their order was wrong.
 *
 * The rule is that the short-circuit has to exclude the just-created
 * case. Scanned at source rather than rendered — the client test
 * environment is `node` with no DOM. Same technique as
 * `silent-failure.spec.ts` and `keyboard-activation.spec.ts`.
 */

const LOGIN_CLIENT = join(__dirname, "..", "..", "components", "auth", "LoginClient.tsx");

describe("the already-signed-in short circuit", () => {
  const source = readFileSync(LOGIN_CLIENT, "utf8");

  it("does not fire for an account that was just created", () => {
    // Matches `if (ready && isSignedIn ...)` and requires the guard in the
    // same condition. Deliberately coarse: any rename of `justCreated`
    // should fail here and be re-read, because whatever replaces it still
    // has to answer "why does signing up not land on this card".
    const shortCircuit = source.match(/if \(\s*ready && isSignedIn[^)]*\)/);

    expect(shortCircuit).not.toBeNull();
    expect(shortCircuit![0]).toMatch(/!justCreated/);
  });

  it("still has a code step for it to fall through to", () => {
    // If the step were removed the guard above would be dead weight and
    // pass forever, so assert the thing it protects actually exists.
    expect(source).toMatch(/step === "code"/);
    expect(source).toMatch(/setStep\("code"\)/);
  });

  it("keeps a way out of the confirmation step", () => {
    // The step is not a gate — the account already works and codes cannot
    // be delivered until the providers have keys. Losing this link would
    // turn a non-blocking prompt into a dead end.
    expect(source).toMatch(/I&rsquo;ll do this later|I'll do this later/);
  });
});
