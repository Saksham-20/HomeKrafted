import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './strip-comments';

/**
 * The R2 cross-cutting rule (docs/RIDER-APP.md §10): a rider sees the
 * pickup address and the buyer's address/phone **only** for a job they
 * hold in the right status window, and a history response carries area
 * labels only. This is a deliberate **third** surface for
 * `VendorProfile.pickup*` — CLAUDE.md's M36b names two (the admin
 * verification panel, a HomeKrafter's own portal); a rider mid-job is the
 * third, narrower than either because it is gated by the job's live
 * `status`, not merely by who is asking.
 *
 * Same shape as `vendor-privacy.spec.ts`, scoped to one file instead of a
 * directory: `rider-jobs.mapper.ts` is split by a marker comment into a
 * public region (every mapper a rider's own job list, the buyer's order
 * page and the seller's delivery status read) and a private region
 * (`mapActiveJobForRider` alone), and this fails the build if a
 * restricted field name appears above the marker.
 */

const MAPPER_PATH = join(__dirname, '..', '..', 'src', 'rider', 'rider-jobs.mapper.ts');

/** VendorProfile's pickup-address columns (M36b) plus Address's identifying fields (D13/D14) — the buyer's own door. */
const PRIVATE_FIELDS = [
  'pickupAddressLine1',
  'pickupAddressLine2',
  'pickupLandmark',
  'pickupPincode',
  'pickupPhone',
  'line1',
  'line2',
  'phone',
  'recipientName',
  'instructions',
];

const PRIVATE_MARKER = 'export function mapActiveJobForRider';

function publicRegionOf(source: string): string {
  const at = source.indexOf(PRIVATE_MARKER);
  return at === -1 ? source : source.slice(0, at);
}

describe('rider-jobs.mapper.ts — the third M36b surface', () => {
  const raw = readFileSync(MAPPER_PATH, 'utf8');

  it('still contains the marker the region split depends on', () => {
    // If `mapActiveJobForRider` is ever renamed, the split below silently
    // scans the whole file as "public" and this spec stops meaning
    // anything. Fail loudly instead.
    expect(raw).toContain(PRIVATE_MARKER);
  });

  it('never reads a pickup address or a buyer’s address/phone outside mapActiveJobForRider', () => {
    const source = stripComments(raw);
    const publicRegion = publicRegionOf(source);
    const offenders: string[] = [];

    for (const field of PRIVATE_FIELDS) {
      if (new RegExp(`\\b${field}\\b`).test(publicRegion)) {
        offenders.push(field);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('mapActiveJobForRider itself actually reads the gated fields (a canary against the region silently emptying out)', () => {
    const source = stripComments(raw);
    const at = source.indexOf(PRIVATE_MARKER);
    expect(at).toBeGreaterThan(-1);
    const privateRegion = source.slice(at);

    for (const field of ['pickupAddressLine1', 'pickupPhone', 'line1', 'phone', 'recipientName']) {
      expect(privateRegion).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it('never returns the delivery OTP to a rider, in either region', () => {
    // The code is the buyer's own proof, read out to the rider — never
    // something the rider's own app hands back to them. `mapDeliveryForBuyer`
    // is the one function allowed to read it, and it lives in this same
    // file — so the only safe assertion is "never returned by a rider-
    // facing mapper", checked by object shape rather than by absence of
    // the word (the buyer mapper legitimately contains it).
    const source = stripComments(raw);
    const riderFacing = ['mapOfferForRider', 'mapJobHistoryForRider', 'mapActiveJobForRider'];
    for (const fn of riderFacing) {
      const start = source.indexOf(`function ${fn}`);
      expect(start).toBeGreaterThan(-1);
      const end = source.indexOf('\nexport function ', start + 1);
      const body = end === -1 ? source.slice(start) : source.slice(start, end);
      expect(body).not.toMatch(/\bdeliveryOtp\b/);
    }
  });
});
