import { QUEUE_STALE_MS, shouldRefetchQueues } from "@/lib/portal/queue-poll";

describe("the admin queue-badge poll", () => {
  const T0 = 1_800_000_000_000;

  test("a focus right after a fetch does not fetch again — the throttle that did not exist", () => {
    // The defect: the handler saw lastPollAt = 0, so this was `true`.
    expect(shouldRefetchQueues({ now: T0 + 1_000, lastPollAt: T0, visible: true })).toBe(false);
    expect(shouldRefetchQueues({ now: T0 + 59_999, lastPollAt: T0, visible: true })).toBe(false);
  });

  test("exactly a minute is still fresh; past it, a focus refreshes", () => {
    expect(shouldRefetchQueues({ now: T0 + QUEUE_STALE_MS, lastPollAt: T0, visible: true })).toBe(false);
    expect(shouldRefetchQueues({ now: T0 + QUEUE_STALE_MS + 1, lastPollAt: T0, visible: true })).toBe(true);
  });

  test("never polled counts as stale", () => {
    expect(shouldRefetchQueues({ now: T0, lastPollAt: 0, visible: true })).toBe(true);
  });

  test("a hidden tab does not poll, however stale", () => {
    expect(shouldRefetchQueues({ now: T0 + 10 * QUEUE_STALE_MS, lastPollAt: T0, visible: false })).toBe(false);
  });

  test("the window is the documented sixty seconds", () => {
    expect(QUEUE_STALE_MS).toBe(60_000);
  });
});
