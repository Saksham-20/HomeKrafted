import { getOrderStatusSteps } from "./history";
import { ORDER_STAGE_LABEL } from "@/lib/kitchen-copy";

/**
 * The buyer's order stepper.
 *
 * Worth pinning because M28 changed two things at once: the labels became
 * kitchen-diary copy, and `OrderConfirmation` stopped holding its own
 * hardcoded copy of them and started deriving from this function. Either
 * change alone is safe; together they are exactly the shape where a
 * confirmation screen quietly keeps saying "Placed → Confirmed → Packed"
 * while the history row two clicks away says something else.
 */
describe("getOrderStatusSteps", () => {
  it("walks the five stages and marks the current one", () => {
    const steps = getOrderStatusSteps("packed");
    expect(steps.map((s) => s.label)).toEqual([
      ORDER_STAGE_LABEL.placed,
      ORDER_STAGE_LABEL.confirmed,
      ORDER_STAGE_LABEL.packed,
      ORDER_STAGE_LABEL.shipped,
      ORDER_STAGE_LABEL.delivered,
    ]);
    expect(steps.map((s) => s.done)).toEqual([true, true, true, false, false]);
    expect(steps.filter((s) => s.current).map((s) => s.label)).toEqual([
      ORDER_STAGE_LABEL.packed,
    ]);
  });

  it("ticks everything once delivered", () => {
    expect(getOrderStatusSteps("delivered").every((s) => s.done)).toBe(true);
  });

  it("shows a freshly placed order one tick, not five", () => {
    const steps = getOrderStatusSteps("placed");
    expect(steps.filter((s) => s.done)).toHaveLength(1);
    expect(steps[0].label).toBe(ORDER_STAGE_LABEL.placed);
  });

  /**
   * The reason deriving beats hardcoding. `OrderConfirmation` used to
   * render "Placed ✓" unconditionally, so an order still waiting on
   * payment was shown a tick it had not earned.
   */
  it("does not claim an unpaid order was placed", () => {
    const steps = getOrderStatusSteps("pending-payment");
    expect(steps).toHaveLength(1);
    expect(steps[0].done).toBe(false);
    expect(steps.some((s) => s.label === ORDER_STAGE_LABEL.placed)).toBe(false);
  });

  /**
   * Cancelled and returned collapse to two steps rather than stalling
   * mid-pipeline — and stay plain. There is no warm way to say an order
   * did not happen, so the diary copy deliberately stops here.
   */
  it.each([
    ["cancelled", "Cancelled"],
    ["returned", "Returned"],
  ] as const)("collapses %s to a two-step line", (status, ending) => {
    const steps = getOrderStatusSteps(status);
    expect(steps.map((s) => s.label)).toEqual([ORDER_STAGE_LABEL.placed, ending]);
    expect(steps.every((s) => s.done)).toBe(true);
  });
});
