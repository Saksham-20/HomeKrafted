import { guessIdentifierKind } from "./identifier";

/**
 * The client's advisory read of the one sign-in box.
 *
 * The property that matters is the **direction** it is allowed to be
 * wrong in. This decides whether the Continue button is enabled, so a
 * false negative strands somebody at a dead button with a perfectly valid
 * number typed in and nothing to fix — while a false positive costs one
 * request and a clear 400 from the server, which is the authority.
 *
 * So these tests are mostly about not being too clever. Anything the
 * server would accept has to enable the button here.
 */
describe("guessIdentifierKind", () => {
  it("recognises how an Indian mobile number is actually typed", () => {
    // No `+91`. This is the common case and the one that must not break:
    // the server defaults the region to IN for exactly this reason.
    expect(guessIdentifierKind("9845012345")).toBe("phone");
    expect(guessIdentifierKind("98450 12345")).toBe("phone");
    expect(guessIdentifierKind("98450-12345")).toBe("phone");
    expect(guessIdentifierKind("+91 98450 12345")).toBe("phone");
    expect(guessIdentifierKind("098450 12345")).toBe("phone");
  });

  it("recognises an email once it is plausibly complete", () => {
    expect(guessIdentifierKind("cook@kitchen.com")).toBe("email");
    expect(guessIdentifierKind("first.last+tag@example.co.in")).toBe("email");
    expect(guessIdentifierKind("  COOK@Kitchen.com  ")).toBe("email");
  });

  it("stays undecided while something is still being typed", () => {
    // Each of these is a real keystroke on the way to a valid value. The
    // button being disabled here is correct; an error message would not be.
    expect(guessIdentifierKind("")).toBeNull();
    expect(guessIdentifierKind("98")).toBeNull();
    expect(guessIdentifierKind("cook@")).toBeNull();
    expect(guessIdentifierKind("cook@kitchen")).toBeNull();
  });

  it("treats anything with an @ as an email attempt, never a number", () => {
    // An `@` cannot occur in a phone number, so the digit path must not
    // get a look at it — otherwise a typo'd address is reported as a bad
    // mobile number.
    expect(guessIdentifierKind("9845012345@")).toBeNull();
  });

  it("refuses a digit string that is too short or too long to be a number", () => {
    expect(guessIdentifierKind("12345")).toBeNull();
    expect(guessIdentifierKind("1234567890123456")).toBeNull();
  });

  it("does not accept prose as either", () => {
    expect(guessIdentifierKind("my email")).toBeNull();
    expect(guessIdentifierKind("who knows")).toBeNull();
  });
});
