import { VendorProfile } from '@prisma/client';
import {
  VendorProfileService,
  type CompletionSummary,
  type TrustSummary,
  type VendorStats,
  type Achievement,
} from '../../src/catalog/vendor-profile.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * The badge is the product: a buyer ordering food from a stranger's
 * kitchen is trusting it, and the trust panel is the only place the
 * platform makes a claim about someone it has never met.
 *
 * Trust, achievements and completion are **computed on read** and never
 * stored, so they are pure functions of a profile row plus counted stats —
 * which is exactly what makes them worth testing directly. Prisma is
 * stubbed rather than mocked because none of these three touch it; the
 * counting that does is covered end-to-end against a real database.
 */

const service = new VendorProfileService({} as PrismaService);

// The private methods are the unit under test. Reaching them through the
// index signature is deliberate: making them public purely for a test
// would widen the service's surface for no caller.
const trust = (p: VendorProfile | null, s: VendorStats): TrustSummary =>
  (service as unknown as { trust(p: VendorProfile | null, s: VendorStats): TrustSummary }).trust(p, s);
const achievements = (p: VendorProfile | null, s: VendorStats): Achievement[] =>
  (
    service as unknown as {
      achievements(p: VendorProfile | null, s: VendorStats): Achievement[];
    }
  ).achievements(p, s);
/**
 * `makesFood` defaults to true — every case written before M33 was a food
 * kitchen. `pinConfirmed` defaults to false — a fresh profile's pin is
 * whatever approval seeded, and nobody has vouched for it (2026-08-18).
 */
const completion = (
  p: VendorProfile | null,
  photos: number,
  makesFood = true,
  pinConfirmed = false,
): CompletionSummary =>
  (
    service as unknown as {
      completion(
        p: VendorProfile | null,
        photos: number,
        makesFood: boolean,
        pinConfirmed: boolean,
      ): CompletionSummary;
    }
  ).completion(p, photos, makesFood, pinConfirmed);

function profileOf(partial: Partial<VendorProfile>): VendorProfile {
  return {
    fssaiVerified: false,
    identityVerified: false,
    addressVerified: false,
    fssaiNumber: null,
    knownFor: [],
    languages: [],
    workingDays: [],
    ...partial,
  } as VendorProfile;
}

function statsOf(partial: Partial<VendorStats> = {}): VendorStats {
  return {
    ordersDelivered: 0,
    cancellationRate: null,
    monthsActive: 0,
    rating: 0,
    reviewCount: 0,
    followerCount: 0,
    ...partial,
  };
}

const signal = (t: TrustSummary, key: string) => t.signals.find((s) => s.key === key)!;

/** Builds the minimum profile + stats that earn exactly the named signals, and nothing else. */
function withSignals(keys: string[]): [VendorProfile, VendorStats] {
  const has = (k: string) => keys.includes(k);
  return [
    profileOf({
      identityVerified: has('identity'),
      addressVerified: has('address'),
      fssaiVerified: has('fssai'),
    }),
    statsOf({
      rating: has('reviews') ? 4.5 : 0,
      reviewCount: has('reviews') ? 5 : 0,
      ordersDelivered: has('volume') ? 25 : 0,
      monthsActive: has('tenure') ? 6 : 0,
      cancellationRate: has('reliability') ? 0.05 : null,
    }),
  ];
}

