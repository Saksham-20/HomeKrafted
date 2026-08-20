import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { makerCaricature, makerTone, ownAvatarSrc } from "@/lib/maker-portrait";
import type { Vendor } from "@/lib/types";
import styles from "./MakerPortrait.module.css";

export interface MakerPortraitProps {
  vendor: Vendor;
  /** Rendered size in px. The drawing is vector, so this is the only knob. */
  size?: number;
}

/** Shared by every caricature: head, neck, shoulders, and the barest face. */
function Base() {
  return (
    <>
      <path d="M20.4 28.2v5.2M27.6 28.2v5.2" />
      <path d="M9 44.5c0-7.6 6.7-11.6 15-11.6s15 4 15 11.6" />
      <ellipse cx="24" cy="19.6" rx="8.6" ry="9.6" />
      <circle cx="20.9" cy="19.4" r="0.95" fill="currentColor" stroke="none" />
      <circle cx="27.1" cy="19.4" r="0.95" fill="currentColor" stroke="none" />
      <path d="M21.2 24.1c1.6 1.5 4 1.5 5.6 0" />
    </>
  );
}

/** The hairline cap most variants build on. */
const CAP = "M13.9 17.6c-.7-7.1 4.2-11.4 10.1-11.4s10.8 4.3 10.1 11.4c-1-4.7-4.6-6.5-10.1-6.5s-9.1 1.8-10.1 6.5z";

/**
 * Six caricatures. Line art only — see `lib/maker-portrait.ts` for why
 * none of them carries a skin tone, and why there are six rather than one.
 *
 * Deliberately spare. These render at roughly 40 pixels, where detail
 * turns to mud and a few confident strokes still read as a person.
 */
const CARICATURES = [
  // Bun.
  <g key="bun">
    <circle cx="24" cy="6.4" r="3.3" fill="currentColor" stroke="none" />
    <path d={CAP} fill="currentColor" stroke="none" />
  </g>,
  // Cropped.
  <g key="cropped">
    <path d={CAP} fill="currentColor" stroke="none" />
  </g>,
  // Long, falling either side.
  <g key="long">
    <path d={CAP} fill="currentColor" stroke="none" />
    <path d="M13.7 15.8c-1.3 6.2-1.1 12.8.3 17.4" />
    <path d="M34.3 15.8c1.3 6.2 1.1 12.8-.3 17.4" />
  </g>,
  // Braided over one shoulder.
  <g key="braid">
    <path d={CAP} fill="currentColor" stroke="none" />
    <path d="M33.8 16.4c2.1 5.2 2.7 12.2 1.3 17.8" />
    <circle cx="34.9" cy="24" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="35.5" cy="29.4" r="1.5" fill="currentColor" stroke="none" />
  </g>,
  // Turban.
  <g key="turban">
    <path
      d="M13.2 18.2c0-8 4.9-12.6 10.8-12.6s10.8 4.6 10.8 12.6c0 1.2-.6 1.8-1.8 1.8H15c-1.2 0-1.8-.6-1.8-1.8z"
      fill="currentColor"
      stroke="none"
    />
    {/* The wrap's fold, drawn in the wash so it reads as a gap in the fill. */}
    <path d="M14.8 14.6c4-3.3 14.4-3.3 18.4 0" stroke="var(--mark-bg)" />
  </g>,
  // Cropped, with a beard.
  <g key="beard">
    <path d={CAP} fill="currentColor" stroke="none" />
    <path d="M15.6 20.8c.5 7.7 4 11.8 8.4 11.8s7.9-4.1 8.4-11.8" />
  </g>,
];

/**
 * The circle at the top of a maker card: their own picture where one
 * exists, a drawn caricature where it doesn't.
 *
 * The caricature is `aria-hidden`. It is not a picture of anybody and it
 * carries no information the card does not already state in words — the
 * kitchen's name is the very next node — so announcing it would only add
 * noise, which is the case `ImageSlot`'s doc comment calls out as the one
 * where empty alt is correct rather than lazy.
 */
export function MakerPortrait({ vendor, size = 68 }: MakerPortraitProps) {
  const src = ownAvatarSrc(vendor.avatarSrc);

  // `size` is a genuinely dynamic value — the exception CLAUDE.md carves
  // out of the no-inline-styles rule, same as `ImageSlot`'s aspect ratio.
  const box = { width: size, height: size };

  if (src) {
    return (
      <div className={styles.photo} style={box}>
        <ImageSlot
          ratio="1/1"
          shape="circle"
          label={vendor.avatarPlaceholder}
          alt={`${vendor.name}, a home kitchen in ${vendor.location}`}
          src={src}
          sizes={`${size}px`}
          compact
        />
      </div>
    );
  }

  return (
    <div
      className={clsx(styles.mark, styles[makerTone(vendor.slug)])}
      style={box}
      aria-hidden="true"
    >
      <svg
        className={styles.face}
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {CARICATURES[makerCaricature(vendor.slug)]}
        <Base />
      </svg>
    </div>
  );
}
