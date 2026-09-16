import { ICON_BODIES } from "@/lib/icons/icon-bodies.generated";
import { FALLBACK_ICON_ID, isCraftIconId } from "@/lib/icons/registry";
import { CraftIcon, craftArt } from "@/components/ui/icons/CraftIcon";

export interface IconProps {
  /** A registry id — `"lucide-lab:yarn-ball"`, `"craft:candles"`. */
  id: string | null | undefined;
  /** Rendered pixel size. Chips use 18, filter rows 16, tiles 40. */
  size?: number;
  className?: string;
}

/**
 * One shelf's mark, from either vocabulary (G3 §6).
 *
 * **No `"use client"`, and no hooks or browser APIs** — so rendered from a
 * Server Component it costs the browser nothing at all, and imported by a
 * client component (a chip row) it is a few bytes of static SVG in that
 * bundle. Either way nothing is fetched. That is the whole reason the
 * bodies are committed rather than read through `@iconify/react`, which is
 * itself a client component and asks a third-party host for the same shape
 * at runtime, rendering an empty span until it arrives.
 *
 * **Always `aria-hidden`.** Every caller renders the shelf name as real
 * text beside the mark, so announcing it would read the label twice — and
 * an icon must never be the only place a fact is stated. A caller drawing
 * one without a visible label owes its own `aria-label` on the control,
 * not on this.
 *
 * **An unknown id falls back rather than rendering an empty box.**
 * `Category.icon` is free-form admin input and a typo is a normal state;
 * so is a shelf nobody has given a mark yet. Both draw the wrapped gift.
 */
export function Icon({ id, size = 18, className }: IconProps) {
  const resolved = id && (isCraftIconId(id) || ICON_BODIES[id]) ? id : FALLBACK_ICON_ID;

  if (isCraftIconId(resolved)) {
    return <CraftIcon art={craftArt(resolved)} size={size} className={className} />;
  }

  const icon = ICON_BODIES[resolved];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={icon.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // The body is a build-time constant from a committed file — never a
      // request value, and `icon-registry.spec.ts` fails the build on a
      // body carrying `<script`, `href` or an `on*=` handler.
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
