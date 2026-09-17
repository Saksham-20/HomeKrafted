import { OrderDeliveryMode } from '@prisma/client';
import {
  CAMPUS_DROP_MAX_LENGTH,
  ISB_ADDRESS_LABEL,
  ISB_CAMPUS_ADDRESS,
  campusAwareShippingFee,
  deliveryModeFromWire,
  isCampusDelivery,
} from '../../src/common/delivery/isb-campus';
import { ShippingService } from '../../src/shipping/shipping.service';

/**
 * Hand-delivery onto the ISB campus (2026-09-17, owner).
 *
 * Expected values reasoned from the rules, never recorded from a run
 * (docs/TESTS.md).
 */
describe('deliveryModeFromWire', () => {
  /**
   * The trap this function exists for: the wire value is `isb-campus`
   * (hyphen) and the Prisma enum member is `isb_campus` (underscore, via
   * `@map`). Comparing a request value against the enum directly compiles,
   * typechecks, and is never true — every campus order would quietly
   * become a standard one, with a delivery fee and a courier booking.
   */
  it('reads the hyphenated wire value as the underscored enum member', () => {
    expect(deliveryModeFromWire('isb-campus')).toBe(OrderDeliveryMode.isb_campus);
    expect(OrderDeliveryMode.isb_campus).not.toBe('isb-campus');
  });

  it('treats absence, standard and anything unrecognised as a standard order', () => {
    expect(deliveryModeFromWire(undefined)).toBe(OrderDeliveryMode.standard);
    expect(deliveryModeFromWire(null)).toBe(OrderDeliveryMode.standard);
    expect(deliveryModeFromWire('standard')).toBe(OrderDeliveryMode.standard);
    // Fails toward the ordinary paid, couriered order — the safe
    // direction, since the other one promises free hand-delivery.
    expect(deliveryModeFromWire('isb_campus')).toBe(OrderDeliveryMode.standard);
    expect(deliveryModeFromWire('ISB-CAMPUS')).toBe(OrderDeliveryMode.standard);
  });
});

describe('campusAwareShippingFee', () => {
  it('is zero for a campus order whatever the platform charges', () => {
    // `deliveryFee` is an admin setting that happens to be 0 today. "No
    // delivery cost" has to survive somebody setting it to 40.
    expect(campusAwareShippingFee(OrderDeliveryMode.isb_campus, 40)).toBe(0);
    expect(campusAwareShippingFee(OrderDeliveryMode.isb_campus, 0)).toBe(0);
  });

  it('leaves a standard order on the fee it was given', () => {
    expect(campusAwareShippingFee(OrderDeliveryMode.standard, 40)).toBe(40);
    expect(campusAwareShippingFee(OrderDeliveryMode.standard, 0)).toBe(0);
  });
});

describe('isCampusDelivery', () => {
  it('is false for a null or absent mode, so a pre-2026-09-17 row reads as standard', () => {
    expect(isCampusDelivery(null)).toBe(false);
    expect(isCampusDelivery(undefined)).toBe(false);
    expect(isCampusDelivery(OrderDeliveryMode.standard)).toBe(false);
    expect(isCampusDelivery(OrderDeliveryMode.isb_campus)).toBe(true);
  });
});

describe('the campus address', () => {
  it('is in the tricity, where the fleet already operates', () => {
    expect(ISB_CAMPUS_ADDRESS.city).toBe('Mohali');
    expect(ISB_CAMPUS_ADDRESS.pincode).toMatch(/^[1-9][0-9]{5}$/);
  });

  it('leaves room for a building and room number', () => {
    expect(CAMPUS_DROP_MAX_LENGTH).toBeGreaterThanOrEqual(40);
  });

  it('carries one label, so a weekly buyer keeps one address-book entry', () => {
    expect(ISB_ADDRESS_LABEL).toBe('ISB campus');
  });
});

/**
 * Regression: a campus order must never be handed to a courier.
 *
 * We carry it ourselves, so `bookForOrder` books nothing **and records
 * nothing** — not a `failed` consignment either, because nothing failed.
 * The local dev box cannot show this (`SHADOWFAX_ENABLED` is off, so
 * `bookForOrder` returns before reaching the guard), which is exactly
 * why it is pinned here with the carrier switched on.
 */
describe('ShippingService.bookForOrder and a campus order', () => {
  function serviceWithOrder(deliveryMode: OrderDeliveryMode) {
    const findUnique = jest.fn().mockResolvedValue({ deliveryMode });
    const prisma = {
      order: { findUnique },
      // Deliberately absent: `consignment` is undefined, so any attempt
      // to create or read a parcel for a campus order throws rather than
      // passing quietly.
    };
    const config = { get: jest.fn().mockReturnValue(true) };
    const service = new ShippingService(
      prisma as never,
      config as never,
      { ingest: jest.fn() } as never,
      { reconcile: jest.fn() } as never,
    );
    return { service, prisma, findUnique };
  }

  it('books nothing for a campus order, with the carrier enabled', async () => {
    const { service, findUnique } = serviceWithOrder(OrderDeliveryMode.isb_campus);
    jest.spyOn(service as never, 'isEnabled' as never).mockReturnValue(true as never);

    await expect(service.bookForOrder('order-1')).resolves.toBeUndefined();

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      select: { deliveryMode: true },
    });
  });

  it('goes on to look for parcels on a standard order', async () => {
    const { service } = serviceWithOrder(OrderDeliveryMode.standard);
    jest.spyOn(service as never, 'isEnabled' as never).mockReturnValue(true as never);

    // `bookForOrder` never throws at its caller by contract (M57: a
    // despatch failure must not stop a kitchen recording that it has
    // finished cooking), so reaching the consignment code on a stub that
    // has none is swallowed and logged. What this asserts is that it
    // *reached* it — the campus guard did not short-circuit a standard
    // order.
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    await expect(service.bookForOrder('order-2')).resolves.toBeUndefined();
    expect(service['logger'].error).toHaveBeenCalled();
  });
});
