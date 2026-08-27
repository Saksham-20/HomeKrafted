"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Gift, HandPlatter } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./SplitPanels.module.css";

type Half = "food" | "gifts";

/**
 * The landing screen's two halves (M51): homemade food on one side,
 * handcrafted gifts on the other, and whichever one you lean toward opens
 * to about three quarters of the width.
 *
 * **Why the split is the hero.** The site sells two unrelated things to
 * two different intents — somebody deciding what to eat tonight, and
 * somebody buying a present — and every version of this page before now
 * asked that question in a pair of 240px buttons under a paragraph. A
 * half-screen each states it at the size of the decision, and the
 * expansion is what makes it a choice rather than a poster: the half you
 * are heading for gets the photograph, the other stays legible.
 *
 * **The expansion is CSS, driven by one attribute.** `flex-grow` is a
 * number, so it animates; nothing here measures the viewport, sets a
 * width or writes a style. Two rules ride on that:
 *
 * - **It is skipped entirely under `prefers-reduced-motion`** — see the
 *   stylesheet. A panel that jumps from half the screen to three quarters
 *   with the transition stripped is worse than one that never moves, and
 *   the global reduced-motion floor only removes the *animation*, not the
 *   size change.
 * - **Focus counts as leaning toward it.** A keyboard visitor tabs
 *   through two links and the same half opens, so the interaction is not
 *   mouse-only decoration.
 *
 * **On a touch screen there is no hover, so the page scroll drives it.**
 * An `IntersectionObserver` opens whichever half is showing more of
 * itself, which is the touch equivalent of leaning: the panels are
 * stacked there, so scrolling down hands the screen from food to gifts.
 * It is attached only where `hover: none` — on a desktop the pointer is
 * the better signal and two systems fighting over one attribute is a
 * flicker.
 */
export function SplitPanels() {
  const [active, setActive] = useState<Half | null>(null);
  const foodRef = useRef<HTMLAnchorElement>(null);
  const giftsRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // A device with a real pointer already has hover and focus doing this
    // job; running both would leave the attribute being set twice from
    // two different signals every time somebody scrolls with a mouse.
    if (window.matchMedia("(hover: hover)").matches) return;

    const seen = new Map<Half, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const half = entry.target === foodRef.current ? "food" : "gifts";
          seen.set(half, entry.intersectionRatio);
        }
        const food = seen.get("food") ?? 0;
        const gifts = seen.get("gifts") ?? 0;
        // A dead band, because two halves within a few percent of each
        // other is somebody mid-scroll, not somebody choosing — without
        // it the panels swap back and forth under the thumb.
        if (Math.abs(food - gifts) < 0.12) setActive(null);
        else setActive(food > gifts ? "food" : "gifts");
      },
      { threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] },
    );

    const nodes = [foodRef.current, giftsRef.current].filter(Boolean) as Element[];
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const halves = [
    {
      key: "food" as const,
      ref: foodRef,
      href: "/shop",
      Icon: HandPlatter,
      eyebrow: "Order in",
      title: "Homemade food",
      blurb: "Cooked this morning in a home kitchen near you — browse the kitchens, not a shelf.",
      cta: "Find a kitchen",
      src: "/images/site/food-delivery.jpg",
      alt: "A homemade meal being packed for delivery",
    },
    {
      key: "gifts" as const,
      ref: giftsRef,
      href: "/gifts",
      Icon: Gift,
      eyebrow: "Send one",
      title: "Handcrafted gifts",
      blurb: "Made by hand by independent HomeKrafters, and posted anywhere in India.",
      cta: "Browse gifts",
      src: "/images/site/hero-hamper.jpg",
      alt: "A festive gift hamper of homemade sweets, pickles and dry fruit",
    },
  ];

  return (
    <div className={styles.split} data-active={active ?? "none"}>
      {halves.map(({ key, ref, href, Icon, eyebrow, title, blurb, cta, src, alt }) => (
        <Link
          key={key}
          ref={ref}
          href={href}
          className={clsx(styles.panel, styles[key])}
          onPointerEnter={() => setActive(key)}
          onPointerLeave={() => setActive((current) => (current === key ? null : current))}
          onFocus={() => setActive(key)}
          onBlur={() => setActive((current) => (current === key ? null : current))}
        >
          {/* `alt=""` — the panel's own heading says the same thing one
              node later, and `priority` because one of these two is the
              landing page's LCP element whichever way the split falls. */}
          <ImageSlot
            ratio="4/5"
            label={`${title} photograph`}
            alt=""
            src={src}
            sizes="(max-width: 780px) 100vw, 50vw"
            className={styles.photo}
            priority
          />
          <span className="hk-sr-only">{alt}</span>
          <span className={styles.body}>
            <span className={styles.eyebrow}>
              <Icon className={styles.icon} aria-hidden="true" />
              {eyebrow}
            </span>
            <span className={styles.title}>{title}</span>
            <span className={styles.blurb}>{blurb}</span>
            <span className={styles.cta}>
              {cta}
              <ArrowRight className={styles.ctaIcon} aria-hidden="true" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
