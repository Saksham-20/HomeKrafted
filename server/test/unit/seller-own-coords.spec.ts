import { BadRequestException } from '@nestjs/common';
import { SellerProfileService } from '../../src/seller/profile.service';
import { lookupPincode } from '../../src/common/pincodes';

/**
 * A HomeKrafter pins their own kitchen (2026-08-18) — the guardrails.
 *
 * This endpoint reverses M36's "no seller-facing coords write" on the
 * owner's decision, and these tests pin what made that reversal safe:
 *
 * 1. A pin outside the kitchen's own pincode (centroid + measured spread
 *    + margin) is refused, with the distance in the sentence — so a
 *    storefront cannot move itself to a busier city.
 * 2. An accepted pin clears `addressVerified` in the same transaction —
 *    the admin verified a place, not a claim (the M36c rule).
 * 3. The move is audited, after the mutation.
 *
 * Anchored to the *pincode centroid*, never the current pin — repeated
 * small moves must not be able to walk a storefront anywhere.
 */

// A real row from the bundled table, so the test breaks if the lookup
// contract changes rather than silently testing a fabricated centroid.
const PINCODE = '160055';
const CENTROID = lookupPincode(PINCODE)!;

function serviceWith(vendor: Record<string, unknown>) {
  const tx: unknown[] = [];
  const prisma = {
    vendor: {
      findUnique: jest.fn().mockResolvedValue(vendor),
      update: jest.fn().mockImplementation((args) => {
        tx.push({ table: 'vendor', args });
        return { table: 'vendor', args };
      }),
    },
    vendorProfile: {
      upsert: jest.fn().mockImplementation((args) => {
        tx.push({ table: 'vendorProfile', args });
        return { table: 'vendorProfile', args };
      }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new SellerProfileService(prisma as never, {} as never, auditLog as never);
  return { service, prisma, auditLog, tx };
}

const VENDOR = {
  id: 'v1',
  pincode: PINCODE,
  area: PINCODE,
  lat: CENTROID.lat,
  lng: CENTROID.lng,
};

/** Roughly `km` kilometres north of a point — 1 degree of latitude ≈ 111 km. */
function north(of: { lat: number; lng: number }, km: number) {
  return { lat: of.lat + km / 111, lng: of.lng };
}

describe('a HomeKrafter pinning their own kitchen', () => {
  it('accepts a pin inside the pincode and clears addressVerified with it', async () => {
    const { service, prisma, auditLog } = serviceWith(VENDOR);
    const pin = north(CENTROID, 2);

    const result = await service.setOwnCoords('v1', 'u1', pin as never);

    expect(result).toEqual({ ...pin, addressVerified: false });
    expect(prisma.vendor.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      // `pinConfirmedAt` is the completion meter's "someone vouched for
      // this pin" signal — a self-set pin must stamp it.
      data: { lat: pin.lat, lng: pin.lng, pinConfirmedAt: expect.any(Date) },
    });
    // The badge reset rides the same transaction as the pin.
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.vendorProfile.upsert).toHaveBeenCalledWith({
      where: { vendorId: 'v1' },
      create: { vendorId: 'v1', addressVerified: false },
      update: { addressVerified: false },
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vendor.set_coords_self',
        actorId: 'u1',
        targetId: 'v1',
      }),
    );
  });

  it('refuses a pin outside the pincode spread, naming the distance', async () => {
    const { service, prisma, auditLog } = serviceWith(VENDOR);
    // Comfortably past spreadKm + the 10 km margin, whatever this
    // pincode's measured spread is.
    const pin = north(CENTROID, CENTROID.spreadKm + 60);

    await expect(service.setOwnCoords('v1', 'u1', pin as never)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.setOwnCoords('v1', 'u1', pin as never)).rejects.toThrow(
      new RegExp(`km from pincode ${PINCODE}`),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // A refused move never leaves an audit row claiming it happened.
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('anchors a pre-M36 kitchen (no pincode) to its curated area', async () => {
    // `chd-sector-17`: 30.7418, 76.7822. A pin 60 km out has left the
    // tricity, whatever the row's *current* coordinates say — the anchor
    // is the curated area, so drift cannot accumulate move over move.
    const { service } = serviceWith({
      id: 'v1',
      pincode: null,
      area: 'chd-sector-17',
      lat: 30.7418,
      lng: 76.7822,
    });

    await expect(
      service.setOwnCoords('v1', 'u1', north({ lat: 30.7418, lng: 76.7822 }, 60) as never),
    ).rejects.toThrow(/km from Sector 17, Chandigarh/);

    // …while a pin a few km away — still inside the tricity — saves.
    const near = north({ lat: 30.7418, lng: 76.7822 }, 5);
    await expect(service.setOwnCoords('v1', 'u1', near as never)).resolves.toMatchObject(near);
  });
});