describe('trust — scoring', () => {
  it('starts a brand-new kitchen at zero, in the "new" tier', () => {
    const t = trust(null, statsOf());
    expect(t.score).toBe(0);
    expect(t.tier).toBe('new');
  });

  it('has weights that add to exactly 100', () => {
    // A score out of 100 that cannot reach 100 is a score nobody can
    // reason about — and every tier boundary below is a percentage.
    const t = trust(null, statsOf());
    expect(t.signals.reduce((sum, s) => sum + s.weight, 0)).toBe(100);
  });

  it('reaches 100 when every signal is earned', () => {
    const t = trust(
      profileOf({ identityVerified: true, addressVerified: true, fssaiVerified: true }),
      statsOf({
        ordersDelivered: 40,
        cancellationRate: 0.02,
        monthsActive: 12,
        rating: 4.8,
        reviewCount: 20,
      }),
    );
    expect(t.score).toBe(100);
    expect(t.tier).toBe('trusted');
  });

  it.each([
    [[], 0, 'new'],
    [['identity'], 15, 'new'],
    [['fssai'], 20, 'building'],
    [['identity', 'address', 'reviews'], 45, 'established'],
    [['identity', 'address', 'fssai', 'tenure'], 55, 'established'],
    [['identity', 'address', 'fssai', 'reviews', 'tenure'], 75, 'trusted'],
  ] as [string[], number, string][])(
    'earning %j scores %i and lands in the %s tier',
    (earned, score, tier) => {
      // Driven through the real scorer rather than a reimplementation of
      // it, and sitting on both sides of each boundary — an off-by-one
      // here silently demotes or promotes every kitchen on the line.
      const [profile, stats] = withSignals(earned);
      const t = trust(profile, stats);
      expect(t.score).toBe(score);
      expect(t.tier).toBe(tier);
      expect(t.signals.filter((s) => s.earned).map((s) => s.key).sort()).toEqual([...earned].sort());
    },
  );

  it('cannot reach "trusted" on paperwork alone, or on trading alone', () => {
    // The two halves are balanced at 45 and 55 on purpose, so neither
    // reaches the 75 threshold by itself. A kitchen that passed every
    // admin check but has never delivered an order is not "Trusted", and
    // neither is a busy kitchen nobody has verified. This is the property
    // that stops the top tier being buyable with paperwork.
    const paperworkOnly = trust(...withSignals(['identity', 'address', 'fssai']));
    expect(paperworkOnly.score).toBe(45);
    expect(paperworkOnly.tier).toBe('established');

    const tradingOnly = trust(...withSignals(['reviews', 'volume', 'tenure', 'reliability']));
    expect(tradingOnly.score).toBe(55);
    expect(tradingOnly.tier).toBe('established');
  });
});

describe('trust — signals a seller can see are unmet', () => {
  it('returns unearned signals rather than hiding them', () => {
    // The seller's portal and the buyer's storefront render the same list.
    // Dropping unmet signals would leave a buyer to assume the worse of
    // the two, and a seller with nothing to act on.
    const t = trust(null, statsOf());
    expect(t.signals).toHaveLength(7);
    expect(t.signals.every((s) => !s.earned)).toBe(true);
    expect(t.signals.every((s) => s.detail.length > 0)).toBe(true);
  });

  it('distinguishes a claimed FSSAI licence from a verified one', () => {
    // The whole point of the admin-only write path: submitting a number
    // must not look like passing a check.
    const claimed = trust(profileOf({ fssaiNumber: '12345678901234' }), statsOf());
    expect(signal(claimed, 'fssai').earned).toBe(false);
    expect(signal(claimed, 'fssai').detail).toBe('Licence submitted, awaiting check');

    const none = trust(profileOf({}), statsOf());
    expect(signal(none, 'fssai').detail).toBe('No licence on file');

    const verified = trust(
      profileOf({ fssaiNumber: '12345678901234', fssaiVerified: true }),
      statsOf(),
    );
    expect(signal(verified, 'fssai').earned).toBe(true);
  });

  it('says an unknown cancellation rate is unknown, not zero', () => {
    // `null` means nothing has closed yet. Rendering "0% cancelled" for a
    // kitchen that has never taken an order is a claim we have not earned
    // the right to make — and "100% reliable" would be worse.
    const unknown = trust(null, statsOf({ cancellationRate: null }));
    expect(signal(unknown, 'reliability').earned).toBe(false);
    expect(signal(unknown, 'reliability').detail).toBe('Not enough orders to say yet');
  });

  it('earns reliability at or under 5% cancellations', () => {
    expect(signal(trust(null, statsOf({ cancellationRate: 0.05 })), 'reliability').earned).toBe(true);
    expect(signal(trust(null, statsOf({ cancellationRate: 0.06 })), 'reliability').earned).toBe(false);
    expect(signal(trust(null, statsOf({ cancellationRate: 0 })), 'reliability').detail).toBe(
      '0% of orders cancelled',
    );
  });

  it('needs both enough reviews and a good rating to call a kitchen well reviewed', () => {
    // Either half alone is gameable: 5.0 from one friend, or 200 reviews
    // averaging 2.8.
    expect(signal(trust(null, statsOf({ rating: 5, reviewCount: 1 })), 'reviews').earned).toBe(false);
    expect(signal(trust(null, statsOf({ rating: 3.2, reviewCount: 90 })), 'reviews').earned).toBe(false);
    expect(signal(trust(null, statsOf({ rating: 4, reviewCount: 5 })), 'reviews').earned).toBe(true);
  });

  it('pluralises the detail lines', () => {
    const one = trust(null, statsOf({ reviewCount: 1, rating: 5, ordersDelivered: 1, monthsActive: 1 }));
    expect(signal(one, 'reviews').detail).toBe('5.0 from 1 review');
    expect(signal(one, 'volume').detail).toBe('1 order delivered');
    expect(signal(one, 'tenure').detail).toBe('1 month on Homekrafted');

    const many = trust(null, statsOf({ reviewCount: 2, rating: 4.25, ordersDelivered: 2, monthsActive: 2 }));
    expect(signal(many, 'reviews').detail).toBe('4.3 from 2 reviews');
    expect(signal(many, 'volume').detail).toBe('2 orders delivered');
    expect(signal(many, 'tenure').detail).toBe('2 months on Homekrafted');
  });

  it('says "Joined this month" rather than "0 months"', () => {
    expect(signal(trust(null, statsOf({ monthsActive: 0 })), 'tenure').detail).toBe(
      'Joined this month',
    );
  });
});

