import { SellerProfileService } from '../../src/seller/profile.service';

/**
 * Editing the pickup address clears the badge that verified it (M36c).
 *
 * A HomeKrafter can change their own address, because people move and an
 * address they cannot correct is wrong from the day they do. But
 * `addressVerified` means *an admin checked this address* — so it cannot
 * survive an edit to the address, or the seller has set their own badge
 * through the ordinary profile endpoint.
 *
 * This is the identical rule `fssaiNumber` has followed since M16, and
 * the reason it is tested here is that it is invisible: the happy path
 * works perfectly either way, and the failure only shows up as a badge on
 * a storefront that nobody actually checked.
 */

type Captured = Record<string, unknown>;

function serviceWith(existing: Record<string, unknown> | null) {
  const captured: { update?: Captured; create?: Captured } = {};
  const prisma = {
    vendorProfile: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn().mockImplementation((args: { create: Captured; update: Captured }) => {
        captured.create = args.create;
        captured.update = args.update;
        return Promise.resolve({});
      }),
    },
    vendorPhoto: { findMany: jest.fn().mockResolvedValue([]) },
    seller: { findFirst: jest.fn().mockResolvedValue({ specialties: ['homemade_food'] }) },
    // `updateOwn` resolves the vendor first and 404s on a stranger's id.
    vendor: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
  };

  const vendorProfiles = {
    ownProfile: jest.fn().mockResolvedValue({}),
  };

  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new SellerProfileService(
    prisma as never,
    vendorProfiles as never,
    auditLog as never,
  );

  return { service, captured, prisma };
}

const EXISTING = {
  vendorId: 'v1',
  pickupAddressLine1: 'House 412, Street 9',
  pickupAddressLine2: 'Sector 21B',
  pickupLandmark: 'Opposite the gurudwara',
  pickupPincode: '121001',
  pickupPhone: '+919899988877',
  addressVerified: true,
  fssaiNumber: null,
};

describe('updating the pickup address', () => {
  it('clears addressVerified when the street actually changes', async () => {
    const { service, captured } = serviceWith(EXISTING);

    await service.updateOwn('v1', { pickupAddressLine1: 'House 9, Main Bazaar' } as never);

    expect(captured.update).toMatchObject({
      pickupAddressLine1: 'House 9, Main Bazaar',
      addressVerified: false,
    });
  });

  it('leaves the badge alone when the value is resubmitted unchanged', async () => {
    // A profile save that touches nothing about the address must not cost
    // a kitchen its verification — otherwise editing a return policy
    // silently un-verifies them.
    const { service, captured } = serviceWith(EXISTING);

    await service.updateOwn('v1', {
      pickupAddressLine1: 'House 412, Street 9',
      hygieneNote: 'Sealed packing',
    } as never);

    expect(captured.update).not.toHaveProperty('addressVerified');
  });

  it('leaves the badge alone when the address is not mentioned at all', async () => {
    const { service, captured } = serviceWith(EXISTING);

    await service.updateOwn('v1', { hygieneNote: 'Sealed packing' } as never);

    expect(captured.update).not.toHaveProperty('addressVerified');
    expect(captured.update).not.toHaveProperty('pickupAddressLine1');
  });

  it('treats clearing an optional line as a change, and stores NULL', async () => {
    // "" is somebody deleting a landmark. It has to reach the column as
    // NULL — an empty string would render as a blank line on the admin
    // screen and read as an address we hold rather than one we do not.
    const { service, captured } = serviceWith(EXISTING);

    await service.updateOwn('v1', { pickupLandmark: '' } as never);

    expect(captured.update).toMatchObject({ pickupLandmark: null, addressVerified: false });
  });

  it('does not wipe verifiedAt, which belongs to the other two badges too', async () => {
    // Narrower than the FSSAI branch on purpose: `verifiedAt` and
    // `verificationNote` are shared across identity, address and licence,
    // so clearing them here would erase the record of an identity check
    // that is still perfectly valid.
    const { service, captured } = serviceWith(EXISTING);

    await service.updateOwn('v1', { pickupPincode: '110001' } as never);

    expect(captured.update).toMatchObject({ addressVerified: false });
    expect(captured.update).not.toHaveProperty('verifiedAt');
    expect(captured.update).not.toHaveProperty('verificationNote');
  });

  it('never lets the seller set the badge directly', async () => {
    // `forbidNonWhitelisted` on the DTO is the real guard; this asserts
    // the service does not quietly pass one through if it ever arrives.
    const { service, captured } = serviceWith(EXISTING);

    await service.updateOwn('v1', { addressVerified: true } as never);

    expect(captured.update?.addressVerified).not.toBe(true);
  });
});
