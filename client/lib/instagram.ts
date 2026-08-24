/**
 * Instagram reels on the home rail.
 *
 * **What "fetch from Instagram" can and cannot mean here.** Instagram has
 * no anonymous read API any more: the oEmbed endpoint needs a Facebook
 * app token and App Review, and the old `/media/?size=l` thumbnail
 * redirect answers **500** today (checked 2026-08-24). What is still
 * public is the **embed iframe**, which renders the post, the caption and
 * a working player from Instagram's own origin — no key, no scraping, and
 * nothing of theirs copied onto our disk.
 *
 * So a reel is referenced by its URL and played by Instagram. Adding
 * another is one line in `lib/data/reels.ts`.
 *
 * **Never mirror the poster image.** The CDN URLs inside the embed are
 * signed and expire within days, so a stored one is a broken image with a
 * delay on it — and re-hosting somebody's frame is a separate permission
 * from embedding their post. A reel with no `posterSrc` renders the
 * branded tile instead (`ReelCard`), which is honest about what it is.
 *
 * Every function here is pure: these render inside a Server Component.
 */

/**
 * The shortcode out of any Instagram post/reel URL — `/reel/`, `/p/` and
 * `/tv/` all carry the same id in the same slot.
 *
 * Deliberately tolerant of what people actually paste: a trailing slash,
 * a `?igsh=…` share parameter, `www.` or not. Returns `undefined` rather
 * than throwing, because the caller's job is to fall back to a still.
 */
export function instagramShortcode(url: string): string | undefined {
  const match = /instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/.exec(url.trim());
  return match?.[1];
}

/**
 * The embeddable player URL.
 *
 * `/embed/captioned/` rather than `/embed/`: the caption is the maker's
 * own words about the food, which is the whole reason a reel is on a
 * marketplace home page.
 */
export function instagramEmbedUrl(url: string): string | undefined {
  const code = instagramShortcode(url);
  return code ? `https://www.instagram.com/reel/${code}/embed/captioned/` : undefined;
}

/** The canonical public permalink, for the "open on Instagram" link out. */
export function instagramPermalink(url: string): string | undefined {
  const code = instagramShortcode(url);
  return code ? `https://www.instagram.com/reel/${code}/` : undefined;
}
