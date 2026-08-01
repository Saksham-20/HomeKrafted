"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocation } from "@/lib/location/LocationContext";
import { areasByCity } from "@/lib/geo";
import styles from "./LocationPrompt.module.css";

/** Everything focusable inside the card, in DOM order — same list the mobile drawer traps against. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Derived at render rather than stored via an effect: `asked` comes from
  // localStorage, so gating on `ready` stops the prompt flashing at
  // returning visitors during hydration, with no cascading setState.
  const open = ready && !asked && !closed;

  /**
   * Focus management (M16). This announces itself as `aria-modal="true"`
   * and did none of the three things that claim obliges: focus never
   * moved in, Tab walked straight out into the page behind it, and
   * Escape did nothing.
   *
   * Escape maps to "skip" rather than a silent close, because dismissing
   * is a real answer here — `dismiss()` records that we asked, so a
   * visitor who hits Escape isn't asked again on every page.
   */
  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    card?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
        setClosed(true);
        return;
      }
      if (event.key !== "Tab" || !card) return;

      const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open, dismiss]);

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
      <div className={styles.card} ref={cardRef}>
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
