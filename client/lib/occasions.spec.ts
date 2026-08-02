import type { Occasion } from "@/lib/types";
import {
  SEASONAL_BANNER_DAYS,
  countdownLabel,
  currentSeasonalOccasion,
  daysUntil,
  groupOccasions,
} from "@/lib/occasions";

/**
 * Occasion dates are set by a person, one year at a time, because Diwali
 * and Raksha Bandhan are lunisolar — a recurrence rule would be wrong for
 * exactly the occasions the hub exists for. What these tests guard is the
 * consequence of that: the countdown, the seasonal cutoff, and the
 * distinction between "has no date" (a birthday) and "the date has gone".
 */

const NOW = new Date(2026, 7, 2, 14, 30); // Sun 2 Aug 2026, mid-afternoon

function occasion(id: string, name: string, celebratedOn?: string): Occasion {
  return { id, slug: id, name, initial: name[0], celebratedOn };
}

describe("daysUntil", () => {
  it("counts whole days from midnight, not from the current hour", () => {
    // Compared at day granularity so "today" doesn't flip to "yesterday"
    // at 00:01, and an afternoon visit doesn't round tomorrow down to 0.
    expect(daysUntil("2026-08-02", NOW)).toBe(0);
    expect(daysUntil("2026-08-03", NOW)).toBe(1);
    expect(daysUntil("2026-08-01", NOW)).toBe(-1);
  });

  it("survives a month and a year boundary", () => {
    expect(daysUntil("2026-09-01", NOW)).toBe(30);
    expect(daysUntil("2027-01-01", NOW)).toBe(152);
  });
});

describe("groupOccasions", () => {
  const occasions = [
    occasion("diwali", "Diwali", "2026-11-08"),
    occasion("rakhi", "Raksha Bandhan", "2026-08-28"),
    occasion("birthday", "Birthdays"),
    occasion("thanks", "Thank you"),
    occasion("holi", "Holi", "2026-03-04"),
  ];

  it("splits dated-ahead, evergreen and passed", () => {
    const { upcoming, evergreen, passed } = groupOccasions(occasions, NOW);
    expect(upcoming.map((u) => u.occasion.id)).toEqual(["rakhi", "diwali"]);
    expect(evergreen.map((e) => e.id)).toEqual(["birthday", "thanks"]);
    expect(passed.map((p) => p.occasion.id)).toEqual(["holi"]);
  });

  it("sorts upcoming soonest-first and evergreen alphabetically", () => {
    const { upcoming, evergreen } = groupOccasions(occasions, NOW);
    expect(upcoming.map((u) => u.days)).toEqual([26, 98]);
    expect(evergreen.map((e) => e.name)).toEqual(["Birthdays", "Thank you"]);
  });

  it("keeps an occasion upcoming on the day it falls on", () => {
    // Zero is upcoming, not passed. The day itself is when people
    // panic-buy, and dropping it then is the worst possible moment.
    const today = [occasion("today", "Today's festival", "2026-08-02")];
    const { upcoming, passed } = groupOccasions(today, NOW);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].days).toBe(0);
    expect(passed).toHaveLength(0);
  });

  it("treats a missing date as evergreen, never as passed", () => {
    // `null` means "no season", not "missing data" — a birthday listed
    // under passed occasions would be a bug nobody would report.
    const { evergreen, passed, upcoming } = groupOccasions([occasion("b", "Birthdays")], NOW);
    expect(evergreen).toHaveLength(1);
    expect(passed).toHaveLength(0);
    expect(upcoming).toHaveLength(0);
  });

  it("handles an empty list without inventing groups", () => {
    expect(groupOccasions([], NOW)).toEqual({ upcoming: [], evergreen: [], passed: [] });
  });
});

describe("currentSeasonalOccasion", () => {
  it("picks the soonest occasion inside the banner window", () => {
    const found = currentSeasonalOccasion(
      [occasion("diwali", "Diwali", "2026-11-08"), occasion("rakhi", "Raksha Bandhan", "2026-08-28")],
      NOW,
    );
    expect(found?.occasion.id).toBe("rakhi");
    expect(found?.days).toBe(26);
  });

  it("shows nothing when the next occasion is further out than six weeks", () => {
    // A banner that is always there is furniture, and nobody reads
    // furniture.
    expect(SEASONAL_BANNER_DAYS).toBe(42);
    const far = currentSeasonalOccasion([occasion("d", "Diwali", "2026-11-08")], NOW);
    expect(far).toBeUndefined();
  });

  it("includes an occasion exactly on the boundary", () => {
    const boundary = currentSeasonalOccasion([occasion("x", "X", "2026-09-13")], NOW);
    expect(boundary?.days).toBe(42);
  });

  it("shows nothing when only evergreen occasions exist", () => {
    expect(currentSeasonalOccasion([occasion("b", "Birthdays")], NOW)).toBeUndefined();
  });
});

describe("countdownLabel", () => {
  it("names the near days rather than counting them", () => {
    expect(countdownLabel(0)).toBe("Today");
    expect(countdownLabel(1)).toBe("Tomorrow");
    expect(countdownLabel(2)).toBe("in 2 days");
    expect(countdownLabel(13)).toBe("in 13 days");
  });

  it("switches to weeks at a fortnight and months at two", () => {
    expect(countdownLabel(14)).toBe("in 2 weeks");
    expect(countdownLabel(59)).toBe("in 8 weeks");
    expect(countdownLabel(60)).toBe("in 2 months");
    expect(countdownLabel(365)).toBe("in 12 months");
  });

  it("never renders a plural one", () => {
    // Rounding makes "in 1 weeks" reachable from several day counts.
    for (let days = 0; days <= 400; days += 1) {
      expect(countdownLabel(days)).not.toMatch(/\b1 (weeks|months)\b/);
    }
  });

  it("treats a passed occasion as Today rather than negative", () => {
    // Reachable if an admin lets a date slip; "in -3 days" is worse than
    // a stale banner.
    expect(countdownLabel(-3)).toBe("Today");
  });
});
