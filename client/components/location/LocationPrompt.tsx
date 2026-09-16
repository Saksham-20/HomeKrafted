"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MapPin } from "lucide-react";
import { PincodeLocation } from "./PincodeLocation";
import { Button } from "@/components/ui/Button";
import { useLocation } from "@/lib/location/LocationContext";
import { FOCUSABLE, trapTab } from "@/lib/focus-trap";
import styles from "./LocationPrompt.module.css";

/**
 * Consumer routes where the visitor is mid-task and the ask can wait.
 *
 * `/gifts` (2026-09-16, docs/GIFTING-REWORK.md D8): every gift ships
 * nationwide, so where somebody lives changes nothing on that page, and
 * the modal's own copy is about kitchens cooking nearby. It opened over
 * the gifts grid on every first visit.
 */
const SUPPRESSED_ON = ["/login", "/signup", "/forgot-password", "/reset-password", "/checkout", "/gifts"];

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
 *
 * **Consumer surfaces only.** It is mounted in the root layout, which the
 * staff surfaces share, so it used to open over `/admin/login` and the
 * whole seller portal — asking an admin signing in which neighbourhood to
 * deliver their groceries to. Not merely odd: it is `aria-modal` with a
 * real focus trap, so it *took* focus on the admin login page and held Tab
 * inside itself while somebody tried to type their password. Found by the
 * first browser-level test ever run against this app, which could not
 * click the sign-in button.
 */
export function LocationPrompt() {
  const pathname = usePathname();
  const { ready, asked, locating, error, requestBrowserLocation, dismiss } = useLocation();
  // Closes the moment the user answers, before the persisted `asked` flag
  // has round-tripped through storage.
  const [closed, setClosed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Derived at render rather than stored via an effect: `asked` comes from
  // localStorage, so gating on `ready` stops the prompt flashing at
  // returning visitors during hydration, with no cascading setState.
  // Staff surfaces have no delivery area, and an auth surface is somewhere
  // the visitor already has a task in hand — opening a modal over the
  // password field to ask about groceries is friction for nothing.
  // Suppressing it here costs nothing either: `asked` is only recorded
  // when they actually answer, so the ask simply happens on the next page.
  const suppressed =
    !pathname ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/seller") ||
    SUPPRESSED_ON.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const open = ready && !asked && !closed && !suppressed;

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
      trapTab(card, event);
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
          Discover home kitchens cooking near you. Tell us your area and we&rsquo;ll only show food that can actually reach you fresh.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button variant="primary" onClick={handleUseLocation} disabled={locating}>
            {locating ? "Finding you…" : "Use my current location"}
          </Button>

          <div className={styles.divider}>or enter your pincode</div>

          <PincodeLocation onResolved={() => setClosed(true)} />

          <button type="button" className={styles.skip} onClick={handleSkip}>
            Skip for now — show me everything
          </button>
        </div>
      </div>
    </div>
  );
}
