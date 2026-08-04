import {
  bracketsFor,
  DEFAULT_PREP_TIME_MINS,
  earliestStartDate,
  formatBracketRange,
  formatTimeLabel,
  isBracketAllowed,
  parseTimeLabel,
  scheduleDates,
  toDateKey,
} from '../../src/meals/meal-brackets';

/**
 * Every expected value here is computed by hand. Recording a number from a
 * run would lock in whatever the code did on the day, including its bugs.
 */
describe('meal brackets', () => {
  describe('parseTimeLabel / formatTimeLabel', () => {
    it('round-trips a half-hour label', () => {
      // 12 * 60 + 30
      expect(parseTimeLabel('12:30')).toBe(750);
      expect(formatTimeLabel(750)).toBe('12:30');
    });

    it('rejects anything that is not HH:MM', () => {
      expect(parseTimeLabel('9:00')).toBeNull();
      expect(parseTimeLabel('25:00')).toBeNull();
      expect(parseTimeLabel('12:60')).toBeNull();
      expect(parseTimeLabel('noon')).toBeNull();
    });

    it('labels a bracket as the half hour it covers', () => {
      expect(formatBracketRange('12:30')).toBe('12:30–13:00');
      // Crossing the hour, which is where an off-by-one would show.
      expect(formatBracketRange('13:30')).toBe('13:30–14:00');
    });
  });

  describe('bracketsFor', () => {
    it('gives the whole meal window when the kitchen has stated no hours', () => {
      // Lunch defaults to 12:00–15:00 = 180 minutes = six 30-minute brackets.
      expect(bracketsFor('lunch')).toEqual([
        '12:00',
        '12:30',
        '13:00',
        '13:30',
        '14:00',
        '14:30',
      ]);
    });

    it('is narrowed by the kitchen hours, never widened by them', () => {
      // Open 06:00–23:00 is far wider than lunch. Nobody wants lunch at
      // 22:00 just because the kitchen happens to be open.
      expect(bracketsFor('lunch', { opensAt: '06:00', closesAt: '23:00' })).toEqual([
        '12:00',
        '12:30',
        '13:00',
        '13:30',
        '14:00',
        '14:30',
      ]);
    });

    it('drops brackets that would run past closing', () => {
      // Closes 13:30, so 13:00–13:30 is the last one that fits. A 13:30
      // bracket would end at 14:00, after close.
      expect(bracketsFor('lunch', { closesAt: '13:30' })).toEqual(['12:00', '12:30', '13:00']);
    });

    it('snaps a mid-half-hour opening up to the next bracket', () => {
      // Opens 12:15 → first servable bracket is 12:30, not 12:15.
      expect(bracketsFor('lunch', { opensAt: '12:15' })).toEqual([
        '12:30',
        '13:00',
        '13:30',
        '14:00',
        '14:30',
      ]);
    });

    it('is empty when the kitchen hours do not overlap the meal at all', () => {
      // A breakfast plan from a kitchen that opens at noon is a real
      // configuration error, and an empty picker is the honest answer.
      expect(bracketsFor('breakfast', { opensAt: '12:00' })).toEqual([]);
    });

    it('covers each meal with its own window', () => {
      expect(bracketsFor('breakfast')[0]).toBe('07:00');
      expect(bracketsFor('dinner')[0]).toBe('19:00');
    });
  });

  describe('isBracketAllowed', () => {
    it('accepts an offered window and refuses one outside it', () => {
      expect(isBracketAllowed('12:30', 'lunch')).toBe(true);
      expect(isBracketAllowed('20:00', 'lunch')).toBe(false);
      // Right time of day, wrong half of the hour.
      expect(isBracketAllowed('12:15', 'lunch')).toBe(false);
    });
  });

  describe('scheduleDates', () => {
    // 2026-08-03 is a Monday. Every case below counts from it by hand.
    const monday = new Date(Date.UTC(2026, 7, 3));

    it('picks only the days of the week that were chosen', () => {
      // Mon(1)/Wed(3)/Fri(5), four meals from Mon 3 Aug:
      // 3rd Mon, 5th Wed, 7th Fri, 10th Mon.
      const dates = scheduleDates(monday, [1, 3, 5], 4);
      expect(dates.map(toDateKey)).toEqual([
        '2026-08-03',
        '2026-08-05',
        '2026-08-07',
        '2026-08-10',
      ]);
    });

    it('treats no stated working days as open every day', () => {
      // The M16 rule: an empty `workingDays` is "unspecified", not "closed".
      // A kitchen that filled in nothing must not silently stop taking orders.
      const dates = scheduleDates(monday, [1, 2, 3, 4, 5], 3, { workingDays: [] });
      expect(dates.map(toDateKey)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
    });

    it('skips days the kitchen does not work', () => {
      // Buyer wants Mon/Tue/Wed; kitchen works Mon and Wed only.
      // 3rd Mon, 5th Wed, 10th Mon.
      const dates = scheduleDates(monday, [1, 2, 3], 3, { workingDays: [1, 3] });
      expect(dates.map(toDateKey)).toEqual(['2026-08-03', '2026-08-05', '2026-08-10']);
    });

    it('pushes past a blackout instead of losing the meal', () => {
      // Wed 5 Aug is blacked out. Three weekday meals from Mon 3rd become
      // 3rd, 4th, 6th — the buyer paid for three meals, not three days.
      const dates = scheduleDates(monday, [1, 2, 3, 4, 5], 3, {
        blackoutDates: [new Date(Date.UTC(2026, 7, 5))],
      });
      expect(dates.map(toDateKey)).toEqual(['2026-08-03', '2026-08-04', '2026-08-06']);
      expect(dates).toHaveLength(3);
    });

    it('returns fewer dates than asked when the selection can never be met', () => {
      // Sundays only, from a kitchen that never works Sundays. The caller
      // must read a short array as a refusal, not as a short cycle.
      const dates = scheduleDates(monday, [0], 4, { workingDays: [1, 2, 3, 4, 5] });
      expect(dates).toHaveLength(0);
    });
  });

  describe('earliestStartDate', () => {
    it('never starts today, even with a short prep time', () => {
      const now = new Date(Date.UTC(2026, 7, 3, 11, 55));
      // 90 minutes of notice at 11:55 must not promise today's lunch.
      expect(toDateKey(earliestStartDate(now, 90))).toBe('2026-08-04');
    });

    it('uses the platform default rather than zero when nothing is stated', () => {
      const now = new Date(Date.UTC(2026, 7, 3, 8, 0));
      expect(DEFAULT_PREP_TIME_MINS).toBe(90);
      expect(toDateKey(earliestStartDate(now, null))).toBe('2026-08-04');
    });

    it('gives a slow kitchen the days it asked for', () => {
      const now = new Date(Date.UTC(2026, 7, 3, 8, 0));
      // 2880 minutes = 2 days.
      expect(toDateKey(earliestStartDate(now, 2880))).toBe('2026-08-05');
    });
  });
});
