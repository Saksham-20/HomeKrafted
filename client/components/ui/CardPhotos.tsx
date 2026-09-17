"use client";

import { useState } from "react";
import type { MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import type { ProductImage } from "@/lib/types";
import styles from "./CardPhotos.module.css";

export interface CardPhotosProps {
  images: ProductImage[];
  /** The listing's name — the alt text, and part of each arrow's label. */
  name: string;
  priority?: boolean;
}

/**
 * The photographs on a product card, with arrows when there is more than
 * one (owner, 2026-09-16).
 *
 * A card showed `images[0]` and nothing else, so a maker who uploaded four
 * angles of a crocheted toy had three of them visible only after a
 * click — on a grid whose entire job is letting somebody judge a handmade
 * object.
 *
 * Three things this has to get right, because the card is a link:
 *
 * - **The arrows sit above the stretched link** and stop the event. The
 *   card's whole surface is a `<Link>` overlay, so an arrow that does not
 *   `preventDefault` navigates to the product instead of advancing the
 *   photo.
 * - **They are real `<button>`s**, so they are reachable by keyboard and
 *   announce what they do. A div with an `onClick` here would be the
 *   keyboard-dead catalogue again.
 * - **They are rendered only when they would do something.** One photo
 *   renders no arrows and no dots — a control that cannot act is noise.
 *
 * The photo does not slide: the card is small and a translate would fight
 * the hover scale on the image underneath. It cross-fades, which also
 * means the reduced-motion floor leaves a plain swap rather than a jump.
 */
export function CardPhotos({ images, name, priority }: CardPhotosProps) {
  const [index, setIndex] = useState(0);
  const many = images.length > 1;
  const image = images[index] ?? images[0];

  function step(event: MouseEvent, by: number) {
    // The card is one big link; without these the arrow opens the product.
    event.preventDefault();
    event.stopPropagation();
    setIndex((current) => (current + by + images.length) % images.length);
  }

  return (
    <>
      <ImageSlot
        // Keyed on the index so the browser treats each photo as its own
        // element and the cross-fade has something to fade between.
        key={index}
        ratio="1/1"
        label={image?.placeholder ?? name}
        alt={name}
        src={image?.src}
        sizes="(max-width: 640px) 45vw, (max-width: 1180px) 30vw, 260px"
        priority={priority}
        compact
        className={styles.photo}
      />

      {many ? (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.prev}`}
            aria-label={`Previous photo of ${name}`}
            onClick={(event) => step(event, -1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.next}`}
            aria-label={`Next photo of ${name}`}
            onClick={(event) => step(event, 1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>

          {/*
            Position, not a control — the arrows are the control. Hidden
            from assistive tech because the arrow labels already say which
            photo is coming, and a row of dots announces as nothing.
          */}
          <span className={styles.dots} aria-hidden="true">
            {/*
              Keyed on position, not `photo.src` (fixed 2026-09-17): a dot
              represents a slot in the row, not a particular photo's
              identity, and `photo.src ?? i` collided the moment two
              images shared a src — which several seed products still do
              (placeholder galleries pointing multiple slots at one file
              while real photography is pending). The fallback `?? i`
              never engaged, since a shared src is still truthy.
            */}
            {images.map((_photo, i) => (
              <span
                key={i}
                className={i === index ? `${styles.dot} ${styles.dotOn}` : styles.dot}
              />
            ))}
          </span>
        </>
      ) : null}
    </>
  );
}
