import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { makerCaricature, makerTone, ownAvatarSrc } from "@/lib/maker-portrait";
import type { Vendor } from "@/lib/types";
import styles from "./MakerPortrait.module.css";

export interface MakerPortraitProps {
  vendor: Vendor;
  /** Rendered size in px. The drawing is vector, so this is the only knob. */
  size?: number;
  /**
   * Alt text for the *photo* branch. The caricature branch is always
   * `aria-hidden` and ignores this.
   *
   * Defaults to a description naming the kitchen, which is right where
   * the portrait stands alone. Pass `""` wherever the kitchen's name is
   * the next node in the DOM — the storefront header, the search result,
   * the following row — because there the description is read twice.
   * That is `ImageSlot`'s own rule, not a new one.
   */
  alt?: string;
}

/**
 * Shared by every caricature: head, neck, shoulders, the barest face —
 * and an apron.
 *
 * The apron is the one piece of costume every variant carries, and it is
 * doing real work: without it these were generic avatar circles that
 * happened to sit above a kitchen's name. A bib and two straps is enough
 * to say *this person cooks and makes things*, which is the entire claim
 * the card is there to make, and it says it at 40 pixels where a face
 * alone says almost nothing.
 */
function Base() {
  return (
    <>
      <path d="M20.4 28.2v5.2M27.6 28.2v5.2" />
      <path d="M9 44.5c0-7.6 6.7-11.6 15-11.6s15 4 15 11.6" />
      {/* Apron: bib, then the two straps back up over the shoulders. */}
      <path d="M18.5 44.5v-5.6c0-1.1.9-2 2-2h7c1.1 0 2 .9 2 2v5.6" />
      <path d="M20.8 36.9l1.6-3.4M27.2 36.9l-1.6-3.4" />
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
 * Ten caricatures. Line art only — see `lib/maker-portrait.ts` for why
 * none of them carries a skin tone, and why there are ten rather than one.
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
  //
  // The wrap stops at the brow (y≈16.4), not at 20. It used to come down
  // over the top of the eyes with a wash-coloured fold struck across it,
  // and at 40px that read as a blindfold rather than a turban — checked
  // in the gallery's caricature row. The fold now sits inside the wrap
  // where a real one does, well clear of the face.
  <g key="turban">
    <path
      d="M13.4 15.9c0-7.7 4.8-12.1 10.6-12.1s10.6 4.4 10.6 12.1c0 1.2-.6 1.8-1.8 1.8H15.2c-1.2 0-1.8-.6-1.8-1.8z"
      fill="currentColor"
      stroke="none"
    />
    {/* The wrap's fold, drawn in the wash so it reads as a gap in the fill. */}
    <path d="M15.6 11.4c3.6-3.4 13.2-3.4 16.8 0" stroke="var(--mark-bg)" strokeWidth="1.3" />
  </g>,
  // Cropped, with a beard.
  <g key="beard">
    <path d={CAP} fill="currentColor" stroke="none" />
    <path d="M15.6 20.8c.5 7.7 4 11.8 8.4 11.8s7.9-4.1 8.4-11.8" />
  </g>,
  // Glasses, over a bun. Drawn over the eyes rather than replacing them —
  // a lens with nothing behind it reads as a mask.
  <g key="specs">
    <circle cx="24" cy="6.6" r="3.2" fill="currentColor" stroke="none" />
    <path d={CAP} fill="currentColor" stroke="none" />
    <circle cx="20.6" cy="19.5" r="3.1" />
    <circle cx="27.4" cy="19.5" r="3.1" />
    <path d="M23.7 19.5h.6M17.5 18.7l-2-.7M30.5 18.7l2-.7" />
  </g>,
  // A headscarf, tucked at the chin — the wrap Indian kitchens actually
  // work in, and not the same silhouette as long hair.
  <g key="scarf">
    <path
      d="M13.3 21.4c-.7-8.4 4.4-13.8 10.7-13.8s11.4 5.4 10.7 13.8c-1.4-5.8-5.2-7.9-10.7-7.9s-9.3 2.1-10.7 7.9z"
      fill="currentColor"
      stroke="none"
    />
    <path d="M13.6 20.8c-.9 6.4.4 11.4 3.3 13.6" />
    <path d="M34.4 20.8c.9 6.4-.4 11.4-3.3 13.6" />
    <path d="M15.4 27.6c2.6 2.4 5.6 3.5 8.6 3.5" />
  </g>,
  // A chef's toque. The one hat on the platform that is a job rather than
  // a person, and the only variant that reads at a glance in a rail.
  <g key="toque">
    <path
      d="M16.6 12.6c-2.6 0-4.2-1.9-4.2-4 0-2.3 2-3.9 4.1-3.5.7-1.9 2.4-3.1 4.3-3.1 1.3 0 2.5.6 3.2 1.5.7-.9 1.9-1.5 3.2-1.5 1.9 0 3.6 1.2 4.3 3.1 2.1-.4 4.1 1.2 4.1 3.5 0 2.1-1.6 4-4.2 4z"
      fill="currentColor"
      stroke="none"
    />
    <path d="M16.6 12.6h14.8v3.6H16.6z" fill="currentColor" stroke="none" />
  </g>,
  // Moustache, over a crop. Sits above the smile the base already draws.
  <g key="moustache">
    <path d={CAP} fill="currentColor" stroke="none" />
    <path d="M20.4 22.2c1.3-1.1 2.3-1.1 3.6 0 1.3-1.1 2.3-1.1 3.6 0" />
  </g>,
];

/**
 * The circle standing for a kitchen: their own picture where one exists,
 * a drawn caricature where it doesn't.
 *
 * **Every surface that pictures a vendor goes through here.** It began on
 * the home page's maker rail alone, which left the borrowed stock face
 * (`lib/maker-portrait.ts#SHARED_STOCK_AVATARS`) still rendering on the
 * storefront header, in search results and in the account's following
 * list — the three places a buyer actually looks at *one named kitchen*,
 * and so the three where showing a stranger's photograph is worst. Route
 * a new vendor-avatar surface through this component rather than reading
 * `vendor.avatarSrc` directly; `lib/vendor-avatar.spec.ts` fails the
 * build on a raw read.
 *
 * The caricature is `aria-hidden`. It is not a picture of anybody and it
 * carries no information the card does not already state in words — the
 * kitchen's name is the very next node — so announcing it would only add
 * noise, which is the case `ImageSlot`'s doc comment calls out as the one
 * where empty alt is correct rather than lazy.
 */
export function MakerPortrait({ vendor, size = 68, alt }: MakerPortraitProps) {
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
          alt={alt ?? `${vendor.name}, a home kitchen in ${vendor.location}`}
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
