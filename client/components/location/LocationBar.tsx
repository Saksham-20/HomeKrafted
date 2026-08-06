"use client";

import { MapPin } from "lucide-react";
import { useLocation } from "@/lib/location/LocationContext";
import styles from "./LocationBar.module.css";

/**
 * What this listing is filtered to, and the way to change it.
 *
 * Two gaps this closes, both found by the production audit sweep.
 *
 * **Nothing said what was being shown.** CLAUDE.md's location rule is
 * "no coords → the API returns the *full* catalogue, **and the UI says
 * so**". The first half shipped in M12 and the second half never did, so
 * `/shop` read "8 small-batch products from home kitchens across India"
 * whether it was filtered to one sector or not filtered at all.
 *
 * **Answering the prompt was irreversible.** `LocationPrompt` sets
 * `asked: true` and never shows again, and nothing else called
 * `clear()` — whose own doc comment already described it as "the change
 * area affordance". So a buyer who skipped the prompt, or picked an area
 * and then moved, had no route back short of clearing `localStorage`.
 * The function existed; only the button was missing.
 *
 * Renders nothing until `ready`, because the stored location is read from
 * `localStorage` after mount — same reason `LocationPrompt` waits, and
 * the same React #418 lesson as the schedule.
 */
export function LocationBar() {
  const { ready, area, source, clear } = useLocation();

  if (!ready) return null;

  const filtered = source !== "none";

  return (
    <div className={styles.bar}>
      <MapPin size={15} strokeWidth={1.8} className={styles.icon} aria-hidden="true" />
      <span className={styles.text}>
        {filtered ? (
          <>
            Showing what can reach{" "}
            <b className={styles.area}>
              {area ? `${area.label}, ${area.city}` : "your location"}
            </b>
          </>
        ) : (
          <>Showing everything — we don’t know where you are</>
        )}
      </span>
      <button type="button" className={styles.change} onClick={clear}>
        {filtered ? "Change area" : "Set your area"}
      </button>
    </div>
  );
}
