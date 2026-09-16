import { rankCandidates, DispatchCandidate, DispatchJob, LOCATION_STALE_SECONDS } from '../../src/rider/dispatch';

const NOW = new Date('2026-09-14T12:00:00.000Z');

const JOB: DispatchJob = { pickupLat: 30.7418, pickupLng: 76.7822, codAmount: null }; // Sector 17

function candidate(overrides: Partial<DispatchCandidate> & { riderId: string }): DispatchCandidate {
  return {
    approved: true,
    online: true,
    lastLat: 30.7418,
    lastLng: 76.7822,
    lastLocationAt: NOW,
    hasActiveJob: false,
    alreadyOffered: false,
    zoneEligible: true,
    cashBalance: 0,
    cashLimit: 1500,
    deliveriesToday: 0,
    ...overrides,
  };
}

describe('rankCandidates', () => {
  it('ranks the nearer of two eligible riders first', () => {
    const near = candidate({ riderId: 'near', lastLat: 30.742, lastLng: 76.7822 }); // a few hundred metres
    const far = candidate({ riderId: 'far', lastLat: 30.7154, lastLng: 76.758 }); // ~3.2km away (Sector 43)
    const result = rankCandidates({ job: JOB, candidates: [far, near], now: NOW });
    expect(result).toEqual(['near', 'far']);
  });

  it('excludes an unapproved rider', () => {
    const result = rankCandidates({ job: JOB, candidates: [candidate({ riderId: 'r1', approved: false })], now: NOW });
    expect(result).toEqual([]);
  });

  it('excludes an offline rider', () => {
    const result = rankCandidates({ job: JOB, candidates: [candidate({ riderId: 'r1', online: false })], now: NOW });
    expect(result).toEqual([]);
  });

  it('excludes a rider with no location fix at all', () => {
    const result = rankCandidates({
      job: JOB,
      candidates: [candidate({ riderId: 'r1', lastLat: null, lastLng: null, lastLocationAt: null })],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it('excludes a rider whose location fix is older than the stale threshold', () => {
    const staleAt = new Date(NOW.getTime() - (LOCATION_STALE_SECONDS + 1) * 1000);
    const result = rankCandidates({ job: JOB, candidates: [candidate({ riderId: 'r1', lastLocationAt: staleAt })], now: NOW });
    expect(result).toEqual([]);
  });

  it('a fix exactly at the stale threshold is still trusted', () => {
    const boundaryAt = new Date(NOW.getTime() - LOCATION_STALE_SECONDS * 1000);
    const result = rankCandidates({ job: JOB, candidates: [candidate({ riderId: 'r1', lastLocationAt: boundaryAt })], now: NOW });
    expect(result).toEqual(['r1']);
  });

  it('excludes a rider already holding an active job', () => {
    const result = rankCandidates({ job: JOB, candidates: [candidate({ riderId: 'r1', hasActiveJob: true })], now: NOW });
    expect(result).toEqual([]);
  });

  it('excludes a rider already offered this exact job (a decline never loops back)', () => {
    const result = rankCandidates({ job: JOB, candidates: [candidate({ riderId: 'r1', alreadyOffered: true })], now: NOW });
    expect(result).toEqual([]);
  });

  it('excludes a rider outside the job\'s zone', () => {
    const result = rankCandidates({ job: JOB, candidates: [candidate({ riderId: 'r1', zoneEligible: false })], now: NOW });
    expect(result).toEqual([]);
  });

  it('excludes a rider who would go over their cash limit on a COD job', () => {
    const codJob: DispatchJob = { ...JOB, codAmount: 600 };
    const overLimit = candidate({ riderId: 'r1', cashBalance: 1000, cashLimit: 1500 }); // 1000 + 600 > 1500
    const result = rankCandidates({ job: codJob, candidates: [overLimit], now: NOW });
    expect(result).toEqual([]);
  });

  it('the same over-balance rider is fine for a prepaid job — the cash limit only filters COD offers', () => {
    const prepaidJob: DispatchJob = { ...JOB, codAmount: null };
    const overLimitForCod = candidate({ riderId: 'r1', cashBalance: 1400, cashLimit: 1500 });
    const result = rankCandidates({ job: prepaidJob, candidates: [overLimitForCod], now: NOW });
    expect(result).toEqual(['r1']);
  });

  it('exactly at the cash limit (not over) is still eligible for COD', () => {
    const codJob: DispatchJob = { ...JOB, codAmount: 500 };
    const atLimit = candidate({ riderId: 'r1', cashBalance: 1000, cashLimit: 1500 }); // 1000 + 500 == 1500
    const result = rankCandidates({ job: codJob, candidates: [atLimit], now: NOW });
    expect(result).toEqual(['r1']);
  });

  it('ties on distance break by fewest deliveries today — spreading the work', () => {
    const busy = candidate({ riderId: 'busy', deliveriesToday: 4 });
    const idle = candidate({ riderId: 'idle', deliveriesToday: 0 });
    // Both at the exact same coordinates, so distance ties exactly.
    const result = rankCandidates({ job: JOB, candidates: [busy, idle], now: NOW });
    expect(result).toEqual(['idle', 'busy']);
  });

  it('returns every eligible rider, not just the winner — the caller offers to ranked[0]', () => {
    const a = candidate({ riderId: 'a', lastLat: 30.742, lastLng: 76.7822 });
    const b = candidate({ riderId: 'b', lastLat: 30.7154, lastLng: 76.758 });
    const result = rankCandidates({ job: JOB, candidates: [a, b], now: NOW });
    expect(result).toHaveLength(2);
  });
});