describe('achievements', () => {
  it('calls a brand-new kitchen new, and stops once it is not', () => {
    expect(achievements(null, statsOf()).map((a) => a.key)).toContain('new');
    // Ten orders in the first month is no longer new.
    expect(achievements(null, statsOf({ ordersDelivered: 10 })).map((a) => a.key)).not.toContain(
      'new',
    );
    expect(achievements(null, statsOf({ monthsActive: 2 })).map((a) => a.key)).not.toContain('new');
  });

  it('awards only the highest order milestone reached', () => {
    // Five stacked "50+ / 100+ / 250+" badges say less than one "250+".
    const keys = achievements(null, statsOf({ ordersDelivered: 300 })).map((a) => a.key);
    expect(keys).toContain('orders-250');
    expect(keys).not.toContain('orders-100');
    expect(keys).not.toContain('orders-50');
  });

  it('awards no order milestone below fifty', () => {
    expect(achievements(null, statsOf({ ordersDelivered: 49 })).map((a) => a.key)).not.toContain(
      'orders-50',
    );
  });

  it('needs volume as well as a high rating to be top rated', () => {
    expect(achievements(null, statsOf({ rating: 5, reviewCount: 9 })).map((a) => a.key)).not.toContain(
      'top-rated',
    );
    expect(achievements(null, statsOf({ rating: 4.7, reviewCount: 10 })).map((a) => a.key)).toContain(
      'top-rated',
    );
  });

  it('never awards an FSSAI badge on a claim alone', () => {
    expect(
      achievements(profileOf({ fssaiNumber: '12345678901234' }), statsOf()).map((a) => a.key),
    ).not.toContain('fssai');
    expect(achievements(profileOf({ fssaiVerified: true }), statsOf()).map((a) => a.key)).toContain(
      'fssai',
    );
  });

  it('counts tenure in whole years, singular at one', () => {
    expect(achievements(null, statsOf({ monthsActive: 11 })).map((a) => a.label)).not.toContain(
      '1 year on Homekrafted',
    );
    expect(achievements(null, statsOf({ monthsActive: 12 })).map((a) => a.label)).toContain(
      '1 year on Homekrafted',
    );
    expect(achievements(null, statsOf({ monthsActive: 26 })).map((a) => a.label)).toContain(
      '2 years on Homekrafted',
    );
  });
});

