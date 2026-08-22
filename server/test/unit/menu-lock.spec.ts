import { DEFAULT_MENU_LOCK_TIME, isMenuLocked, menuLockAt } from '../../src/meals/menu-lock';

/**
 * Hand-computed instants, never recorded from a run (docs/TESTS.md rule).
 *
 * Worked example used throughout: delivery date 2026-08-20 with lock time
 * "20:00" locks at 20:00 IST on 2026-08-19. IST is UTC+5:30, so that
 * instant is 2026-08-19T14:30:00Z.
 */
describe('menu lock math', () => {
  const delivery = new Date('2026-08-20T00:00:00.000Z');

  it('locks at lockTime IST on the evening before the delivery date', () => {
    expect(menuLockAt(delivery, '20:00').toISOString()).toBe('2026-08-19T14:30:00.000Z');
  });

  it('a midnight lock time means the date locks as its eve begins', () => {
    // "00:00" on D−1 IST = 2026-08-18T18:30:00Z.
    expect(menuLockAt(delivery, '00:00').toISOString()).toBe('2026-08-18T18:30:00.000Z');
  });

  it('flips exactly at the lock instant, not a minute early', () => {
    const lockAt = Date.parse('2026-08-19T14:30:00.000Z');
    expect(isMenuLocked(delivery, '20:00', new Date(lockAt - 60_000))).toBe(false);
    expect(isMenuLocked(delivery, '20:00', new Date(lockAt))).toBe(true);
    expect(isMenuLocked(delivery, '20:00', new Date(lockAt + 60_000))).toBe(true);
  });

  it('a date further out is not locked by an earlier date closing', () => {
    const now = new Date('2026-08-19T15:00:00.000Z'); // past the 20th's lock
    const nextWeek = new Date('2026-08-25T00:00:00.000Z');
    expect(isMenuLocked(delivery, '20:00', now)).toBe(true);
    expect(isMenuLocked(nextWeek, '20:00', now)).toBe(false);
  });

  it('an unparseable lock time falls back to the default instead of throwing', () => {
    expect(menuLockAt(delivery, 'garbage').toISOString()).toBe(
      menuLockAt(delivery, DEFAULT_MENU_LOCK_TIME).toISOString(),
    );
  });
});
