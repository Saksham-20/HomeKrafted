import clsx from "clsx";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { ownAvatarSrc } from "@/lib/maker-portrait";
import type { Vendor } from "@/lib/types";
import styles from "./MakerPortrait.module.css";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "HK";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export interface MakerPortraitProps {
  vendor: Vendor;
  /** Rendered size in px. The drawing is vector, so this is the only knob. */
  size?: number;
  /**
   * Alt text for the picture. Ignored by the placeholder branch, which
   * has nothing to describe.
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
 * The circle standing for a kitchen: their own photograph, the character
 * they chose, or the labelled placeholder.
 *
 * **A character is stored as an ordinary `avatarSrc`**
 * (`lib/avatars/chef-characters.ts`), so this component does not know
 * the difference between one and an uploaded photo and does not need
 * to — which is also what keeps the storefront's OpenGraph card and its
 * JSON-LD working, since both read that same string.
 *
 * **The drawn caricature is gone** (owner, 2026-08-29). Ten line-art
 * faces used to be assigned by a hash of the slug, so a kitchen that had
 * never opened the portal still had a portrait — one nobody chose. With
 * a picker in the portal that is the wrong trade: a face somebody was
 * *given* is an invention on a page whose whole claim is that a real
 * person made this, and it also hid the gap from the only people who
 * can close it. Unchosen kitchens now show the placeholder, which is
 * true and which looks like the unfinished thing it is.
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
 * The placeholder carries `alt=""`. It is not a picture of anybody and
 * it states nothing the card does not already say in words — the
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

  /*
    No photograph and no chosen character: render clean initials monogram instead of raw test placeholders
  */
  const initials = getInitials(vendor.name || "Homekrafted");
  return (
    <div
      className={clsx(styles.photo, styles.initialsAvatar)}
      style={box}
      aria-label={alt || vendor.name}
    >
      <span className={styles.initialsText} style={{ fontSize: Math.round(size * 0.38) }}>
        {initials}
      </span>
    </div>
  );
}
