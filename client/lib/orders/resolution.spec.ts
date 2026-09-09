import {
  CANCELLABLE_STATUSES,
  RETURN_WINDOW_DAYS,
  canCancel,
  canRequestReturn,
  resolutionState,
  returnWindowClosesAt,
} from "@/lib/orders/resolution";
import type { Order } from "@/lib/types";

/**
 * Two windows that decide whether somebody can get their money back, and
 * whether a home cook eats the cost of a cancellation. Every expectation
 * is arithmetic done on paper, not recorded from a run — a snapshot of
 * current behaviour would happily lock in a bug on a money rule.
 */
function orderOf(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    orderNumber: "HK2050",
    status: "placed",
    refundStatus: "none",
    placedAt: "2026-09-01T10:00:00.000Z",
    total: 500,
    ...over,
  } as Order;
}

const DAY = 24 * 60 * 60 * 1000;

describe("cancellation closes at packed", () => {
  it("is open while nothing has been packed", () => {
    // `pending-payment` included: an order that never captured anything
    // is the cheapest of all to call off.
    for (const status of ["pending-payment", "placed", "confirmed"] as const) {
      expect(canCancel(orderOf({ status }))).toBe(true);
    }
  });

  it("is shut from packed onward", () => {
    // Once a home cook has packed it, the cost lands on them — after that
    // the path is a return.
    for (const status of ["packed", "shipped", "delivered", "cancelled", "returned"] as const) {
      expect(canCancel(orderOf({ status }))).toBe(false);
    }
  });

  it("lists exactly three statuses, so widening it is a deliberate act", () => {
    expect([...CANCELLABLE_STATUSES]).toEqual(["pending-payment", "placed", "confirmed"]);
  });
});

describe("the return window", () => {
  const delivered = orderOf({
    status: "delivered",
    deliveredAt: "2026-09-01T10:00:00.000Z",
  });

  it("never opens on an order that has not been delivered", () => {
    // A return is about something that arrived. Cancellation covers the
    // rest, and the two must not overlap into "refund anything".
    for (const status of ["placed", "confirmed", "packed", "shipped"] as const) {
      expect(returnWindowClosesAt(orderOf({ status }))).toBeUndefined();
      expect(canRequestReturn(orderOf({ status }), new Date())).toBe(false);
    }
  });

  it("closes exactly seven days after delivery", () => {
    // 1 Sep 10:00 + 7 days = 8 Sep 10:00.
    expect(returnWindowClosesAt(delivered)?.toISOString()).toBe("2026-09-08T10:00:00.000Z");
    expect(canRequestReturn(delivered, new Date("2026-09-08T09:59:59.000Z"))).toBe(true);
    expect(canRequestReturn(delivered, new Date("2026-09-08T10:00:00.000Z"))).toBe(true);
    expect(canRequestReturn(delivered, new Date("2026-09-08T10:00:01.000Z"))).toBe(false);
    expect(RETURN_WINDOW_DAYS).toBe(7);
  });

  it("counts from placedAt only when deliveredAt is missing, and that is the stricter answer", () => {
    // Pre-M15 rows carry no `deliveredAt`. The fallback gives a SHORTER
    // window than the truth, which is the safe direction for a client
    // that only decides what to offer — the server is the authority.
    const legacy = orderOf({ status: "delivered", placedAt: "2026-08-01T10:00:00.000Z" });
    expect(returnWindowClosesAt(legacy)?.toISOString()).toBe("2026-08-08T10:00:00.000Z");
    expect(canRequestReturn(legacy, new Date("2026-09-01T10:00:00.000Z"))).toBe(false);
  });

  it("answers undefined rather than an Invalid Date on an unparseable stamp", () => {
    const broken = orderOf({ status: "delivered", deliveredAt: "not a date" });
    expect(returnWindowClosesAt(broken)).toBeUndefined();
    expect(canRequestReturn(broken, new Date())).toBe(false);
  });
});

describe("resolutionState", () => {
  const now = new Date("2026-09-02T10:00:00.000Z");

  it("reports an already-resolved order before either window", () => {
    // An order with a refund in flight must never also be offered a
    // cancel button — checking the windows first is how that happens.
    expect(resolutionState(orderOf({ status: "placed", refundStatus: "requested" }), now)).toBe(
      "resolved",
    );
    expect(resolutionState(orderOf({ status: "cancelled" }), now)).toBe("resolved");
    expect(
      resolutionState(orderOf({ status: "delivered", refundStatus: "refunded" }), now),
    ).toBe("resolved");
  });

  it("reports cancellable, returnable and closed", () => {
    expect(resolutionState(orderOf({ status: "confirmed" }), now)).toBe("cancellable");
    expect(
      resolutionState(orderOf({ status: "delivered", deliveredAt: "2026-09-01T10:00:00.000Z" }), now),
    ).toBe("returnable");
    expect(resolutionState(orderOf({ status: "shipped" }), now)).toBe("closed");
    expect(
      resolutionState(
        orderOf({ status: "delivered", deliveredAt: "2026-08-01T10:00:00.000Z" }),
        now,
      ),
    ).toBe("closed");
  });

  it("does not read the clock, so two callers cannot disagree", () => {
    // A server render and a device computing different answers about a
    // refund window is the React #418 shape with money attached.
    const order = orderOf({ status: "delivered", deliveredAt: "2026-09-01T10:00:00.000Z" });
    const inside = new Date("2026-09-05T10:00:00.000Z");
    const outside = new Date(inside.getTime() + 10 * DAY);
    expect(resolutionState(order, inside)).toBe("returnable");
    expect(resolutionState(order, outside)).toBe("closed");
  });
});
