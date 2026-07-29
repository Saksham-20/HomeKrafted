"use client";

import { MapPin } from "lucide-react";
import { useLocation } from "@/lib/location/LocationContext";
import { areasByCity } from "@/lib/geo";
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
export function DeliveryLocationConfirm() {
  const { ready, area, source, coords, setArea, requestBrowserLocation, locating } = useLocation();

  if (!ready) return null;

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
          <select
            className={styles.select}
            defaultValue=""
            onChange={(event) => event.target.value && setArea(event.target.value)}
            aria-label="Delivery area"
          >
            <option value="">Choose your area…</option>
            {areasByCity().map((group) => (
              <optgroup key={group.city} label={group.city}>
                {group.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
