"use client";

import { useEffect, useRef, useState } from "react";
import { lookupPincode } from "@/lib/api";
import { isPincodeShape, type PincodeLookup } from "@/lib/pincode";

export interface PincodeLookupState {
  data?: PincodeLookup;
  loading: boolean;
  /** Set when the pincode is well-formed and India Post has no such code. */
  unknown: boolean;
  /** Set when the request itself failed — a different problem, and not the applicant's. */
  unreachable: boolean;
}

const IDLE: PincodeLookupState = { loading: false, unknown: false, unreachable: false };

/**
 * Resolves a typed pincode to its district and state (M36).
 *
 * The form has no address lookup, so this echo is the only confirmation
 * an applicant gets that they typed the right six digits — "134109 →
 * Panchkula, Haryana" catches a transposed pair in a way re-reading the
 * digits does not.
 *
 * Three things it deliberately does:
 *
 * **Waits until the shape is complete.** Firing on every keystroke would
 * mean five guaranteed 404s on the way to a valid pincode, each one
 * rendering "we don't recognise that" under a box somebody is still
 * typing in — the form arguing with a half-finished answer, which is the
 * same mistake the `touched` map exists to avoid elsewhere on this
 * screen.
 *
 * **Distinguishes "no such pincode" from "the request failed."** They
 * look identical from a rejected promise and they are not the same
 * message: one is a typo the applicant can fix, the other is ours and
 * must never be phrased as their mistake (`docs/ERROR-HANDLING.md` — copy
 * names the right party).
 *
 * **Ignores a stale response.** Typing past one pincode into another
 * leaves two requests in flight, and without the sequence guard the
 * slower one can land last and label the new pincode with the old
 * district — a wrong answer that looks exactly like a right one.
 */
export function usePincodeLookup(pincode: string): PincodeLookupState {
  /**
   * The answer, tagged with the pincode it is an answer *to*.
   *
   * Only settled results are stored. "Idle" and "loading" are derived
   * below rather than written, because each is a pure function of the
   * typed value and the last settled answer — storing them would mean
   * calling `setState` in the effect body on every keystroke, which is
   * cascading renders for something nobody needed to remember.
   */
  const [settled, setSettled] = useState<{ pincode: string; state: PincodeLookupState } | null>(
    null,
  );
  const sequence = useRef(0);
  const value = pincode.trim();
  const wellFormed = isPincodeShape(value);
  const answered = settled?.pincode === value;

  useEffect(() => {
    if (!wellFormed || answered) return;
    const ticket = ++sequence.current;

    lookupPincode(value)
      .then((data) => {
        if (ticket !== sequence.current) return;
        setSettled({
          pincode: value,
          state: data
            ? { data, loading: false, unknown: false, unreachable: false }
            : { loading: false, unknown: true, unreachable: false },
        });
      })
      .catch(() => {
        if (ticket !== sequence.current) return;
        setSettled({
          pincode: value,
          state: { loading: false, unknown: false, unreachable: true },
        });
      });
  }, [value, wellFormed, answered]);

  if (!wellFormed) return IDLE;
  if (!answered) return { loading: true, unknown: false, unreachable: false };
  return settled.state;
}
