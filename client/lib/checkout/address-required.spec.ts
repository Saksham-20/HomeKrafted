import {
  REQUIRED_ADDRESS_FIELDS,
  addressMissingMessage,
  firstMissingAddressFieldId,
  listAddressFields,
  missingAddressFields,
  recipientMissingMessage,
  type RequiredAddressInput,
} from "./address-required";

/**
 * Regression: ISSUE-002 — checkout's "Save address" refused silently
 * Found by /qa on 2026-09-17
 * Report: .gstack/qa-reports/qa-report-localhost-2026-09-17.md
 *
 * Measured in a browser: five of six fields typed, Save pressed, the
 * panel stayed open and nothing on the screen said why. The old guard
 * was `if (!name || !line1 || !city || !pincode) return;` — a bare
 * return, and it did not check `phone` or `state` at all, both of which
 * `CreateAddressDto` requires.
 */
const FULL: RequiredAddressInput = {
  recipientName: "QA Buyer",
  phone: "9812345670",
  line1: "12 Sector 35",
  city: "Chandigarh",
  state: "Chandigarh",
  pincode: "160022",
};

describe("missingAddressFields", () => {
  it("finds nothing missing in a complete address", () => {
    expect(missingAddressFields(FULL)).toEqual([]);
    expect(addressMissingMessage(missingAddressFields(FULL))).toBe("");
  });

  it("names the one empty box — the case that used to do nothing at all", () => {
    const missing = missingAddressFields({ ...FULL, pincode: "" });
    expect(missing.map((f) => f.key)).toEqual(["pincode"]);
    expect(addressMissingMessage(missing)).toBe("Add Pincode to save this address.");
  });

  it("covers phone and state, which the old guard ignored and the server rejects", () => {
    expect(missingAddressFields({ ...FULL, phone: "" }).map((f) => f.key)).toEqual(["phone"]);
    expect(missingAddressFields({ ...FULL, state: "" }).map((f) => f.key)).toEqual(["state"]);
  });

  it("treats whitespace as empty, so a space typed in a box is not an address", () => {
    expect(missingAddressFields({ ...FULL, city: "   " }).map((f) => f.key)).toEqual(["city"]);
  });

  it("reports blanks in form order, not in the order they were checked", () => {
    const missing = missingAddressFields({ ...FULL, pincode: "", recipientName: "", city: "" });
    expect(missing.map((f) => f.key)).toEqual(["recipientName", "city", "pincode"]);
  });
});

describe("the sentence", () => {
  it("lists two fields with 'and', and three with commas", () => {
    expect(listAddressFields(missingAddressFields({ ...FULL, city: "", pincode: "" }))).toBe(
      "City and Pincode",
    );
    expect(
      listAddressFields(missingAddressFields({ ...FULL, phone: "", city: "", pincode: "" })),
    ).toBe("Phone, City and Pincode");
  });

  it("words the gift recipient's copy as the recipient's, not the buyer's own", () => {
    expect(recipientMissingMessage(missingAddressFields({ ...FULL, phone: "" }))).toBe(
      "Add the recipient's Phone before placing the order.",
    );
  });

  it("says nothing when nothing is missing, so no empty banner can render", () => {
    expect(recipientMissingMessage([])).toBe("");
    expect(listAddressFields([])).toBe("");
  });
});

describe("firstMissingAddressFieldId", () => {
  /**
   * The id has to match the input `AddressForm` actually renders
   * (`${idPrefix}-${idSuffix}`) or `focusFirstError` looks up a
   * non-existent element and silently does nothing — which is the bug
   * this fix exists to remove, one layer down.
   */
  it("builds the input id from the form's own prefix", () => {
    expect(firstMissingAddressFieldId({ ...FULL, pincode: "" }, "new-addr")).toBe(
      "new-addr-pincode",
    );
    expect(firstMissingAddressFieldId({ ...FULL, recipientName: "" }, "recipient")).toBe(
      "recipient-name",
    );
  });

  it("is undefined for a complete address, so nothing is focused on success", () => {
    expect(firstMissingAddressFieldId(FULL, "new-addr")).toBeUndefined();
  });

  it("mirrors CreateAddressDto's required set exactly", () => {
    expect(REQUIRED_ADDRESS_FIELDS.map((f) => f.key)).toEqual([
      "recipientName",
      "phone",
      "line1",
      "city",
      "state",
      "pincode",
    ]);
  });
});
