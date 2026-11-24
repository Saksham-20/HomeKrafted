"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useLocation } from "@/lib/location/LocationContext";
import styles from "./DeliveryLine.module.css";

/**
 * "Delivering to …" under the home page's header — the mockup's second
 * line, and the same question `LocationBar` asks on `/shop`.
 *
 * Pressing it clears the stored answer, which reopens `LocationPrompt`
 * (mounted in the root layout and not suppressed on `/`). Before the
 * context is ready it renders the generic line, not nothing, so the bar's
 * height never jumps on hydration.
 */
export function DeliveryLine() {
  const { ready, area, source, clear } = useLocation();
  const known = ready && source !== "none";
  const place = known && area ? `${area.label}, ${area.city}` : "your location";

  return (
    <button
      type="button"
      className={styles.line}
      onClick={clear}
      // Starts with the visible words (WCAG 2.5.3), then says what a press does.
      aria-label={`Delivering to ${place}. ${known ? "Change area" : "Set your area"}`}
    >
      <MapPin size={15} strokeWidth={1.9} className={styles.pin} aria-hidden="true" />
      <span>
        Delivering to <span className={styles.place}>{place}</span>
      </span>
      <ChevronDown size={15} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}
