import {
  DEFAULT_LEAD_TIME_MINUTES,
  DELIVERY_WINDOWS,
  SCHEDULE_HORIZON_DAYS,
  bookableDays,
  describeSlot,
  firstAvailableSlot,
  getScheduleDays,
} from "@/lib/schedule";

/**
 * The scheduler decides what a buyer is allowed to ask a kitchen for, so
 * every bug in it is either an order a home cook cannot make or a slot a
 * buyer cannot have. It was also the module whose lead-time filter was
 * written wrong once during M16 and caught by hand — these are the cases
 * that catch it next time.
 *
 * Every expectation below is arithmetic done on paper first, not recorded
 * from a run: a snapshot of current behaviour would have happily locked in
 * that bug.
 *
 * Fixtures anchor on **Sunday 2 August 2026**, so the weekly-pattern cases
 * start on a day most kitchens are closed.
 */

const SUNDAY = (h: number, m = 0) => new Date(2026, 7, 2, h, m, 0, 0);

// Windows open at 09:00, 12:00, 15:00 and 18:00.
const [W9, W12, W15, W18] = DELIVERY_WINDOWS.map((w) => w.id);

describe("getScheduleDays — the pre-M16 contract, unchanged", () => {
  it("uses a 90-minute lead time when no kitchen is named", () => {
    expect(DEFAULT_LEAD_TIME_MINUTES).toBe(90);
  });

  it("drops today's windows that open inside the lead time", () => {
    // 08:00 + 90 min = 09:30 cutoff. The 9 AM window has already opened
    // too soon; the other three are still reachable.
    const [today] = getScheduleDays(3, SUNDAY(8));
    expect(today.isToday).toBe(true);
    expect(today.day).toBe("Today");
    expect(today.windows.map((w) => w.id)).toEqual([W12, W15, W18]);
  });

  it("keeps a window that opens exactly on the cutoff", () => {
    // 07:30 + 90 = 09:00 exactly. Bookable — the rule is "opens at least
    // `lead` from now", and a kitchen with exactly its stated notice has
    // its stated notice.
    const [today] = getScheduleDays(1, SUNDAY(7, 30));
    expect(today.windows.map((w) => w.id)).toEqual([W9, W12, W15, W18]);
  });

  it("drops today entirely once every window has passed", () => {
    // 19:00 + 90 = 20:30; the last window opened at 18:00. Today has
    // nothing to offer and nothing to explain, so it is not listed at all
    // — the one case where a missing day is correct.
    const days = getScheduleDays(SCHEDULE_HORIZON_DAYS, SUNDAY(19));
    expect(days[0].day).toBe("Tomorrow");
    expect(days).toHaveLength(SCHEDULE_HORIZON_DAYS - 1);
    expect(days.every((d) => !d.isToday)).toBe(true);
  });

  it("offers every window on days after today", () => {
    const days = getScheduleDays(3, SUNDAY(8));
    expect(days[1].windows).toHaveLength(DELIVERY_WINDOWS.length);
    expect(days[2].windows).toHaveLength(DELIVERY_WINDOWS.length);
  });

  it("labels Today, Tomorrow, then the weekday", () => {
    const days = getScheduleDays(4, SUNDAY(8));
    expect(days.map((d) => d.day)).toEqual(["Today", "Tomorrow", "Tue", "Wed"]);
    expect(days.map((d) => d.date)).toEqual(["2 Aug", "3 Aug", "4 Aug", "5 Aug"]);
    expect(days.map((d) => d.isoDate)).toEqual([
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("rolls forward from now rather than from a fixed list", () => {
    const august = getScheduleDays(2, new Date(2026, 7, 2, 8));
    const december = getScheduleDays(2, new Date(2026, 11, 31, 8));
    expect(august[0].isoDate).toBe("2026-08-02");
    // Across a year boundary, which the hardcoded pickers this replaced
    // could not do.
    expect(december.map((d) => d.isoDate)).toEqual(["2026-12-31", "2027-01-01"]);
  });

  it("marks nothing unavailable when no availability is passed", () => {
    const days = getScheduleDays(SCHEDULE_HORIZON_DAYS, SUNDAY(8));
    expect(days.every((d) => d.unavailableReason === undefined)).toBe(true);
  });

  it("horizon is two weeks", () => {
    expect(SCHEDULE_HORIZON_DAYS).toBe(14);
  });
});

describe("getScheduleDays — a kitchen's own prep time", () => {
  it("a 48-hour prep time pushes the first slot out two days", () => {
    // 08:00 Sunday + 2880 min = 08:00 Tuesday. Monday's last window opens
    // at 18:00 Monday, still inside the notice; Tuesday's 9 AM is the
    // first that clears it.
    const days = getScheduleDays(SCHEDULE_HORIZON_DAYS, SUNDAY(8), { prepTimeMins: 2880 });
    expect(days[0].isoDate).toBe("2026-08-04");
    expect(days[0].day).toBe("Tue");
    expect(days[0].windows.map((w) => w.id)).toEqual([W9, W12, W15, W18]);
  });

  it("a one-hour prep time keeps today's later windows", () => {
    // 08:00 + 60 = 09:00 — the 9 AM window survives, unlike the 90-minute
    // default. This is the samosa cook the fixed platform lead time used
    // to hold back.
    const [today] = getScheduleDays(2, SUNDAY(8), { prepTimeMins: 60 });
    expect(today.windows.map((w) => w.id)).toEqual([W9, W12, W15, W18]);
  });

  it("a prep time longer than the horizon leaves nothing bookable", () => {
    const days = getScheduleDays(SCHEDULE_HORIZON_DAYS, SUNDAY(8), {
      prepTimeMins: 20 * 24 * 60,
    });
    expect(days).toHaveLength(0);
    expect(firstAvailableSlot(SUNDAY(8), { prepTimeMins: 20 * 24 * 60 })).toBeUndefined();
  });
});

describe("getScheduleDays — working days", () => {
  it("treats an empty working-day list as open every day", () => {
    // Absence is never a closure: a HomeKrafter who has filled in nothing
    // must not silently stop taking orders.
    const days = getScheduleDays(7, SUNDAY(8), { workingDays: [] });
    expect(days.every((d) => d.unavailableReason === undefined)).toBe(true);
  });

  it("treats an absent working-day list the same way", () => {
    const days = getScheduleDays(7, SUNDAY(8), { prepTimeMins: 90 });
    expect(days.every((d) => d.unavailableReason === undefined)).toBe(true);
  });

  it("keeps a closed day in the list, marked", () => {
    // Mon–Fri. Sunday and the following Saturday are closed, and both are
    // still present — a date that just isn't there reads as a bug.
    const days = getScheduleDays(8, SUNDAY(8), { workingDays: [1, 2, 3, 4, 5] });
    const byIso = new Map(days.map((d) => [d.isoDate, d]));
    expect(byIso.get("2026-08-02")?.unavailableReason).toBe("Not a cooking day");
    expect(byIso.get("2026-08-08")?.unavailableReason).toBe("Not a cooking day");
    expect(byIso.get("2026-08-03")?.unavailableReason).toBeUndefined();
    expect(byIso.get("2026-08-07")?.unavailableReason).toBeUndefined();
  });

  it("counts Sunday as 0", () => {
    // Off-by-one here would shift every kitchen's week by a day.
    const sundayOnly = getScheduleDays(3, SUNDAY(8), { workingDays: [0] });
    expect(sundayOnly[0].unavailableReason).toBeUndefined();
    expect(sundayOnly[1].unavailableReason).toBe("Not a cooking day");
  });
});

describe("getScheduleDays — blackout dates", () => {
  it("shows the kitchen's own reason", () => {
    const days = getScheduleDays(4, SUNDAY(8), {
      blackouts: [{ date: "2026-08-04", reason: "Closed for Diwali" }],
    });
    const tue = days.find((d) => d.isoDate === "2026-08-04");
    expect(tue?.unavailableReason).toBe("Closed for Diwali");
    expect(tue?.windows.length).toBeGreaterThan(0);
  });

  it("falls back to 'Closed' when no reason was given", () => {
    const days = getScheduleDays(4, SUNDAY(8), { blackouts: [{ date: "2026-08-04" }] });
    expect(days.find((d) => d.isoDate === "2026-08-04")?.unavailableReason).toBe("Closed");
  });

  it("beats the weekly pattern rather than being overridden by it", () => {
    // A blackout is the exception to the pattern, so its reason is the one
    // worth showing on a day that is both.
    const days = getScheduleDays(4, SUNDAY(8), {
      workingDays: [1, 2, 3, 4, 5],
      blackouts: [{ date: "2026-08-02", reason: "Family wedding" }],
    });
    expect(days[0].unavailableReason).toBe("Family wedding");
  });

  it("ignores a blackout outside the horizon", () => {
    const days = getScheduleDays(4, SUNDAY(8), {
      blackouts: [{ date: "2027-01-01", reason: "New Year" }],
    });
    expect(days.every((d) => d.unavailableReason === undefined)).toBe(true);
  });
});

describe("bookableDays / firstAvailableSlot", () => {
  it("drops closed days, unlike getScheduleDays", () => {
    const days = getScheduleDays(8, SUNDAY(8), { workingDays: [1, 2, 3, 4, 5] });
    const open = bookableDays(days);
    expect(days.length).toBeGreaterThan(open.length);
    expect(open.every((d) => d.unavailableReason === undefined)).toBe(true);
  });

  it("defaults to the soonest slot a kitchen can actually cook", () => {
    // Sunday closed, so the default lands on Monday's first window rather
    // than on a day the buyer would be bounced off at checkout.
    const slot = firstAvailableSlot(SUNDAY(8), { workingDays: [1, 2, 3, 4, 5] });
    expect(slot).toEqual({ dayId: "sd-2026-08-03", windowId: W9 });
  });

  it("defaults to today's first surviving window when the kitchen is open", () => {
    expect(firstAvailableSlot(SUNDAY(8))).toEqual({ dayId: "sd-2026-08-02", windowId: W12 });
  });

  it("skips a blacked-out first day", () => {
    const slot = firstAvailableSlot(SUNDAY(8), {
      blackouts: [{ date: "2026-08-02" }, { date: "2026-08-03" }],
    });
    expect(slot?.dayId).toBe("sd-2026-08-04");
  });
});

describe("describeSlot", () => {
  it("says Today and Tomorrow without a date", () => {
    expect(describeSlot("sd-2026-08-02", W12, SUNDAY(8))).toBe("Today, 12 – 2 PM");
    expect(describeSlot("sd-2026-08-03", W9, SUNDAY(8))).toBe("Tomorrow, 9 – 11 AM");
  });

  it("gives weekday and date further out", () => {
    expect(describeSlot("sd-2026-08-04", W18, SUNDAY(8))).toBe("Tue 4 Aug, 6 – 8 PM");
  });

  it("degrades to a sentence rather than throwing on an unknown slot", () => {
    // These ids ride in URLs and WhatsApp messages, so a stale one is a
    // matter of when, not if.
    expect(describeSlot("sd-1999-01-01", W9, SUNDAY(8))).toBe("As soon as possible");
    expect(describeSlot("sd-2026-08-02", "w-nope", SUNDAY(8))).toBe("As soon as possible");
  });
});
