import {
  buildCreateOrderPayload,
  buildDropAddress,
  buildPickupAddress,
  normaliseContact,
  ShadowfaxPayloadError,
} from '../../src/shipping/shadowfax-payload';

const pickup = {
  vendorName: "Anjali's Kitchen",
  line1: 'House 42, Sector 35-C',
  line2: 'Ground floor',
  landmark: 'Opposite the gurudwara',
  pincode: '160022',
  phone: '+919876543210',
  lat: 30.7333,
  lng: 76.7794,
};

const drop = {
  recipientName: 'Test Buyer',
  phone: '9876500011',
  line1: 'Flat 9, Sector 22',
  line2: null,
  city: 'Chandigarh',
  state: 'Chandigarh',
  pincode: '160022',
  instructions: 'Ring twice',
  lat: null,
  lng: null,
};

describe('normaliseContact', () => {
  it('strips the country code our own store adds', () => {
    // Numbers are stored E.164 by `identifier.util.ts`. Rejecting them
    // here would fail every booking on a field that is correct.
    expect(normaliseContact('+919876543210')).toBe('9876543210');
    expect(normaliseContact('919876543210')).toBe('9876543210');
    expect(normaliseContact('98765 43210')).toBe('9876543210');
    expect(normaliseContact('098765-43210')).toBe('9876543210');
  });

  it('refuses anything that is not ten digits', () => {
    expect(normaliseContact('12345')).toBeUndefined();
    expect(normaliseContact('')).toBeUndefined();
    expect(normaliseContact(null)).toBeUndefined();
    expect(normaliseContact('not a phone')).toBeUndefined();
  });
});

describe('buildPickupAddress', () => {
  it('derives city and state from the pincode', () => {
    // `VendorProfile` has no city/state column — M36 made the pincode the
    // identity a HomeKrafter supplies, and `pincodes.json` is
    // authoritative for district and state.
    const out = buildPickupAddress(pickup);
    expect(out.pincode).toBe(160022);
    expect(out.city).toBeTruthy();
    expect(out.state).toBeTruthy();
    expect(out.contact).toBe('9876543210');
  });

  it('keeps the landmark — India addresses by landmark', () => {
    expect(buildPickupAddress(pickup).address_line_2).toContain('gurudwara');
  });

  it('sends the confirmed pin, not the pincode centroid', () => {
    const out = buildPickupAddress(pickup);
    expect(out.latitude).toBe('30.7333');
    expect(out.longitude).toBe('76.7794');
  });

  it('names what is missing rather than sending a half address', () => {
    // Each of these becomes `Consignment.failureReason` and is the whole
    // of what tells an operator what to fix.
    expect(() => buildPickupAddress({ ...pickup, line1: null })).toThrow(ShadowfaxPayloadError);
    expect(() => buildPickupAddress({ ...pickup, pincode: null })).toThrow(/pincode/i);
    expect(() => buildPickupAddress({ ...pickup, phone: null })).toThrow(/phone/i);
    expect(() => buildPickupAddress({ ...pickup, pincode: '999999' })).toThrow(/not a recognised/i);
  });
});

describe('buildDropAddress', () => {
  it('uses the city the buyer typed, not the pincode district', () => {
    // A buyer knows their own city; overriding "Mohali" with the district
    // name "Sahibzada Ajit Singh Nagar" puts a name on the label nobody
    // recognises.
    const out = buildDropAddress({ ...drop, city: 'Mohali', pincode: '160055' });
    expect(out.city).toBe('Mohali');
  });

  it('carries delivery instructions where a rider will read them', () => {
    expect(buildDropAddress(drop).address_line_2).toContain('Ring twice');
  });

  it('refuses an unusable pincode or phone', () => {
    expect(() => buildDropAddress({ ...drop, pincode: '12' })).toThrow(/valid Indian pincode/i);
    expect(() => buildDropAddress({ ...drop, phone: 'x' })).toThrow(/phone/i);
  });
});

describe('buildCreateOrderPayload', () => {
  const base = {
    clientOrderId: 'HK-HK2116-vd1-addr1',
    pickup,
    drop,
    lines: [{ sku: 'mango-250g', name: 'Mango Thokku Pickle', quantity: 2, price: 249 }],
    declaredValue: 498,
    codAmount: 0,
  };

  it('returns undelivered parcels to the kitchen, not a warehouse', () => {
    // There is no warehouse on this platform. Pointing `rts_details`
    // anywhere else sends a home cook's undelivered food to an address
    // nobody is at.
    const out = buildCreateOrderPayload(base);
    expect(out.rts_details).toEqual(out.pickup_details);
  });

  it('derives payment_mode from the COD amount so the two cannot disagree', () => {
    // A `Prepaid` booking carrying a COD amount is how a rider ends up
    // asking a buyer who already paid for money a second time.
    expect(buildCreateOrderPayload(base).order_details.payment_mode).toBe('Prepaid');
    expect(buildCreateOrderPayload(base).order_details.cod_amount).toBe(0);
    const cod = buildCreateOrderPayload({ ...base, codAmount: 498 });
    expect(cod.order_details.payment_mode).toBe('COD');
  });

  it('never sends a negative COD amount', () => {
    expect(buildCreateOrderPayload({ ...base, codAmount: -50 }).order_details.cod_amount).toBe(0);
  });

  it('truncates every field the carrier length-limits', () => {
    // The carrier 400s the whole booking for one overrun, so a long
    // storefront name or product title must not be able to fail a parcel.
    const out = buildCreateOrderPayload({
      ...base,
      clientOrderId: 'X'.repeat(300),
      pickup: { ...pickup, vendorName: 'N'.repeat(300) },
      lines: [{ sku: 'S'.repeat(300), name: 'P'.repeat(300), quantity: 1, price: 10 }],
    });
    expect(out.order_details.client_order_id.length).toBeLessThanOrEqual(100);
    expect(out.pickup_details.name.length).toBeLessThanOrEqual(100);
    expect(out.product_details[0].sku_name.length).toBeLessThanOrEqual(100);
    expect((out.product_details[0].sku_id ?? '').length).toBeLessThanOrEqual(100);
  });

  it('carries the quantity, which is otherwise lost', () => {
    expect(buildCreateOrderPayload(base).product_details[0].additional_details?.quantity).toBe(2);
  });

  it('refuses a parcel with no lines', () => {
    expect(() => buildCreateOrderPayload({ ...base, lines: [] })).toThrow(ShadowfaxPayloadError);
  });

  it('is always the marketplace (seller-pickup) model', () => {
    // The warehouse model would tell the carrier to collect from a
    // building this platform does not have.
    expect(buildCreateOrderPayload(base).order_type).toBe('marketplace');
  });
});
