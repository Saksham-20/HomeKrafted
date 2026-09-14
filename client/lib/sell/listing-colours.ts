import { VARIANT_LABEL_MAX, mergeVariantLabel } from "./listing-input";

/**
 * The colour swatches a maker picks from, and the arithmetic that keeps
 * those picks inside the label the server will accept.
 *
 * Pure and shared on purpose: the guided flow had all of this inline, so
 * the long form — the one an **edit** opens by default — offered a bare
 * text box instead, where the maker had to type colour names by hand,
 * match the spelling of whatever the guided flow had written, and find out
 * about the 40-character cap by being refused. Two forms writing one
 * `ListingFormValues` (M45) may not disagree about how a value is entered.
 */
export interface ColourSwatch {
  name: string;
  hex: string;
}

/** The first row, shown before "more colours" is pressed. */
export const PRIMARY_SWATCH_COUNT = 8;

export const CRAFT_PALETTE: readonly ColourSwatch[] = [
  // Primary — visible by default.
  { name: "Black", hex: "#1a1a1a" },
  { name: "White", hex: "#ffffff" },
  { name: "Cream", hex: "#f5e6c8" },
  { name: "Rose gold", hex: "#c08777" },
  { name: "Gold", hex: "#c9a227" },
  { name: "Silver", hex: "#a8a9ad" },
  { name: "Sage", hex: "#7a9e87" },
  { name: "Terracotta", hex: "#c4663a" },
  // Extended — revealed on "+ more colours".
  { name: "Blush", hex: "#e8a7a7" },
  { name: "Navy", hex: "#253b6e" },
  { name: "Olive", hex: "#6b705c" },
  { name: "Mustard", hex: "#e09f3e" },
  { name: "Burgundy", hex: "#540b0e" },
  { name: "Lavender", hex: "#b8a9c9" },
  { name: "Emerald", hex: "#1b4931" },
  { name: "Rust", hex: "#a44a3f" },
  { name: "Teal", hex: "#1e6066" },
  { name: "Lilac", hex: "#d8bbff" },
  { name: "Peach", hex: "#f4a261" },
  { name: "Charcoal", hex: "#363636" },
  { name: "Copper", hex: "#b87333" },
  { name: "Bronze", hex: "#8c6239" },
  { name: "Mint", hex: "#a3c4bc" },
  { name: "Ochre", hex: "#cc7722" },
] as const;

/** The colours currently on a variant row, read back out of the one string. */
export function parseColours(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Case-insensitive, because "rose gold" and "Rose gold" are one colour. */
export function hasColour(raw: string | undefined, name: string): boolean {
  return parseColours(raw).some((c) => c.toLowerCase() === name.toLowerCase());
}

/**
 * Would ticking this swatch build a label the server refuses?
 *
 * The swatches are merged into one `WeightOption.label`, capped at 40
 * (`create-listing.dto.ts`). Nothing measured it until 4363698, so the
 * fifth swatch on a row silently built an unsaveable listing and the maker
 * found out at submit, in the DTO's own words.
 *
 * Unticking is never blocked — it can only shorten the label.
 */
export function colourWouldOverflow(
  size: string,
  colour: string | undefined,
  name: string,
): boolean {
  if (hasColour(colour, name)) return false;
  const next = [...parseColours(colour), name].join(", ");
  return mergeVariantLabel(size, next).length > VARIANT_LABEL_MAX;
}

/**
 * Tick or untick a swatch, returning the new value for the row's `colour`.
 *
 * Returns the value unchanged when the pick would overflow, so a caller
 * that forgets to disable the control still cannot build a bad label.
 */
export function toggleColour(
  size: string,
  colour: string | undefined,
  name: string,
): string {
  const current = parseColours(colour);
  const exists = current.some((c) => c.toLowerCase() === name.toLowerCase());
  if (!exists && colourWouldOverflow(size, colour, name)) return colour ?? "";
  const next = exists
    ? current.filter((c) => c.toLowerCase() !== name.toLowerCase())
    : [...current, name];
  return next.join(", ");
}

/**
 * Does this swatch need a dark tick rather than a white one?
 *
 * Derived from the hex rather than the hand-kept list of names this
 * replaces, which had drifted: it named Cream, White, Silver, Mint and
 * Lilac, so a white tick was drawn on Blush, Lavender, Peach, Gold,
 * Mustard, Sage and six others where a dark one reads better — on Blush
 * that is 2.0:1 against 10.5:1.
 *
 * 0.179 is not a taste threshold, it is the crossover: white-on-colour is
 * `1.05 / (L + 0.05)` and black-on-colour is `(L + 0.05) / 0.05`, and
 * those are equal at `sqrt(1.05 * 0.05) - 0.05`. Above it a dark tick has
 * the higher contrast, below it a white one does. sRGB relative
 * luminance, the same basis every contrast figure in `tokens.extend.css`
 * is measured on.
 */
export function isLightSwatch(hex: string): boolean {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const channel = (start: number) => {
    const srgb = parseInt(value.slice(start, start + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.1791;
}
