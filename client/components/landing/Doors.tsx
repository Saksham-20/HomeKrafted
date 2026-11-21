"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { FoodComingSoonTag } from "@/components/food/FoodComingSoonBanner";
import styles from "./Doors.module.css";

type Half = "gifts" | "food";

const HALVES = [
  {
    key: "gifts" as const,
    href: "/gifts",
    title: "Handcrafted gifts",
    blurb: "Made by hand by independent HomeKrafters, and carefully packed and posted.",
    cta: "Browse gifts",
    src: "/images/site/split-gifts.jpg",
    alt: "A basket of yarn beside a macramé hanging and crocheted pieces",
  },
  {
    key: "food" as const,
    href: "/shop",
    title: "Homemade food",
    // Owner-approved D5: "this morning" is not true of a pre-order.
    blurb: "Cooked after you order, in a home kitchen near you — browse the kitchens, not a shelf.",
    cta: "Find a kitchen",
    src: "/images/site/split-food.jpg",
    alt: "A home-cooked thali of curries, rice and fresh roti on a wooden table",
  },
];

/**
 * How far in from an edge the pointer has to be before that half is the
 * one being leaned toward — the middle stays neutral, so crossing the
 * split on the way somewhere else opens nothing.
 */
const LEAN = 0.32;

/**
 * The page's two catalogues as two photographs split by a diagonal, and
 * the half you lean toward opens. Now the page's opening (a hero replaced by this split). Gifts sit first and wider at rest
 * (gift buyers are this page's first audience); food is the narrower
 * door, browsable, with its "Coming soon" tag while orders are closed.
 *
 * The boundary is one registered custom property (`--seam`) animating a
 * `clip-path`, so neither photograph ever resizes and no copy reflows
 * mid-move. Focus counts as leaning, so a keyboard visitor opens the same
 * half; a touch screen gets two stacked, level doors.
 */
export function Doors() {
  const [active, setActive] = useState<Half | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const box = stage.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = (event.clientX - box.left) / box.width;
    setActive(x < LEAN ? "gifts" : x > 1 - LEAN ? "food" : null);
  }

  return (
    <section className={styles.section} aria-labelledby="lp-doors-title">
      <div>
        <h1 id="lp-doors-title" className={styles.heading}>
          Send one, <span className={styles.headingTurn}>or order in.</span>
        </h1>
        <div
          ref={stage}
          className={styles.split}
          data-active={active ?? "none"}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
        >
          {HALVES.map((half) => (
            <Link
              key={half.key}
              href={half.href}
              className={clsx(styles.panel, styles[half.key])}
              data-state={active === half.key ? "open" : active ? "shut" : "rest"}
              onFocus={() => setActive(half.key)}
              onBlur={() => setActive((current) => (current === half.key ? null : current))}
            >
              <span className={styles.photoBox}>
                <ImageSlot
                  ratio="4/5"
                  label={`${half.title} photograph`}
                  alt=""
                  src={half.src}
                  sizes="(max-width: 900px) 100vw, 70vw"
                  quality={50}
                  className={styles.photo}
                />
              </span>
              <span className="hk-sr-only">{half.alt}</span>
              <span className={styles.body}>
                <span className={styles.title}>{half.title}</span>
                {half.key === "food" && <FoodComingSoonTag className={styles.soon} />}
                <span className={styles.blurb}>{half.blurb}</span>
                <span className={styles.cta}>
                  {half.cta}
                  <span className={styles.disc} aria-hidden="true">
                    <ArrowRight className={styles.discIcon} />
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
