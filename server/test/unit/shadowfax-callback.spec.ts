import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ShippingService } from '../../src/shipping/shipping.service';

/**
 * Callback parsing and authentication — the two things standing between a
 * public HTTP endpoint and a row that says somebody's order was
 * delivered. Shadowfax does not sign callback bodies, so unlike the
 * Razorpay webhook there is no HMAC underneath any of this.
 */
function service(callbackToken = 'shared-secret-value'): ShippingService {
  const config = {
    get: (key: string) => (key === 'shadowfax.callbackToken' ? callbackToken : undefined),
  };
  return new ShippingService({} as never, config as never, {} as never, {} as never);
}

describe('callback authentication', () => {
  it('accepts the configured token, with or without the "Token " prefix', () => {
    expect(() => service().assertCallbackAuthorised('Token shared-secret-value')).not.toThrow();
    expect(() => service().assertCallbackAuthorised('shared-secret-value')).not.toThrow();
  });

  it('refuses a wrong, absent or truncated token', () => {
    expect(() => service().assertCallbackAuthorised('Token wrong')).toThrow(ForbiddenException);
    expect(() => service().assertCallbackAuthorised(undefined)).toThrow(ForbiddenException);
    // A prefix must not pass — a length-only comparison would let it.
    expect(() => service().assertCallbackAuthorised('shared-secret-valu')).toThrow(ForbiddenException);
  });

  it('refuses EVERYTHING when no token is configured', () => {
    // The dangerous direction is the other one. An unset secret that
    // accepted every request would leave a public endpoint that marks any
    // order delivered for anyone who guesses an AWB.
    expect(() => service('').assertCallbackAuthorised('anything')).toThrow(ForbiddenException);
    expect(() => service('').assertCallbackAuthorised('')).toThrow(ForbiddenException);
  });
});

describe('callback parsing', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');

  it('needs an awb and an event', () => {
    expect(() => service().parseCallback({ event: 'delivered' }, now)).toThrow(BadRequestException);
    expect(() => service().parseCallback({ awb_number: 'SF1' }, now)).toThrow(BadRequestException);
  });

  it('reads a zoneless carrier timestamp as IST, not as the server box zone', () => {
    // The bug this pins: `new Date("2026-09-01T16:20:00")` parses in the
    // *server's* zone. This dev machine is Asia/Kolkata and the
    // production VPS is Etc/UTC, so the same callback became two instants
    // 5h30m apart — and `deliveredAt` starts the buyer's seven-day return
    // window (M15).
    const out = service().parseCallback(
      { awb_number: 'SF1', event: 'delivered', event_timestamp: '2026-09-01 16:20:00' },
      now,
    );
    expect(out.eventAt.toISOString()).toBe('2026-09-01T10:50:00.000Z');
  });

  it('honours an explicit zone when the carrier sends one', () => {
    const out = service().parseCallback(
      { awb_number: 'SF1', event: 'delivered', event_timestamp: '2026-09-01T10:50:00Z' },
      now,
    );
    expect(out.eventAt.toISOString()).toBe('2026-09-01T10:50:00.000Z');
  });

  it('falls back to now for a missing, malformed or far-future timestamp', () => {
    // Never null: it is part of the idempotency key, and Postgres treats
    // NULLs in a unique index as distinct — so a nullable value here lets
    // a redelivered callback insert a second event and re-drive the order.
    for (const ts of [undefined, '', 'yesterday afternoon', '2099-01-01 00:00:00']) {
      const out = service().parseCallback({ awb_number: 'SF1', event: 'delivered', event_timestamp: ts }, now);
      expect(out.eventAt).toEqual(now);
    }
  });

  it('never turns a non-string field into "[object Object]"', () => {
    // A carrier — or anybody who has guessed an AWB — can send an object
    // here, and `String(value)` produces a real-looking string that gets
    // stored and shown to an operator as though the carrier said it.
    const out = service().parseCallback(
      {
        awb_number: 'SF1',
        event: 'delivered',
        comments: { nested: 1 } as never,
        current_location: ['a'] as never,
        rider_name: { toString: () => 'evil' } as never,
      },
      now,
    );
    expect(out.comments).toBeNull();
    expect(out.location).toBeNull();
    expect(out.riderName).toBeNull();
  });

  it('caps every stored string so a callback cannot bloat the events table', () => {
    const out = service().parseCallback(
      { awb_number: 'SF1', event: 'delivered', comments: 'A'.repeat(5000), current_location: 'B'.repeat(5000) },
      now,
    );
    expect(out.comments).toHaveLength(500);
    expect(out.location).toHaveLength(200);
  });
});
