import {
  businessNameError,
  contactNameError,
  emailError,
  fssaiError,
  instagramError,
  phoneError,
  websiteError,
} from "./application-fields";

/**
 * The rules that would have stopped two of production's storefronts being
 * called `jashanpreetsingh3105@gmail.com` and `Abc`.
 *
 * The other half of what is asserted here is the direction of the mirror
 * (M17's rule for the identifier parsers): this file must stay **looser**
 * than the server's copy. A false positive costs one request and a clear
 * message; a false negative strands a real applicant at a dead button
 * with valid details typed in.
 */
describe("business name", () => {
  it("rejects an email, which is what autofill actually puts there", () => {
    expect(businessNameError("jashanpreetsingh3105@gmail.com")).toMatch(/email/i);
  });

  it("rejects a phone number", () => {
    expect(businessNameError("98450 12345")).toMatch(/phone/i);
    expect(businessNameError("+91-98450-12345")).toMatch(/phone/i);
  });

  it("rejects two characters of nothing", () => {
    expect(businessNameError("A")).toBeTruthy();
    expect(businessNameError("...")).toBeTruthy();
    expect(businessNameError("12")).toBeTruthy();
  });

  it("accepts the names real kitchens actually have", () => {
    for (const name of [
      "Abc",
      "Anjali's Kitchen",
      "Terracotta & Thread",
      "The Slow Studio",
      "Maati & Thread",
      "3 Bakers Co.",
      "मिट्टी",
    ]) {
      expect(businessNameError(name)).toBeNull();
    }
  });

  it("says nothing about an empty box — that is the submit button's job", () => {
    expect(businessNameError("")).toBeNull();
    expect(businessNameError("   ")).toBeNull();
  });
});

describe("contact name", () => {
  it("rejects an email and a bare number", () => {
    expect(contactNameError("ila@example.com")).toBeTruthy();
    expect(contactNameError("99")).toBeTruthy();
  });

  it("accepts a one-word name", () => {
    expect(contactNameError("Ila")).toBeNull();
  });
});

describe("email", () => {
  it("accepts what a mailbox actually looks like", () => {
    expect(emailError("ila@example.com")).toBeNull();
    expect(emailError("ila.m+shop@mail.co.in")).toBeNull();
  });

  it("rejects an address with no domain dot", () => {
    expect(emailError("ila@localhost")).toBeTruthy();
    expect(emailError("ila.example.com")).toBeTruthy();
  });
});

describe("phone", () => {
  it("accepts the shapes people type", () => {
    for (const value of ["9845012345", "98450 12345", "+91 98450 12345", "+919845012345"]) {
      expect(phoneError(value)).toBeNull();
    }
  });

  it("rejects something nobody can ring", () => {
    expect(phoneError("x")).toBeTruthy();
    expect(phoneError("98450")).toBeTruthy();
  });
});

describe("fssai", () => {
  it("wants fourteen digits, spaces and all", () => {
    expect(fssaiError("12345678901234")).toBeNull();
    expect(fssaiError("1234 5678 9012 34")).toBeNull();
    expect(fssaiError("1234")).toBeTruthy();
  });

  it("is silent when they have not got one", () => {
    expect(fssaiError("")).toBeNull();
  });
});

describe("links", () => {
  it("takes an Instagram handle the way it is written down", () => {
    expect(instagramError("@your.kitchen")).toBeNull();
    expect(instagramError("your_kitchen")).toBeNull();
    expect(instagramError("https://instagram.com/your.kitchen")).toBeNull();
    expect(instagramError("instagram.com/your.kitchen")).toBeNull();
  });

  it("rejects a handle with characters Instagram does not allow", () => {
    expect(instagramError("your kitchen")).toBeTruthy();
  });

  it("takes a website with or without a protocol", () => {
    expect(websiteError("yourshop.com")).toBeNull();
    expect(websiteError("https://yourshop.com/store")).toBeNull();
  });

  it("rejects a hostname with no dot, which is a typo rather than a shop", () => {
    expect(websiteError("yourshop")).toBeTruthy();
  });
});
