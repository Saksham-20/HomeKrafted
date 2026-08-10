import type { Vendor } from "@/lib/types";

/**
 * The makers behind the 8 seed products. One vendor per product for now
 * (including "Homekrafted" itself for the platform-curated hamper) —
 * multi-product storefronts arrive with the full catalog in M2.
 *
 * **No vendor carries an `avatarSrc` or `bannerSrc`, deliberately (M28).**
 * Every one of them used to point at `/images/vendors/avatar.jpg` and
 * `/images/vendors/banner.jpg` — two files, shared by all ten kitchens —
 * so the storefronts rendered as the same stock face repeated down the
 * page. On a platform whose entire pitch is that a real person cooked
 * this, one borrowed face on ten makers reads as fake faster than no face
 * does. Absent a `src`, `ImageSlot` falls back to the labelled
 * placeholder, and each vendor's `avatarPlaceholder` already names them —
 * so the cards are at least distinct and honest.
 *
 * The fix is real photographs, one per kitchen, which only the owner can
 * supply (`CLAUDE.md`: never generate or AI-fabricate imagery). Dropping
 * them under `public/images/vendors/` and setting the field here is then
 * a pure data change. Do **not** re-point several vendors at one file to
 * make the grid look full.
 */
export const vendors: Vendor[] = [
  {
    id: "vd1",
    slug: "anjalis-kitchen",
    name: "Anjali's Kitchen",
    type: "maker",
    bio: "Home-cooked Punjabi food and small-batch pickles, made fresh every morning in a Sector 35 kitchen. Daily thalis, weekend specials, nothing frozen.",
    avatarPlaceholder: "ANJALI'S KITCHEN — AVATAR",
    bannerPlaceholder: "ANJALI'S KITCHEN — BANNER",
    location: "Sector 35, Chandigarh",
    area: "chd-sector-35",
    lat: 30.7266,
    lng: 76.7554,
    deliveryRadiusKm: 12,
    rating: 4.8,
    reviewCount: 128,
    followerCount: 612,
    joinedAt: "2023-11-02",
  },
  {
    id: "vd2",
    slug: "meeras-homefoods",
    name: "Meera's Homefoods",
    type: "maker",
    bio: "Everyday home food from a Mohali kitchen — dal, sabzi, rotis packed hot, plus chutneys ground fresh each week.",
    avatarPlaceholder: "MEERA'S HOMEFOODS — AVATAR",
    bannerPlaceholder: "MEERA'S HOMEFOODS — BANNER",
    location: "Phase 3B2, Mohali",
    area: "moh-phase-3b2",
    lat: 30.705,
    lng: 76.718,
    deliveryRadiusKm: 10,
    rating: 4.7,
    reviewCount: 86,
    followerCount: 234,
    joinedAt: "2024-02-14",
  },
  {
    id: "vd3",
    slug: "home-batch",
    name: "Home Batch",
    type: "baker",
    bio: "A Sector 15 home-bakery: millet cookies, eggless cakes and breads baked to order, never off a shelf.",
    avatarPlaceholder: "HOME BATCH — AVATAR",
    bannerPlaceholder: "HOME BATCH — BANNER",
    location: "Sector 15, Chandigarh",
    area: "chd-sector-15",
    lat: 30.7594,
    lng: 76.7681,
    deliveryRadiusKm: 8,
    rating: 4.9,
    reviewCount: 204,
    followerCount: 540,
    joinedAt: "2023-06-20",
  },
  {
    id: "vd4",
    slug: "crunch-corner",
    name: "Crunch Corner",
    type: "maker",
    bio: "Panchkula home kitchen roasting nuts, seeds and namkeen in small weekly batches.",
    avatarPlaceholder: "CRUNCH CORNER — AVATAR",
    bannerPlaceholder: "CRUNCH CORNER — BANNER",
    location: "Sector 5, Panchkula",
    area: "pkl-sector-5",
    lat: 30.693,
    lng: 76.854,
    deliveryRadiusKm: 10,
    rating: 4.6,
    reviewCount: 92,
    followerCount: 178,
    joinedAt: "2024-05-09",
  },
  {
    id: "vd5",
    slug: "cocoa-homemade",
    name: "Cocoa Homemade",
    type: "baker",
    bio: "Bean-to-bar chocolate and homemade desserts, made in a Sector 22 flat one batch at a time.",
    avatarPlaceholder: "COCOA HOMEMADE — AVATAR",
    bannerPlaceholder: "COCOA HOMEMADE — BANNER",
    location: "Sector 22, Chandigarh",
    area: "chd-sector-22",
    lat: 30.7333,
    lng: 76.7794,
    deliveryRadiusKm: 9,
    rating: 4.8,
    reviewCount: 73,
    followerCount: 265,
    joinedAt: "2024-01-11",
  },
  {
    id: "vd6",
    slug: "dadis-recipe",
    name: "Dadi's Recipe",
    type: "maker",
    bio: "Traditional sweets, mathri and dry-fruit preparations from a Zirakpur family kitchen, three generations of recipes.",
    avatarPlaceholder: "DADI'S RECIPE — AVATAR",
    bannerPlaceholder: "DADI'S RECIPE — BANNER",
    location: "VIP Road, Zirakpur",
    area: "zkp-vip-road",
    lat: 30.6425,
    lng: 76.8173,
    deliveryRadiusKm: 14,
    rating: 4.9,
    reviewCount: 140,
    followerCount: 601,
    joinedAt: "2022-12-03",
  },
  {
    id: "vd7",
    slug: "hills-leaves",
    name: "Hills & Leaves",
    type: "maker",
    bio: "Hand-blended teas and homemade masalas, packed in Panchkula.",
    avatarPlaceholder: "HILLS & LEAVES — AVATAR",
    bannerPlaceholder: "HILLS & LEAVES — BANNER",
    location: "Sector 9, Panchkula",
    area: "pkl-sector-9",
    lat: 30.687,
    lng: 76.848,
    deliveryRadiusKm: 12,
    rating: 4.7,
    reviewCount: 61,
    followerCount: 145,
    joinedAt: "2024-03-27",
  },
  {
    id: "vd8",
    slug: "homekrafted",
    name: "Homekrafted",
    type: "homekrafted",
    bio: "Our in-house team, building gift-ready hampers from the best of the tricity home kitchens.",
    avatarPlaceholder: "HOMEKRAFTED — AVATAR",
    bannerPlaceholder: "HOMEKRAFTED — BANNER",
    location: "Sector 17, Chandigarh",
    area: "chd-sector-17",
    lat: 30.7418,
    lng: 76.7822,
    deliveryRadiusKm: 30,
    rating: 4.9,
    reviewCount: 57,
    followerCount: 890,
    joinedAt: "2022-08-15",
  },
  {
    id: "vd9",
    slug: "fresh-fold-laundry",
    name: "Fresh Fold Laundry Co.",
    type: "maker",
    bio: "Wash, fold, dry-clean and steam ironing, picked up and returned across Mohali and south Chandigarh.",
    avatarPlaceholder: "FRESH FOLD — AVATAR",
    bannerPlaceholder: "FRESH FOLD — BANNER",
    location: "Phase 7, Mohali",
    area: "moh-phase-7",
    lat: 30.713,
    lng: 76.702,
    deliveryRadiusKm: 15,
    rating: 4.7,
    reviewCount: 214,
    followerCount: 96,
    joinedAt: "2024-02-10",
  },
  {
    id: "vd10",
    slug: "meeras-snack-box",
    name: "Meera's Snack Box",
    type: "maker",
    bio: "Evening snacks, samosas and homemade namkeen from a Sector 46 kitchen — order on WhatsApp, delivered hot.",
    avatarPlaceholder: "MEERA'S SNACK BOX — AVATAR",
    bannerPlaceholder: "MEERA'S SNACK BOX — BANNER",
    location: "Sector 46, Chandigarh",
    area: "chd-sector-46",
    lat: 30.7083,
    lng: 76.7626,
    deliveryRadiusKm: 8,
    rating: 4.5,
    reviewCount: 96,
    followerCount: 143,
    joinedAt: "2024-05-20",
  },
];

export function getVendorBySlug(slug: string): Vendor | undefined {
  return vendors.find((v) => v.slug === slug);
}

export function getVendorById(id: string): Vendor | undefined {
  return vendors.find((v) => v.id === id);
}
