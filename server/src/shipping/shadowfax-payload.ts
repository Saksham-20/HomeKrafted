import { lookupPincode } from '../common/pincodes';
import { ShadowfaxAddress, ShadowfaxCreateOrderPayload } from './shadowfax.client';

/**
 * Turning our rows into the carrier's request body — pure, no Prisma, no
 * clock, no config, so every field constraint below is asserted in a unit
 * test instead of discovered as a 400 from Shadowfax on a real order
 * (`server/test/unit/shadowfax-payload.spec.ts`).
 *
 * The carrier enforces character limits on almost every string and
 * silently 400s the whole booking for one overrun, so everything is
 * truncated here rather than hoped about. Limits are from the Unified API
 * spec; each is named where it is applied.
 */

export class ShadowfaxPayloadError extends Error {}

/** Carrier limits, from the Unified API "Attributes" tables. */
const LIMIT = {
  clientOrderId: 100,
  name: 100,
  contact: 13,
  city: 50,
  state: 50,
  addressLine: 250,
  skuName: 100,
  skuId: 100,
  category: 200,
} as const;

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max);
}

/**
 * Ten digits, no country code, no punctuation — what the carrier's
 * validator accepts.
 *
 * A `+91` prefix is stripped rather than rejected: our own numbers are
 * stored E.164 by `identifier.util.ts`, and refusing them here would fail
 * every booking on a field that is correct.
 */
export function normaliseContact(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return ten.length === 10 ? ten : undefined;
}

