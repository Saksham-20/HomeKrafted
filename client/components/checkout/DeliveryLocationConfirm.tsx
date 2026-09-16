"use client";

import { MapPin } from "lucide-react";
import { useLocation } from "@/lib/location/LocationContext";
import { PincodeLocation } from "@/components/location/PincodeLocation";
import styles from "./DeliveryLocationConfirm.module.css";

/**
 * The second location ask, at the moment it starts costing money.
 *
 * Someone can browse the whole site having skipped the opening prompt, and
 * paying is the point where a vague "somewhere in the tricity" stops being
 * good enough — the kitchen needs to know the order is inside its delivery
 * radius before it starts cooking.
 *
 * So: if we already know where they are, this confirms it and offers a
 * change. If we don't, it asks once, inline, without blocking the Place
 * order button — a hard gate here would lose a checkout over a field the
 * delivery address already largely answers.
 */
export interface DeliveryLocationConfirmProps {
  hasSelectedAddress?: boolean;
}

export function DeliveryLocationConfirm({ hasSelectedAddress }: DeliveryLocationConfirmProps = {}) {
  const { ready, area, source, coords, requestBrowserLocation, locating } = useLocation();

  if (!ready || hasSelectedAddress) return null;

  const known = Boolean(coords);

  return (
    <div className={styles.band}>
      <span className={styles.icon}>
        <MapPin size={15} strokeWidth={1.8} aria-hidden="true" />
      </span>

      {known ? (
        <>
          <span className={styles.text}>
            Delivering to <span className={styles.place}>{area ? `${area.label}, ${area.city}` : "your current location"}</span>
            <span className={styles.muted}>
              {source === "gps"
                ? "Based on your device location."
                : "Based on the area you picked."}
            </span>
          </span>
          <button
            type="button"
            className={styles.change}
            onClick={() => void requestBrowserLocation()}
            disabled={locating}
          >
            {locating ? "Updating…" : "Update location"}
          </button>
        </>
      ) : (
        <>
          <span className={styles.text}>
            Which area are we delivering to?
            <span className={styles.muted}>
              Kitchens only accept orders inside their delivery range.
            </span>
          </span>
          {/* Six digits, not a list of hand-written sectors — see
              `PincodeLocation`. */}
          <PincodeLocation />
        </>
      )}
    </div>
  );
}
