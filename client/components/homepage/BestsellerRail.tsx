"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ProductGridCard } from "@/components/product/ProductGridCard";
import type { Product } from "@/lib/types";
import { SectionHead } from "./SectionHead";
import styles from "./BestsellerRail.module.css";

export interface BestsellerRailProps {
  title: string;
  more: { label: string; href: string };
  items: { product: Product; makerName: string }[];
}

/**
 * "Bestsellers this week" — the site's own product card, framed the way
 * the mockup frames it, on a native scroll row.
 *
 * Native scroll rather than a JS carousel: touch, trackpad, keyboard and
 * screen readers already know how to move it, a flick carries its own
 * momentum, and snap points land it on a card (apple-design §2, §6). The
 * arrows are a convenience for a mouse: they page by what is visible and
 * each one hides when there is nothing further that way.
 */
export function BestsellerRail({ title, more, items }: BestsellerRailProps) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setEdges({ start: track.scrollLeft <= 4, end: track.scrollLeft >= max - 4 });
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    measure();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure]);

  function page(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * track.clientWidth * 0.9, behavior: still ? "auto" : "smooth" });
  }

  return (
    <section className={styles.section} aria-labelledby="hp-best-title">
      <div className={clsx("container", "container-wide")}>
        <SectionHead id="hp-best-title" title={title} more={more} />
        <div className={styles.stage}>
          <ul ref={trackRef} className={styles.track}>
            {items.map(({ product, makerName }, index) => (
              <li key={product.id} className={styles.item}>
                <div className={styles.frame}>
                  <ProductGridCard
                    product={product}
                    makerName={makerName}
                    href={`/product/${product.slug}`}
                    priority={index === 0}
                  />
                </div>
              </li>
            ))}
          </ul>
          {!edges.start && (
            <button
              type="button"
              className={clsx(styles.arrow, styles.arrowPrev)}
              onClick={() => page(-1)}
              aria-label="Show earlier bestsellers"
            >
              <ArrowLeft size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
          {!edges.end && (
            <button
              type="button"
              className={clsx(styles.arrow, styles.arrowNext)}
              onClick={() => page(1)}
              aria-label="Show more bestsellers"
            >
              <ArrowRight size={20} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
