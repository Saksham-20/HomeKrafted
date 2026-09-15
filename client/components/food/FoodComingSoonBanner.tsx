"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Clock, X } from "lucide-react";
import { FOOD_BANNER } from "@/lib/food-launch";
import { useFoodOrdersOpen } from "./useFoodOrdersOpen";
import styles from "./FoodComingSoon.module.css";

const DISMISS_KEY = "hk_food_soon_dismissed";

/**
 * The slim note at the top of the food side while food is coming soon.
 *
 * Dismissible for the tab's session — somebody browsing kitchens has read
 * it once, and a strip that returns on every page is noise. Nothing is
 * rendered until the setting is known to be off, so it never flashes on
 * for a visitor when food is open.
 */
export function FoodComingSoonBanner({ className }: { className?: string }) {
  const open = useFoodOrdersOpen();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Deferred a tick: browser storage is read after mount (M12), and a
    // synchronous setState in an effect body trips the hooks lint rule.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
      } catch {
        setDismissed(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (open !== false || dismissed) return null;

  return (
    <aside className={clsx(styles.banner, className)} aria-label="Food coming soon">
      <Clock size={18} strokeWidth={1.8} className={styles.bannerIcon} aria-hidden="true" />
      <p className={styles.bannerText}>
        <strong>{FOOD_BANNER.title}.</strong> {FOOD_BANNER.body}{" "}
        <Link href={FOOD_BANNER.href} className={styles.bannerLink}>
          {FOOD_BANNER.cta} →
        </Link>
      </p>
      <button
        type="button"
        className={styles.bannerClose}
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            window.sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // A blocked store only means the note returns next page.
          }
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}

/** A small "Coming soon" pill beside a food label — the landing split and the nav tab. */
export function FoodComingSoonTag({ className }: { className?: string }) {
  const open = useFoodOrdersOpen();
  if (open !== false) return null;
  return <span className={clsx(styles.tag, className)}>Coming soon</span>;
}