describe("completion — the seller's own nudge", () => {
  it('is zero with no profile, and names every missing section', () => {
    const c = completion(null, 0);
    expect(c.percent).toBe(0);
    expect(c.missing).toHaveLength(10);
    // Named in plain words, because this list is shown to the person who
    // can fix it — a key like `knownFor` is not an instruction.
    expect(c.missing.map((m) => m.label)).toContain('Your story');
    expect(c.missing.every((m) => m.label.length > 3)).toBe(true);
  });

  it('adds to exactly 100 when everything is filled in', () => {
    const c = completion(
      profileOf({
        tagline: 'Pickles from Sector 34',
        story: 'I started in 2019...',
        knownFor: ['Pickles'],
        workingDays: [1, 2, 3],
        opensAt: '09:00',
        prepTimeMins: 120,
        hygieneNote: 'Gloves and sealed jars',
        cancellationPolicy: 'Free until packed',
        returnPolicy: 'Seven days',
        fssaiNumber: '12345678901234',
      }),
      2,
      true,
      // The pin counts too now — "everything filled in" includes having
      // confirmed where the kitchen actually is.
      true,
    );
    expect(c.percent).toBe(100);
    expect(c.missing).toHaveLength(0);
  });

  it('names the unconfirmed pin as a gap, and a confirmed one clears it', () => {
    // Approval seeds coordinates from a pincode centroid trustworthy for
    // 44% of pincodes, and those coordinates decide which buyers can find
    // the kitchen — so the meter nudges until a person has vouched for
    // the pin (the kitchen's own GPS fix, or an admin correction).
    expect(completion(null, 0).missing.map((m) => m.key)).toContain('pin');
    expect(completion(null, 0, true, true).missing.map((m) => m.key)).not.toContain('pin');
  });

  it('counts a submitted FSSAI number, not a verified one', () => {
    // Verification is the admin's job; a seller must not be stuck at 95%
    // waiting on us.
    const c = completion(profileOf({ fssaiNumber: '12345678901234' }), 0);
    expect(c.missing.map((m) => m.key)).not.toContain('fssai');
  });

  /*
   * M33. A food licence is only ever *asked of* somebody who makes food
   * (M22) — the verification card and the profile editor already honoured
   * that, this meter did not, and it told a candle maker in plain words
   * that their profile was incomplete until they produced one. Invisible
   * until M33, because nothing could make an existing account craft-only
   * before `PATCH /seller/specialties`.
   */
  it('never asks a craft-only HomeKrafter for a food licence', () => {
    const c = completion(null, 0, false);
    expect(c.missing.map((m) => m.key)).not.toContain('fssai');
    expect(c.missing).toHaveLength(9);
  });

  it('lets a craft-only HomeKrafter reach 100% without one', () => {
    // The bug this guards is the obvious fix for the one above: drop a
    // 5-point section from a hardcoded /100 and a candle maker is capped
    // at 95% forever, which is the same insult with a different number.
    const filled = profileOf({
      tagline: 'Hand-poured soy candles',
      story: 'I started in 2019...',
      knownFor: ['Candles'],
      workingDays: [1, 2, 3],
      opensAt: '09:00',
      prepTimeMins: 120,
      hygieneNote: 'Sealed and boxed',
      cancellationPolicy: 'Free until packed',
      returnPolicy: 'Seven days',
    });
    expect(completion(filled, 2, false, true).percent).toBe(100);
    // The same profile on a food kitchen is still short its licence.
    // 110 weighted points with the pin section, 5 of them the licence.
    expect(completion(filled, 2, true, true).percent).toBe(95);
  });

  it('weights story and photos above a tagline', () => {
    const withStory = completion(profileOf({ story: 'x' }), 0).percent;
    const withPhotos = completion(profileOf({}), 1).percent;
    const withTagline = completion(profileOf({ tagline: 'x' }), 0).percent;
    expect(withStory).toBeGreaterThan(withTagline);
    expect(withPhotos).toBeGreaterThan(withTagline);
  });

  it('needs both hours and opening time before calling hours done', () => {
    expect(completion(profileOf({ workingDays: [1] }), 0).missing.map((m) => m.key)).toContain('hours');
    expect(
      completion(profileOf({ workingDays: [1], opensAt: '09:00' }), 0).missing.map((m) => m.key),
    ).not.toContain('hours');
  });

  it('needs both policies before calling policies done', () => {
    expect(
      completion(profileOf({ cancellationPolicy: 'x' }), 0).missing.map((m) => m.key),
    ).toContain('policies');
  });

  it('accepts either a hygiene or a packaging note', () => {
    expect(completion(profileOf({ hygieneNote: 'x' }), 0).missing.map((m) => m.key)).not.toContain(
      'hygiene',
    );
    expect(completion(profileOf({ packagingNote: 'x' }), 0).missing.map((m) => m.key)).not.toContain(
      'hygiene',
    );
  });

  it('counts a zero prep time as stated', () => {
    // `0` is falsy and a real answer, so a truthiness check here would
    // permanently hold a fast kitchen below 100%.
    expect(completion(profileOf({ prepTimeMins: 0 }), 0).missing.map((m) => m.key)).not.toContain(
      'prep',
    );
  });
});