export interface PickupSource {
  vendorName: string;
  /** `VendorProfile.pickup*` — a home cook's home address. Server-side only. */
  line1: string | null;
  line2: string | null;
  landmark: string | null;
  pincode: string | null;
  /** `VendorProfile.pickupPhone`, else the account's own number. */
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

export interface DropSource {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  instructions: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ConsignmentLine {
  sku: string | null;
  name: string;
  quantity: number;
  /** Unit price actually charged, not the list price. */
  price: number;
}

/**
 * The kitchen's end of the journey.
 *
 * City and state are **derived from the pincode**, not asked for: M36 made
 * the pincode the identity a HomeKrafter supplies, and `VendorProfile` has
 * no city/state column at all. `lookupPincode` is authoritative for
 * district and state (its centroid is not, which is why coordinates come
 * from `Vendor.lat/lng` — a pin a person confirmed — and never from here).
 *
 * A landmark is appended to line 2 rather than dropped: India addresses by
 * landmark, and it is often the only part a rider can actually use.
 */
export function buildPickupAddress(src: PickupSource): ShadowfaxAddress {
  if (!src.line1?.trim()) {
    throw new ShadowfaxPayloadError('This kitchen has no pickup address on file — add one on /seller/profile.');
  }
  if (!src.pincode?.trim()) {
    throw new ShadowfaxPayloadError('This kitchen has no pickup pincode on file — add one on /seller/profile.');
  }
  const place = lookupPincode(src.pincode);
  if (!place) {
    throw new ShadowfaxPayloadError(`Pickup pincode ${src.pincode} is not a recognised Indian pincode.`);
  }
  const contact = normaliseContact(src.phone);
  if (!contact) {
    throw new ShadowfaxPayloadError('This kitchen has no usable pickup phone number — a rider needs one to collect.');
  }
  const line2 = [src.line2, src.landmark].filter((p) => p && p.trim()).join(', ');
  return {
    name: truncate(src.vendorName, LIMIT.name),
    contact,
    address_line_1: truncate(src.line1, LIMIT.addressLine),
    ...(line2 ? { address_line_2: truncate(line2, LIMIT.addressLine) } : {}),
    city: truncate(place.district, LIMIT.city),
    state: truncate(place.state, LIMIT.state),
    pincode: Number(src.pincode.trim()),
    ...(src.lat != null && src.lng != null ? { latitude: String(src.lat), longitude: String(src.lng) } : {}),
  };
}

/**
 * The buyer's end.
 *
 * City and state come off the `Address` row, which the buyer typed, rather
 * than from the pincode table — the buyer knows their own city, and
 * overriding it with a district name ("Sahibzada Ajit Singh Nagar" for
 * Mohali) puts a name on the label nobody recognises. The pincode is still
 * validated for shape, because the carrier rejects the whole booking for a
 * bad one.
 *
 * Delivery instructions ride in line 2, where a rider will actually read
 * them. They are the buyer's own words and are truncated, never rewritten.
 */
export function buildDropAddress(src: DropSource): ShadowfaxAddress {
  const contact = normaliseContact(src.phone);
  if (!contact) {
    throw new ShadowfaxPayloadError('The delivery address has no usable phone number.');
  }
  if (!/^[1-9]\d{5}$/.test(src.pincode.trim())) {
    throw new ShadowfaxPayloadError(`Delivery pincode "${src.pincode}" is not a valid Indian pincode.`);
  }
  const line2 = [src.line2, src.instructions].filter((p) => p && p.trim()).join(', ');
  return {
    name: truncate(src.recipientName, LIMIT.name),
    contact,
    address_line_1: truncate(src.line1, LIMIT.addressLine),
    ...(line2 ? { address_line_2: truncate(line2, LIMIT.addressLine) } : {}),
    city: truncate(src.city, LIMIT.city),
    state: truncate(src.state, LIMIT.state),
    pincode: Number(src.pincode.trim()),
    ...(src.lat != null && src.lng != null ? { latitude: String(src.lat), longitude: String(src.lng) } : {}),
  };
}

export interface BuildOrderPayloadInput {
  clientOrderId: string;
  pickup: PickupSource;
  drop: DropSource;
  lines: ConsignmentLine[];
  /** Rupees the buyer already paid for these lines. Never re-derived here. */
  declaredValue: number;
  /** Rupees the rider must collect at the door. `0` for everything this platform currently sells. */
  codAmount: number;
  promisedDeliveryDate?: Date;
}

/**
 * One seller-pickup booking.
 *
 * **`rts_details` is the pickup address again, deliberately.** It is where
 * the carrier returns a parcel it cannot deliver, and on this platform
 * that is the kitchen it came from — there is no warehouse. Pointing it
 * anywhere else would send a home cook's undelivered food to an address
 * nobody is at.
 *
 * `payment_mode` is derived from `codAmount` rather than passed in, so the
 * two can never disagree — a `Prepaid` booking carrying a COD amount is
 * how a rider ends up asking a buyer who already paid for money again.
 */
export function buildCreateOrderPayload(input: BuildOrderPayloadInput): ShadowfaxCreateOrderPayload {
  if (!input.lines.length) {
    throw new ShadowfaxPayloadError('A consignment needs at least one line.');
  }
  const pickup = buildPickupAddress(input.pickup);
  const drop = buildDropAddress(input.drop);
  const cod = Math.max(0, Math.round(input.codAmount * 100) / 100);

  return {
    order_type: 'marketplace',
    order_details: {
      client_order_id: truncate(input.clientOrderId, LIMIT.clientOrderId),
      product_value: Math.round(input.declaredValue * 100) / 100,
      cod_amount: cod,
      payment_mode: cod > 0 ? 'COD' : 'Prepaid',
      total_amount: Math.round(input.declaredValue * 100) / 100,
      order_service: 'regular',
      ...(input.promisedDeliveryDate
        ? { promised_delivery_date: input.promisedDeliveryDate.toISOString().slice(0, 10) }
        : {}),
    },
    customer_details: drop,
    pickup_details: pickup,
    // Undeliverable parcels come back to the kitchen. See above.
    rts_details: pickup,
    product_details: input.lines.map((line) => ({
      ...(line.sku ? { sku_id: truncate(line.sku, LIMIT.skuId) } : {}),
      sku_name: truncate(line.name, LIMIT.skuName),
      price: Math.round(line.price * 100) / 100,
      additional_details: { quantity: line.quantity },
    })),
  };
}
