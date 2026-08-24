import type { Reel } from "@/lib/types";

/**
 * Seed reels for the Home page's "Straight from the kitchen" rail.
 *
 * Every entry is poster-only today: `videoSrc` is deliberately absent
 * because no real footage has been shot yet, and CLAUDE.md forbids
 * fabricating product/food media. Posters reuse the real supplied
 * photography under `public/images/**`. When a clip lands, drop the MP4 in
 * `public/videos/reels/<slug>.mp4` and set `videoSrc` — the card starts
 * autoplaying it muted in view and the viewer plays it full-height, no
 * component change needed.
 *
 * `vendorId`/`ctaHref` point at real seeded rows and routes, so the rail
 * is a live merchandising surface (reel → product) rather than decoration.
 * Counts are plausible seed numbers, not derived from anything.
 */
export const reels: Reel[] = [
  /**
   * A real reel, posted by a real creator about a real order (M50). It is
   * played through Instagram's own embed — see `lib/instagram.ts` for why
   * that is the only anonymous route in, and why nothing of theirs is
   * copied here. No `posterSrc`: the embed's own frames are signed URLs
   * that expire, and re-hosting somebody's still is a separate permission
   * from embedding their post. The card draws its branded tile instead.
   *
   * Adding another is one more entry with an `instagramUrl`.
   */
  {
    id: "rl0",
    slug: "eatwith-aditi-biryani",
    module: "marketplace",
    title: "“Some food just tastes like home”",
    caption:
      "@eatwith_aditi on the Non-Veg Biryani — freshly made in a home kitchen, not a mass-production line.",
    // Their handle, not ours: this is somebody else's clip about us, and
    // falling through to "Homekrafted" would put our name on their work.
    authorLabel: "@eatwith_aditi",
    posterPlaceholder: "Non-veg biryani from a Homekrafted kitchen",
    instagramUrl: "https://www.instagram.com/reel/DcBdttehGMO/",
    // Instagram does not publish a runtime anonymously, and the chip
    // would be a guess. `0` is the "not stated" value the card reads.
    durationSeconds: 0,
    // Not derived from anything and deliberately not invented either:
    // the embed carries Instagram's own live counts.
    likeCount: 0,
    viewCount: 0,
    ctaLabel: "Shop homemade food",
    ctaHref: "/shop?kind=food",
    publishedAt: "2026-08-20",
  },
  {
    id: "rl1",
    slug: "thokku-tempering",
    module: "marketplace",
    title: "The tempering that makes the thokku",
    caption: "Mustard seeds, curry leaf, sesame oil — the 40-second step Anjali refuses to rush.",
    vendorId: "vd1",
    posterPlaceholder: "Mango thokku tempering in a kadai",
    posterSrc: "/images/products/mango-thokku-pickle.jpg",
    durationSeconds: 28,
    likeCount: 1240,
    viewCount: 18400,
    ctaLabel: "Shop Mango Thokku",
    ctaHref: "/product/mango-thokku-pickle",
    publishedAt: "2026-07-20",
  },
  {
    id: "rl2",
    slug: "ladoo-rolling",
    module: "marketplace",
    title: "200 laddoos, rolled by hand",
    caption: "A Diwali morning at Dadi's Recipe, from roasting the besan to the last box taped shut.",
    vendorId: "vd6",
    posterPlaceholder: "Hands rolling besan laddoos",
    posterSrc: "/images/products/besan-ladoo.jpg",
    durationSeconds: 34,
    likeCount: 2860,
    viewCount: 41200,
    ctaLabel: "Shop laddoo boxes",
    ctaHref: "/product/dry-fruit-laddoo-box",
    publishedAt: "2026-07-18",
  },
  {
    id: "rl3",
    slug: "chakli-spirals",
    module: "snacks",
    title: "Perfect chakli spirals, first try",
    caption: "Crunch Corner's press-and-turn trick — then straight onto today's WhatsApp menu.",
    vendorId: "vd4",
    posterPlaceholder: "Chakli spirals being pressed",
    posterSrc: "/images/snacks/chakli-spirals.jpg",
    durationSeconds: 22,
    likeCount: 980,
    viewCount: 12700,
    ctaLabel: "See today's snacks",
    ctaHref: "/snacks",
    publishedAt: "2026-07-17",
  },
  {
    id: "rl4",
    slug: "cookie-cooling-rack",
    module: "marketplace",
    title: "Millet cookies, straight off the rack",
    caption: "Ragi, almond, jaggery. Baked at 7am in a Bengaluru home kitchen, packed by 9.",
    vendorId: "vd3",
    posterPlaceholder: "Ragi almond cookies cooling on a rack",
    posterSrc: "/images/products/ragi-almond-cookies.jpg",
    durationSeconds: 19,
    likeCount: 1510,
    viewCount: 23900,
    ctaLabel: "Shop Ragi Almond Cookies",
    ctaHref: "/product/ragi-almond-cookies",
    publishedAt: "2026-07-15",
  },
  {
    id: "rl5",
    slug: "hamper-packing",
    module: "marketplace",
    title: "How a festive hamper gets packed",
    caption: "Kraft box, shredded filler, handwritten card, ribbon. Ninety seconds, no plastic.",
    vendorId: "vd8",
    posterPlaceholder: "Festive assorted hamper being packed",
    posterSrc: "/images/products/festive-assorted-hamper.jpg",
    durationSeconds: 41,
    likeCount: 3320,
    viewCount: 55600,
    ctaLabel: "Shop hampers",
    ctaHref: "/product/festive-assorted-hamper",
    publishedAt: "2026-07-12",
  },
];
