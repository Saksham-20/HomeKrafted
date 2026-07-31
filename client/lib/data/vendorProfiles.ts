import type { OwnVendorProfile, VendorProfile } from "@/lib/types";
import { vendors } from "./vendors";

/**
 * Mock HomeKrafter profiles (M16) — offline-only, for
 * `NEXT_PUBLIC_USE_MOCK=true`.
 *
 * The real trust score, badges and completion are **computed on the
 * server** from verification flags, review rows, delivered orders and
 * tenure (`server/src/catalog/vendor-profile.service.ts`). They are not
 * recomputed here: a second implementation of the rules would drift from
 * the first, and this layer exists to let the UI render without a backend,
 * not to be a second source of truth. What follows is therefore
 * hand-written to *look like* plausible output, the same way every other
 * mock in `lib/data` is.
 */

const EMPTY_TRUST = {
  score: 25,
  tier: "building" as const,
  signals: [
    { key: "identity", label: "Identity verified", earned: true, detail: "Homekrafted has checked who runs this kitchen", weight: 15 },
    { key: "address", label: "Address verified", earned: true, detail: "Kitchen address confirmed", weight: 10 },
    { key: "fssai", label: "FSSAI registered", earned: false, detail: "No licence on file", weight: 20 },
    { key: "reviews", label: "Well reviewed", earned: false, detail: "No reviews yet", weight: 20 },
    { key: "volume", label: "Proven track record", earned: false, detail: "0 orders delivered", weight: 15 },
    { key: "tenure", label: "Established", earned: false, detail: "Joined this month", weight: 10 },
    { key: "reliability", label: "Rarely cancels", earned: false, detail: "Not enough orders to say yet", weight: 10 },
  ],
};

const profilesBySlug: Record<string, Partial<VendorProfile>> = {
  "anjalis-kitchen": {
    tagline: "Punjabi home cooking, made the way my mother taught me",
    story:
      "I started cooking for neighbours in 2019, when a friend asked if I could send over a jar of the mango thokku I make every summer. One jar became ten, then a WhatsApp group, and by 2023 it was a proper kitchen in Sector 35.\n\nEverything still goes through my hands. The pickles are sun-cured on the terrace the way they always have been, and I cook the day's thali the same morning it goes out.",
    knownFor: ["Mango thokku", "Daily Punjabi thali", "Winter gajar halwa"],
    languages: ["Hindi", "Punjabi", "English"],
    prepTimeMins: 180,
    responseTimeMins: 30,
    capacityPerDay: 25,
    minOrderValue: 250,
    workingDays: [1, 2, 3, 4, 5, 6],
    opensAt: "08:00",
    closesAt: "19:00",
    cancellationPolicy:
      "Cancel any time before I start cooking — usually up to 3 hours before your slot. After that the food is already made, so I can only offer to reschedule.",
    returnPolicy:
      "If something arrives spoiled or wrong, send a photo within 24 hours and I will refund it in full.",
    customOrderPolicy: "Happy to take festival and bulk orders with 3 days notice.",
    acceptsCustomOrders: true,
    packagingNote: "Glass jars with tamper seals, food-grade steel tiffins for thalis.",
    hygieneNote:
      "Kitchen is cleaned and sanitised before every batch. Hair covered, gloves for packing.",
    fssaiVerified: true,
    identityVerified: true,
    addressVerified: true,
    instagramUrl: "https://instagram.com/anjaliskitchen",
    photos: [
      { id: "vp1", url: "/images/vendors/banner.jpg", caption: "The Sector 35 kitchen", kind: "kitchen", sortOrder: 0 },
      { id: "vp2", url: "/images/products/mango-thokku-pickle.jpg", caption: "Thokku, mid-batch", kind: "process", sortOrder: 1 },
    ],
    trust: {
      score: 90,
      tier: "trusted",
      signals: [
        { key: "identity", label: "Identity verified", earned: true, detail: "Homekrafted has checked who runs this kitchen", weight: 15 },
        { key: "address", label: "Address verified", earned: true, detail: "Kitchen address confirmed", weight: 10 },
        { key: "fssai", label: "FSSAI registered", earned: true, detail: "Food licence checked by Homekrafted", weight: 20 },
        { key: "reviews", label: "Well reviewed", earned: true, detail: "4.8 from 128 reviews", weight: 20 },
        { key: "volume", label: "Proven track record", earned: true, detail: "312 orders delivered", weight: 15 },
        { key: "tenure", label: "Established", earned: true, detail: "32 months on Homekrafted", weight: 10 },
        { key: "reliability", label: "Rarely cancels", earned: false, detail: "6% of orders cancelled", weight: 10 },
      ],
    },
    achievements: [
      { key: "fssai", label: "FSSAI registered", detail: "Food licence verified" },
      { key: "orders-250", label: "250+ orders", detail: "312 delivered so far" },
      { key: "top-rated", label: "Top rated", detail: "4.8 across 128 reviews" },
      { key: "tenure", label: "2 years on Homekrafted", detail: "Still cooking" },
    ],
    stats: { ordersDelivered: 312, cancellationRate: 0.06, monthsActive: 32, rating: 4.8, reviewCount: 128, followerCount: 0 },
  },
};

/** Always returns a renderable profile — a kitchen approved this morning has no row and still needs a page. */
export function getVendorProfileBySlug(slug: string): VendorProfile {
  const vendor = vendors.find((v) => v.slug === slug);
  const partial = profilesBySlug[slug] ?? {};
  return {
    knownFor: [],
    languages: [],
    workingDays: [],
    acceptsCustomOrders: false,
    fssaiVerified: false,
    identityVerified: false,
    addressVerified: false,
    photos: [],
    trust: EMPTY_TRUST,
    achievements: [],
    stats: {
      ordersDelivered: 0,
      cancellationRate: null,
      monthsActive: 0,
      rating: vendor?.rating ?? 0,
      reviewCount: vendor?.reviewCount ?? 0,
      followerCount: vendor?.followerCount ?? 0,
    },
    ...partial,
  } as VendorProfile;
}

export function getOwnVendorProfile(slug: string): OwnVendorProfile {
  const base = getVendorProfileBySlug(slug);
  const missing = [
    !base.tagline && { key: "tagline", label: "A one-line tagline" },
    !base.story && { key: "story", label: "Your story" },
    base.photos.length === 0 && { key: "photos", label: "Kitchen photos" },
    base.knownFor.length === 0 && { key: "knownFor", label: "What you are known for" },
    base.workingDays.length === 0 && { key: "hours", label: "Working days and hours" },
    base.prepTimeMins == null && { key: "prep", label: "How long you need to prepare an order" },
    !base.hygieneNote && !base.packagingNote && { key: "hygiene", label: "How you handle hygiene and packaging" },
    !(base.cancellationPolicy && base.returnPolicy) && { key: "policies", label: "Cancellation and return policy" },
  ].filter(Boolean) as { key: string; label: string }[];

  return {
    ...base,
    fssaiNumber: base.fssaiVerified ? "12419064000123" : undefined,
    completion: { percent: Math.max(0, 100 - missing.length * 12), missing },
  };
}
