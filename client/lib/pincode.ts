/**
 * Client-side pincode handling (M36).
 *
 * **This file checks shape only, and it is deliberately looser than the
 * server.** The 19,238-entry India Post table lives on the server
 * (`server/src/common/pincodes.ts`) and is never shipped to the browser —
 * it is 1.8 MB, and duplicating it would also recreate the
 * `lib/geo.ts` / `server/src/common/geo.ts` hazard, where two copies of
 * the same table must be kept byte-identical or buyers and kitchens
 * resolve to different points.
 *
 * The same rule as the two identifier parsers (CLAUDE.md, M17) applies,
 * for the same reason and in the same direction: the client may be
 * looser, never tighter. A false positive here costs one request and a
 * clear message naming the pincode. A false negative strands somebody at
 * a dead button with a valid pincode typed in and nothing to fix.
 */

/** Six digits, and no Indian pincode starts with zero. */
const PINCODE_SHAPE = /^[1-9]\d{5}$/;

export function isPincodeShape(value: string): boolean {
  return PINCODE_SHAPE.test(value.trim());
}

/** What `GET /pincodes/:pincode` answers with. */
export interface PincodeLookup {
  pincode: string;
  district: string;
  state: string;
  /**
   * Whether Homekrafted delivers here yet.
   *
   * **Chooses copy, never visibility.** A buyer outside the serviced
   * area still sees the whole catalogue — CLAUDE.md's standing rule is
   * that location is never a gate, because an empty page cannot be told
   * apart from a broken site by the visitor *or* by us. It is also
   * ignored entirely on `/sell`: applying is national, and gating supply
   * on the launch city is the bug M36 removed.
   */
  serviced: boolean;
  /** How far apart this pincode's post offices are — the admin screen's business, not a buyer's. */
  spreadKm: number;
  approximate: boolean;
}
