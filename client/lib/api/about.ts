import { aboutContent, type AboutContent } from "@/lib/data";

/**
 * `/about` content. Static brand copy, so it never round-trips to the API —
 * same shape as `getBrandBlurb()` in `site.ts`. If this ever becomes
 * admin-editable it moves behind an endpoint like the home promo bands did.
 */
export async function getAboutContent(): Promise<AboutContent> {
  return aboutContent;
}
