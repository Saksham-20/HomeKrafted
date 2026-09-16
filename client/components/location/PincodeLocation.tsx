"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { lookupPincode } from "@/lib/api/site";
import { isPincodeShape } from "@/lib/pincode";
import { useLocation } from "@/lib/location/LocationContext";
import styles from "./PincodeLocation.module.css";

export interface PincodeLocationProps {
  /** Called once a pincode has resolved and been stored. */
  onResolved?: () => void;
}

/**
 * Place yourself by pincode (owner, 2026-09-16: "pick your area uses pin
 * code or current location, dont hard code any places and sectors").
 *
 * **This replaces a hand-written list of twenty-one tricity areas.** That
 * list was wrong in two ways at once. As a control it was a native
 * `<select>` of twenty-one options in three groups, which opened over the
 * dialog it belonged to and had to be scrolled. And as *data* it was a
 * constant in the client, so it could only ever answer for the launch
 * city — somebody in Faridabad had no way to say where they were, which
 * is exactly the waitlist bug M36 removed from the supply side. Six digits
 * works anywhere in India, and the coordinates come from the pincode table
 * rather than from a hardcoded sector.
 *
 * **A refusal here is never a dead end.** An unrecognised pincode says so
 * and leaves the field editable; it does not clear what the visitor typed,
 * and it never blocks browsing — location is never a gate, so "skip" stays
 * a first-class answer on the prompt around this.
 */
export function PincodeLocation({ onResolved }: PincodeLocationProps) {
  const { setPincode } = useLocation();
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = isPincodeShape(value);

  async function check() {
    if (!ready) return;
    setChecking(true);
    setError(null);
    try {
      const found = await lookupPincode(value);
      if (!found) {
        setError(`We don't recognise ${value}. Check the six digits and try again.`);
        return;
      }
      if (found.lat === undefined || found.lng === undefined) {
        // The table knows the place but not where it is. Saying so beats
        // storing a location we cannot actually point at.
        setError(`We know ${found.district} but can't place it on the map yet.`);
        return;
      }
      setPincode(found.pincode, found.lat, found.lng, `${found.district}, ${found.state}`);
      onResolved?.();
    } catch {
      // Ours, not theirs — never tell somebody to check a pincode that is
      // perfectly correct (docs/ERROR-HANDLING.md: name the right party).
      setError("We couldn't check that just now. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <form
        className={styles.row}
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <input
          className={styles.input}
          value={value}
          onChange={(event) => {
            setValue(event.target.value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="e.g. 160022"
          aria-label="Your pincode"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "hk-pin-error" : undefined}
        />
        <Button type="submit" variant="secondary" disabled={!ready || checking}>
          {checking ? "Checking…" : "Check"}
        </Button>
      </form>
      {error ? (
        <p className={styles.error} id="hk-pin-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
