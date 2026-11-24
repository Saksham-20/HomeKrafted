"use client";

import { useEffect, useSyncExternalStore } from "react";
import clsx from "clsx";
import { Snowflake } from "lucide-react";
import styles from "./SnowToggle.module.css";

const KEY = "hk:snow";
const listeners = new Set<() => void>();
// Paused for this page view even when storage refuses the write.
let pausedThisView: boolean | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function isOn(): boolean {
  if (pausedThisView !== null) return !pausedThisView;
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function setOn(on: boolean) {
  pausedThisView = !on;
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Unwritable storage: this page view only.
  }
  listeners.forEach((onChange) => onChange());
}

export interface SnowToggleProps {
  /** `glass` sits over the hero photograph; `plain` in the footer's legal line. */
  tone: "glass" | "plain";
}

/**
 * Pause / resume the season's snow — every snowing area on the page at
 * once (WCAG 2.2.2: moving content that starts on its own and lasts more
 * than five seconds needs a way to stop it, and decorative motion is not
 * exempt). Remembered across pages and visits.
 *
 * It also owns `<html data-snow>`, the attribute `Snowfall` waits for:
 * set after mount, so the server's HTML has no snow and a visitor who
 * paused it never sees it flash on. Hidden under reduced motion, where
 * there is no snow to pause.
 */
export function SnowToggle({ tone }: SnowToggleProps) {
  // The server (and first client render) assumes "on"; the stored answer
  // takes over after hydration.
  const on = useSyncExternalStore(subscribe, isOn, () => true);

  useEffect(() => {
    document.documentElement.dataset.snow = on ? "on" : "off";
  }, [on]);

  return (
    <button type="button" className={clsx(styles.toggle, styles[tone])} onClick={() => setOn(!on)}>
      <Snowflake size={14} strokeWidth={1.8} aria-hidden="true" />
      {on ? "Pause snow" : "Let it snow"}
    </button>
  );
}
