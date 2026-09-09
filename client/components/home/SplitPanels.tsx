"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight, Gift, HandPlatter } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import styles from "./SplitPanels.module.css";

type Half = "food" | "gifts";

/**
 * The landing screen's two halves: homemade food on one side, handcrafted
 * gifts on the other. Level at rest, and the half you lean toward takes
 * about three quarters of the screen.
 *
 * **Why the split is the hero.** The site sells two unrelated things to
 * two different intents — somebody deciding what to eat tonight, and
 * somebody buying a present — and every version of this page before M51
 * asked that question in a pair of 240px buttons under a paragraph. A
 * half-screen each states it at the size of the decision, and the
 * expansion is what makes it a choice rather than a poster.
 *
 * **The seam is a diagonal, and that is the whole identity of the
 * screen.** A vertical rule down the middle of two photographs is the
 * generic version of this layout — the one every template ships. The
 * panels are laid over each other in a grid cell and clipped by a
 * `--seam` custom property (a percentage), so the boundary is one number
 * that animates: 50% at rest, 74/26 when a half is active. Nothing
 * measures the viewport, nothing writes a style, and there is no second
 * element pretending to be a divider.
 *
 * **The expansion is `clip-path` on the panels plus a counter-scale on
 * the photograph inside.** Clipping rather than resizing is what keeps
 * the two photographs from stretching as the seam moves, and it is the
 * detail that separates this from a `flex-grow` split: a growing flex
 * item re-lays-out its own contents, so the type inside jumps a few
 * pixels every frame.
 *
 * Three rules ride on it:
 *
 * - **It is skipped entirely under `prefers-reduced-motion`** (see the
 *   stylesheet). A panel that jumps from half the screen to three
 *   quarters with the transition stripped is worse than one that never
 *   moves — the global reduced-motion floor removes the *animation*, not
 *   the size change.
 * - **Focus counts as leaning toward it.** A keyboard visitor tabs
 *   through two links and the same half opens, so the interaction is not
 *   mouse-only decoration.
 * - **On a touch screen the halves stay level.** M51 had an
 *   `IntersectionObserver` open whichever stacked half was showing more
 *   of itself; measured on a 390×844 phone it opened the food half at
 *   load — so the page's question was only half asked above the fold —
 *   and the hand-off on every scroll was the page's **entire CLS**
 *   (0.067, twelve shifts; scrolling is not "recent input"). A tap
 *   already opens the half you meant.
 *
 * **Nothing opens while the pointer is in the middle** (owner,
 * 2026-08-29). Hover is read on the *container*, not per panel: the
 * pointer's x has to be inside the outer `LEAN` fraction of the width
 * before a half is called for, which leaves a third of the screen in the
 * middle where both halves stay level and the lockup between them stays
 * up. Entering a panel is not the same thing as choosing it — the
 * per-panel `onPointerEnter` version opened a half the instant the
 * pointer crossed the centre line on its way to anywhere, including the
 * header.
 *
 * `data-active` on the wrapper is also what the hero reads to collapse
 * the brand lockup above it — see `Hero.module.css`.
 *
 * **The two photographs are licensed stock, not our own and not
 * generated.** Both are Pexels (photos 8148149 and 7817374, Pexels
 * License — free for commercial use, no attribution required), and both
 * are **portrait**: a panel is a tall, narrow window, so a landscape
 * frame is cropped to whatever happens to be in the middle of it, which
 * is how the first pass ended up showing one brass pot at 3× zoom. They are downscaled to ≤1800px and re-saved through a fresh
 * buffer, which is what drops the camera metadata (the M25 rule, one
 * directory over). Replace them the day there is owner photography of a
 * real kitchen and a real hamper: a stock table is a placeholder for the
 * thing this platform is actually selling.
 */
