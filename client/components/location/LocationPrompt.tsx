"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocation } from "@/lib/location/LocationContext";
import { areasByCity } from "@/lib/geo";
import styles from "./LocationPrompt.module.css";

/**
 * The opening "where are you?" ask.
 *
 * Shows once per browser, on first visit, and never again once answered —
 * `LocationContext` records `asked` either way, including on dismissal.
 *
 * Two routes in, on purpose. The browser prompt is the fast path; the area
 * picker is there because most people decline a location request from a
 * site they've just met, and someone who declines still has to be able to
 * shop. Dismissing is a first-class option: with no location we send no
 * coordinates and the catalogue comes back unfiltered.
 *
 * Deliberately *not* a hard gate. Blocking the catalogue behind a
 * permission grant is the version of this that loses first-time visitors.
 */
export function LocationPrompt() {
  const { ready, asked, locating, error, requestBrowserLocation, setArea, dismiss } = useLocation();
  // Closes the moment the user answers, before the persisted `asked` flag
  // has round-tripped through storage.
  const [closed, setClosed] = useState(false);
  const [pending, setPending] = useState("");

  // Derived at render rather than stored via an effect: `asked` comes from
  // localStorage, so gating on `ready` stops the prompt flashing at
  // returning visitors during hydration, with no cascading setState.
  const open = ready && !asked && !closed;
  if (!open) return null;

  async function handleUseLocation() {
    const ok = await requestBrowserLocation();
    // On failure keep the dialog open so the picker below is right there,
    // rather than dropping them back to the page with nothing resolved.
    if (ok) setClosed(true);
  }

  function handlePick(areaId: string) {
    setPending(areaId);
    if (!areaId) return;
    setArea(areaId);
    setClosed(true);
  }

  function handleSkip() {
    dismiss();
    setClosed(true);
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="hk-loc-title">
      <div className={styles.card}>
        <span className={styles.icon}>
          <MapPin size={20} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <h2 className={styles.title} id="hk-loc-title">
          Where should we deliver?
        </h2>
        <p className={styles.copy}>
          Homekrafted is home kitchens cooking near you across Chandigarh, Mohali, Panchkula and
          Zirakpur. Tell us your area and we&rsquo;ll only show food that can actually reach you.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleUseLocation} disabled={locating}>
            {locating ? "Finding you…" : "Use my current location"}
          </Button>

          <div className={styles.divider}>or pick your area</div>

          <select
            className={styles.select}
            value={pending}
            onChange={(event) => handlePick(event.target.value)}
            aria-label="Choose your area"
          >
            <option value="">Choose your area…</option>
            {areasByCity().map((group) => (
              <optgroup key={group.city} label={group.city}>
                {group.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <button type="button" className={styles.skip} onClick={handleSkip}>
            Skip for now — show me everything
          </button>
        </div>
      </div>
    </div>
  );
}
