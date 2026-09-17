/**
 * Which address fields must be filled in, and how to say which are not
 * (2026-09-17).
 *
 * Checkout's "Save address" began with a bare
 * `if (!name || !line1 || !city || !pincode) return;` — so pressing it
 * with a blank pincode did **nothing at all**: no message, no mark on
 * the field, the button not even disabled. Measured in a browser: a
 * buyer with five of six fields typed pressed Save, the panel stayed
 * open, and there was nothing on the screen to explain why. That is the
 * listing form's unfindable-refusal bug (M45) on the one screen where
 * the person is trying to pay.
 *
 * Pure and DOM-free so it can live here and be tested; the focus move is
 * `components/portal/focus-first-error.ts`, which touches `document`.
 *
 * **Presence only, never format.** `CreateAddressDto` is the authority on
 * what a real phone number or pincode looks like, and its message is the
 * one the buyer should read for a malformed one — checking shape here as
 * well would mean two sets of rules drifting apart (the M17 rule about
 * the two identifier parsers). This answers the narrower question the
 * server cannot answer kindly: which boxes are empty.
 *
 * The field list mirrors `CreateAddressDto`'s required set, which is
 * wider than the four the old guard checked: `phone` and `state` are
 * required server-side, so leaving either blank used to cost a round
 * trip and a 400 rather than a sentence naming the box.
 */
export interface RequiredAddressInput {
  recipientName: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

export interface AddressField {
  key: keyof RequiredAddressInput;
  /** As the form labels it, so the message names what the buyer is looking at. */
  label: string;
  /** Appended to the form's `idPrefix` to reach the input — see `AddressForm`. */
  idSuffix: string;
}

export const REQUIRED_ADDRESS_FIELDS: AddressField[] = [
  { key: "recipientName", label: "Full name", idSuffix: "name" },
  { key: "phone", label: "Phone", idSuffix: "phone" },
  { key: "line1", label: "Address line 1", idSuffix: "line1" },
  { key: "city", label: "City", idSuffix: "city" },
  { key: "state", label: "State", idSuffix: "state" },
  { key: "pincode", label: "Pincode", idSuffix: "pincode" },
];

/** The required fields left blank, in the order they appear on the form. */
export function missingAddressFields(values: RequiredAddressInput): AddressField[] {
  return REQUIRED_ADDRESS_FIELDS.filter((field) => !values[field.key]?.trim());
}

/** The id of the first blank field, for `focusFirstError`. */
export function firstMissingAddressFieldId(
  values: RequiredAddressInput,
  idPrefix: string,
): string | undefined {
  const [first] = missingAddressFields(values);
  return first ? `${idPrefix}-${first.idSuffix}` : undefined;
}

/**
 * "Full name, City and Pincode" — the labels, in form order.
 *
 * Named rather than counted: "3 fields are missing" sends somebody
 * hunting back up a form they have already read once (the M45 rule).
 */
export function listAddressFields(missing: AddressField[]): string {
  const labels = missing.map((field) => field.label);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** The sentence beside checkout's own "Save address" button. */
export function addressMissingMessage(missing: AddressField[]): string {
  if (missing.length === 0) return "";
  return `Add ${listAddressFields(missing)} to save this address.`;
}

/** The same, for the gift recipient's one-off address at place-order time. */
export function recipientMissingMessage(missing: AddressField[]): string {
  if (missing.length === 0) return "";
  return `Add the recipient's ${listAddressFields(missing)} before placing the order.`;
}