const HALVES = [
  {
    key: "food" as const,
    index: "01",
    href: "/shop",
    Icon: HandPlatter,
    eyebrow: "Order in",
    title: "Homemade food",
    blurb: "Cooked this morning in a home kitchen near you — browse the kitchens, not a shelf.",
    cta: "Find a kitchen",
    src: "/images/site/split-food.jpg",
    alt: "A home-cooked thali of curries, rice and fresh roti on a wooden table",
  },
  {
    key: "gifts" as const,
    index: "02",
    href: "/gifts",
    Icon: Gift,
    eyebrow: "Send one",
    title: "Handcrafted gifts",
    blurb: "Made by hand by independent HomeKrafters, and posted anywhere in India.",
    cta: "Browse gifts",
    src: "/images/site/split-gifts.jpg",
    alt: "A basket of yarn beside a macramé hanging and crocheted pieces",
  },
];

/**
 * How far in from an edge the pointer has to be before that half is the
 * one you are leaning toward. 0.34 leaves the middle **third** of the
 * screen neutral, which is the band the brand lockup occupies.
 */
const LEAN = 0.34;

export function SplitPanels() {
  const [active, setActive] = useState<Half | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  /**
   * Read the pointer against the container rather than against a panel.
   * `getBoundingClientRect` on every move is a read of already-computed
   * layout inside an event the browser is dispatching anyway — no write
   * follows it here, so it cannot force a synchronous reflow.
   */
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    // A tap on a touch screen fires a pointer event too, and the halves
    // are level there on purpose (the CLS finding below).
    if (event.pointerType === "touch") return;
    const box = stage.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = (event.clientX - box.left) / box.width;
    setActive(x < LEAN ? "food" : x > 1 - LEAN ? "gifts" : null);
  }

  return (
    <div
      className={styles.split}
      data-active={active ?? "none"}
      ref={stage}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setActive(null)}
    >
      {HALVES.map(({ key, index, href, Icon, eyebrow, title, blurb, cta, src, alt }) => (
        <Link
          key={key}
          href={href}
          className={clsx(styles.panel, styles[key])}
          data-state={active === key ? "open" : active ? "shut" : "rest"}
          onFocus={() => setActive(key)}
          onBlur={() => setActive((current) => (current === key ? null : current))}
        >
          {/* `alt=""` — the panel's own heading says the same thing one
              node later, and `priority` because one of these two is the
              landing page's LCP element whichever way the split falls.

              `sizes` is what the photo's box measures, not what the panel
              can grow to: at rest each slice is half the stage, and a
              browser never swaps in a larger candidate on hover. At `75vw`
              a 2× desktop asked for the 2048 candidate — the full 1125px
              source, ~290 KB of AVIF per half — for a box 700px wide.
              `quality={50}` because these are grainy kitchen shots under a
              scrim; measured, it halves the bytes and nothing in the
              frame is being judged the way a product photo is. */}
          <ImageSlot
            ratio="4/5"
            label={`${title} photograph`}
            alt=""
            src={src}
            sizes="(max-width: 900px) 100vw, 50vw"
            quality={50}
            className={styles.photo}
            priority
          />
          <span className="hk-sr-only">{alt}</span>

          {/* The rotated index and label along the outer edge. Decorative
              — the panel's real heading is below — so it is hidden from
              assistive tech rather than read out as a stray "01". */}
          <span className={styles.rail} aria-hidden="true">
            <span className={styles.index}>{index}</span>
            <span className={styles.railLine} />
            <span className={styles.railLabel}>{eyebrow}</span>
          </span>

          <span className={styles.body}>
            <span className={styles.eyebrow}>
              <Icon className={styles.icon} aria-hidden="true" />
              {eyebrow}
            </span>
            <span className={styles.title}>{title}</span>
            <span className={styles.blurb}>{blurb}</span>
            <span className={styles.cta}>
              <span className={styles.ctaLabel}>{cta}</span>
              <span className={styles.ctaDisc} aria-hidden="true">
                <ArrowRight className={styles.ctaIcon} />
              </span>
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
