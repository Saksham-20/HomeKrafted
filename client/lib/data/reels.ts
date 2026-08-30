import type { Reel } from "@/lib/types";

/**
 * Reels for the Home page's "See what arrives" rail — all real footage
 * since M52.
 *
 * The five M2-era seed entries (poster-only, "clip coming soon", with
 * like/view counts that were "plausible seed numbers, not derived from
 * anything") were deleted the day the real clips landed: a genuine
 * customer clip printing no count beside a stock poster printing
 * "1.2k · 18.4k views" made the invented numbers the louder ones. The
 * viewer's "Clip coming soon" branch stays for a reel filed before its
 * footage. Adding a clip is: the MP4 and an eight-second silent cut in
 * `public/videos/reels/` (encode recipe in `docs/DEPLOY.md`), a frame of
 * it in `public/images/reels/`, and one entry here — no component change.
 *
 * `ctaHref` points at a real route, so the rail is a live merchandising
 * surface (reel → shop) rather than decoration.
 */
export const reels: Reel[] = [
  /**
   * The four real reels (M52) — supplied by the owner on 2026-08-27,
   * re-encoded by hand (`docs/DEPLOY.md` § Reel footage) with every byte
   * of camera metadata stripped, because a phone clip carries the GPS of
   * the room it was shot in (the same rule as the M25 upload pipeline).
   * Titles quote the clip's own captions; nothing here claims anything
   * the footage does not say. Counts are `0` — "not published to us" —
   * and the card prints nothing for them.
   *
   * Two renditions per reel: `videoSrc` is what the viewer plays with
   * sound, `previewSrc` the eight-second silent cut the rail card plays
   * under the pointer. `posterSrc` is a frame of the clip itself.
   */
  {
    id: "rl0",
    slug: "eatwith-aditi-biryani",
    module: "marketplace",
    title: "“Some food just tastes like home”",
    caption:
      "@eatwith_aditi on the Non-Veg Biryani — 100% homemade, fresh, hygienic and affordable. Her favourite part: every order helps somebody turn their cooking into a business.",
    // Her clip, her handle. This is a creator's post about us — the M50
    // rule — and it was an Instagram embed until the file was supplied.
    authorLabel: "@eatwith_aditi",
    posterPlaceholder: "A tub of non-veg biryani with the Homekrafted sticker on the lid",
    posterSrc: "/images/reels/eatwith-aditi-biryani.jpg",
    videoSrc: "/videos/reels/eatwith-aditi-biryani.mp4",
    previewSrc: "/videos/reels/eatwith-aditi-biryani.preview.mp4",
    durationSeconds: 34,
    likeCount: 0,
    viewCount: 0,
    ctaLabel: "Shop homemade food",
    ctaHref: "/shop?kind=food",
    publishedAt: "2026-08-12",
  },
  {
    id: "rl6",
    slug: "office-lunch-first",
    module: "marketplace",
    title: "“Nahi sir, pehle khana ho jaye”",
    caption:
      "Mummy is at nani's and Abhinav is missing ghar ka khana — until his boss finds out he is a Homekrafted banda. Paneer butter masala first; the fresh lime soda can wait.",
    posterPlaceholder: "Abhinav at his office desk, grinning, about to order lunch",
    posterSrc: "/images/reels/office-lunch-first.jpg",
    videoSrc: "/videos/reels/office-lunch-first.mp4",
    previewSrc: "/videos/reels/office-lunch-first.preview.mp4",
    durationSeconds: 50,
    likeCount: 0,
    viewCount: 0,
    ctaLabel: "Order today's lunch",
    ctaHref: "/shop",
    publishedAt: "2026-08-27",
  },
  {
    id: "rl7",
    slug: "lunch-ho-ya-dinner",
    module: "marketplace",
    title: "“Lunch ho ya dinner — ghar jaisa swaad”",
    caption:
      "Ekdum fresh, zero factory production. She ordered a tiffin from here, it arrived hot, and the evening snack came with it.",
    posterPlaceholder: "A four-compartment tiffin of pulao, sabzi and raita with the Homekrafted sticker",
    posterSrc: "/images/reels/lunch-ho-ya-dinner.jpg",
    videoSrc: "/videos/reels/lunch-ho-ya-dinner.mp4",
    previewSrc: "/videos/reels/lunch-ho-ya-dinner.preview.mp4",
    durationSeconds: 64,
    likeCount: 0,
    viewCount: 0,
    ctaLabel: "Find a kitchen near you",
    ctaHref: "/shop",
    publishedAt: "2026-08-27",
  },
  {
    id: "rl8",
    slug: "pg-food-bored",
    module: "marketplace",
    title: "PG ka khana kha-kha ke bore?",
    caption:
      "Student ho ya working — fast food is quick, par woh ghar wala pyaar? Paratha, dal, sabzi and fried rice, all out of a home kitchen.",
    posterPlaceholder: "A student at a table with paratha, dal and sabzi in delivery bowls",
    posterSrc: "/images/reels/pg-food-bored.jpg",
    videoSrc: "/videos/reels/pg-food-bored.mp4",
    previewSrc: "/videos/reels/pg-food-bored.preview.mp4",
    durationSeconds: 49,
    likeCount: 0,
    viewCount: 0,
    ctaLabel: "See meal plans",
    ctaHref: "/meal-plans",
    publishedAt: "2026-08-27",
  },
];
