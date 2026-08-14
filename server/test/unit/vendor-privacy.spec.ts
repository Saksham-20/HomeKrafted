import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mapVendor } from '../../src/catalog/mappers/vendor.mapper';

/**
 * A home cook's home address never reaches a buyer.
 *
 * **This is a promise we make in writing, on the form, at the moment we
 * ask for it** — `/sell` says the address and location are not shown to
 * anyone browsing. A promise made in copy and kept only by everyone
 * remembering is not kept; this file is what keeps it.
 *
 * The exposure is the same one M25's EXIF strip exists to prevent. A
 * phone photo of a home kitchen carries GPS, and publishing it published
 * a home cook's address. `VendorProfile.pickup*` is that address, typed
 * in directly and stored on purpose, so it is the more dangerous copy.
 *
 * The boundary being enforced: **`src/catalog` is the public browse
 * surface** — anonymous buyers read everything it returns. The pickup
 * address lives on `VendorProfile`, which that module already loads for
 * the storefront, so nothing stops a future change from adding one line
 * to a projection and shipping somebody's front door. Admin
 * (`src/admin`) and the HomeKrafter's own portal (`src/seller`) are
 * deliberately *not* scanned: those are exactly the two places the
 * address is supposed to be readable.
 */

const CATALOG_ROOT = join(__dirname, '..', '..', 'src', 'catalog');

/** Every column that is part of the pickup address, by its schema name. */
const PRIVATE_FIELDS = [
  'pickupAddressLine1',
  'pickupAddressLine2',
  'pickupLandmark',
  'pickupPincode',
  'pickupPhone',
  // The `SellerApplication` spellings, in case an application is ever
  // rendered through a public path.
  'addressLine1',
  'addressLine2',
  'landmark',
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (entry.endsWith('.ts')) found.push(full);
  }
  return found;
}

function stripComments(source: string): string {
  // So a file that only *documents* the rule is never flagged by it.
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * `vendor-profile.service.ts` holds **both** projections — `publicProfile`
 * (anonymous buyers) and `ownProfile` (the HomeKrafter's own portal) — and
 * the second is one of exactly two places allowed to return the address.
 * So this one file is scanned by region rather than whole, and the region
 * boundary is the point: everything from the start of the file up to
 * `ownProfile` is public, and must stay clean.
 */
const SPLIT_FILE = 'vendor-profile.service.ts';

/** The part of the profile service a buyer can reach. */
function publicRegionOf(source: string): string {
  const ownProfileAt = source.indexOf('async ownProfile');
  return ownProfileAt === -1 ? source : source.slice(0, ownProfileAt);
}

describe('the public catalog surface', () => {
  const files = sourceFiles(CATALOG_ROOT);

  it('finds files to check (guards against the scan matching nothing)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('still contains the split file the region scan depends on', () => {
    // If this service is ever renamed or split, the region logic below
    // silently degrades to scanning nothing in particular. Fail loudly
    // instead.
    const split = files.filter((f) => f.endsWith(SPLIT_FILE));
    expect(split).toHaveLength(1);
    expect(readFileSync(split[0], 'utf8')).toContain('async ownProfile');
  });

  it('never reads a HomeKrafter’s pickup address', () => {
    const offenders: string[] = [];

    for (const file of files) {
      let source = stripComments(readFileSync(file, 'utf8'));
      if (file.endsWith(SPLIT_FILE)) source = publicRegionOf(source);

      for (const field of PRIVATE_FIELDS) {
        if (new RegExp(`\\b${field}\\b`).test(source)) {
          offenders.push(`${file.split('/src/')[1]} -> ${field}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the address out of the public profile’s declared shape', () => {
    // The interface is the contract the storefront renders against. A
    // field cannot leak through a projection that has nowhere to put it.
    const source = readFileSync(join(CATALOG_ROOT, 'vendor-profile.service.ts'), 'utf8');
    const start = source.indexOf('export interface PublicVendorProfile');
    const body = source.slice(start, source.indexOf('}', start));

    expect(start).toBeGreaterThan(-1);
    for (const field of PRIVATE_FIELDS) {
      expect(body).not.toContain(field);
    }
    expect(body).not.toMatch(/pickup/i);
  });
});

describe('mapVendor', () => {
  /**
   * The single mapper behind every public vendor payload — browse, search,
   * storefront header, product cards. Whatever it returns is world
   * readable, so the assertion is on the *shape it produces*, not on what
   * it was handed.
   */
  it('returns no address-shaped field, even when handed extra columns', () => {
    const vendor = {
      id: 'v1',
      slug: 'anjalis-kitchen',
      name: "Anjali's Kitchen",
      type: 'maker',
      bio: 'Home food',
      avatarPlaceholder: 'a',
      bannerPlaceholder: 'b',
      avatarSrc: null,
      bannerSrc: null,
      location: 'Sector 35, Chandigarh',
      area: 'chd-sector-35',
      pincode: '160035',
      lat: 30.7266,
      lng: 76.7554,
      deliveryRadiusKm: 10,
      rating: 4.8,
      reviewCount: 12,
      followerCount: 3,
      joinedAt: new Date('2026-01-01'),
      // Deliberately smuggled in: if the mapper ever spreads its input
      // instead of picking fields, this is what would escape.
      pickupAddressLine1: 'House 123, Street 7',
      pickupLandmark: 'Opposite the gurudwara',
      pickupPhone: '+919876543210',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = mapVendor(vendor as any) as Record<string, unknown>;

    for (const field of PRIVATE_FIELDS) {
      expect(mapped).not.toHaveProperty(field);
    }
    // And nothing that merely *looks* like an address line.
    expect(Object.keys(mapped).filter((k) => /address|landmark/i.test(k))).toEqual([]);
  });

  it('still returns the coarse public location, which is not an address', () => {
    // `location` is the storefront's area label and is meant to be public.
    // The distinction is the whole design: a buyer sees the neighbourhood,
    // never the door.
    const mapped = mapVendor({
      id: 'v1',
      slug: 's',
      name: 'n',
      type: 'maker',
      bio: '',
      avatarPlaceholder: '',
      bannerPlaceholder: '',
      avatarSrc: null,
      bannerSrc: null,
      location: 'Sector 35, Chandigarh',
      area: 'chd-sector-35',
      pincode: '160035',
      lat: 30.7266,
      lng: 76.7554,
      deliveryRadiusKm: 10,
      rating: 0,
      reviewCount: 0,
      followerCount: 0,
      joinedAt: new Date('2026-01-01'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as Record<string, unknown>;

    expect(mapped.location).toBe('Sector 35, Chandigarh');
  });
});
