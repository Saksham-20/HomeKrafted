import { formatCount, formatCurrency, formatDate, formatDayLabel, formatShortDate } from ".";

/**
 * Money and dates render in front of a buyer on every screen, and the
 * failure mode is not a crash — it is a price that reads plausibly and is
 * wrong. Indian digit grouping in particular (₹1,00,000, not ₹100,000) is
 * the kind of thing that only breaks when a locale or an Intl default
 * shifts underneath.
 */

describe("formatCurrency", () => {
  it("groups in lakhs, not thousands", () => {
    expect(formatCurrency(1250)).toBe("₹1,250");
    expect(formatCurrency(100000)).toBe("₹1,00,000");
    expect(formatCurrency(12500000)).toBe("₹1,25,00,000");
  });

  it("shows whole rupees — paise are noise at this price point", () => {
    expect(formatCurrency(249.4)).toBe("₹249");
    expect(formatCurrency(249.6)).toBe("₹250");
  });

  it("renders zero as an amount rather than nothing", () => {
    expect(formatCurrency(0)).toBe("₹0");
  });

  it("takes the ledger sign from the value, using a real minus glyph", () => {
    expect(formatCurrency(1000, { sign: true })).toBe("+ ₹1,000");
    expect(formatCurrency(-560, { sign: true })).toBe("− ₹560");
    // A hyphen would be a different character from the one the wallet's
    // debit rows are designed around.
    expect(formatCurrency(-560, { sign: true })).not.toContain("-");
  });

  it("never leaks a bare negative when unsigned", () => {
    expect(formatCurrency(-560)).toBe("₹560");
  });
});

describe("formatCount", () => {
  it("leaves small counts exact", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(980)).toBe("980");
    expect(formatCount(999)).toBe("999");
  });

  it("switches to k at a thousand and M at a million", () => {
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(18400)).toBe("18.4k");
    expect(formatCount(1_000_000)).toBe("1M");
    expect(formatCount(1_200_000)).toBe("1.2M");
  });

  it("drops the decimal once it stops carrying information", () => {
    expect(formatCount(120000)).toBe("120k");
    expect(formatCount(2000)).toBe("2k");
  });
});

describe("date formatting", () => {
  const date = new Date(2026, 6, 19, 10, 0); // Sun 19 Jul 2026

  it("renders day, short month and year", () => {
    expect(formatDate(date)).toBe("19 Jul 2026");
  });

  it("drops the year for compact pickers", () => {
    expect(formatShortDate(date)).toBe("19 Jul");
  });

  it("gives a short weekday", () => {
    expect(formatDayLabel(date)).toBe("Sun");
  });

  it("accepts an ISO string as well as a Date", () => {
    // Everything off the API arrives as a string.
    expect(formatDate("2026-07-19T04:30:00.000Z")).toBe(formatDate(new Date("2026-07-19T04:30:00.000Z")));
  });
});
