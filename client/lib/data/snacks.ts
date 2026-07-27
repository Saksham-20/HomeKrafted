import type { Snack, SnackCategory, SnackList } from "@/lib/types";

/**
 * Category filter chip options for the Snacks grid — "All" plus the 4
 * `SnackCategory` values, ported from the prototype's `snackCats`
 * (All/Savoury/Sweet/Baked/Namkeen). This is a UI filter option, not a
 * schema entity, so (like `NavItem` in `lib/data/site.ts`) it's typed
 * here rather than in `lib/types/food.ts`.
 */
export interface SnackCategoryFilter {
  value: SnackCategory | "all";
  label: string;
}

export const snackCategoryFilters: SnackCategoryFilter[] = [
  { value: "all", label: "All" },
  { value: "savoury", label: "Savoury" },
  { value: "sweet", label: "Sweet" },
  { value: "baked", label: "Baked" },
  { value: "namkeen", label: "Namkeen" },
];

/** The 6 snacks from the Snacks menu grid. */
export const snacks: Snack[] = [
  {
    id: "sk1",
    slug: "masala-mathri",
    name: "Masala Mathri",
    description: "Crispy, flaky, ghee-fried",
    price: 120,
    category: "savoury",
    diet: "veg",
    imagePlaceholder: "MATHRI",
    imageSrc: "/images/snacks/masala-mathri.jpg",
    available: true,
    sellerId: "sl3",
  },
  {
    id: "sk2",
    slug: "roasted-chivda",
    name: "Roasted Chivda",
    description: "Light poha namkeen mix",
    price: 90,
    category: "namkeen",
    diet: "veg",
    imagePlaceholder: "CHIVDA",
    imageSrc: "/images/snacks/roasted-chivda.jpg",
    available: true,
    sellerId: "sl3",
  },
  {
    id: "sk3",
    slug: "besan-ladoo",
    name: "Besan Ladoo",
    description: "Slow-roasted, 6 pcs",
    price: 160,
    category: "sweet",
    diet: "veg",
    imagePlaceholder: "LADOO",
    imageSrc: "/images/snacks/besan-ladoo.jpg",
    available: true,
    sellerId: "sl3",
  },
  {
    id: "sk4",
    slug: "chakli-spirals",
    name: "Chakli Spirals",
    description: "Rice & lentil, hand-rolled",
    price: 110,
    category: "namkeen",
    diet: "veg",
    imagePlaceholder: "CHAKLI",
    imageSrc: "/images/snacks/chakli-spirals.jpg",
    available: true,
    sellerId: "sl3",
  },
  {
    id: "sk5",
    slug: "nankhatai-cookies",
    name: "Nankhatai Cookies",
    description: "Cardamom shortbread, 8 pcs",
    price: 140,
    category: "baked",
    diet: "veg",
    imagePlaceholder: "NANKHATAI",
    imageSrc: "/images/snacks/nankhatai-cookies.jpg",
    available: true,
    sellerId: "sl3",
  },
  {
    id: "sk6",
    slug: "spicy-peanut-masala",
    name: "Spicy Peanut Masala",
    description: "Roasted, tangy coating",
    price: 80,
    category: "savoury",
    diet: "veg",
    imagePlaceholder: "PEANUTS",
    imageSrc: "/images/snacks/spicy-peanut-masala.jpg",
    available: true,
    sellerId: "sl3",
  },
];

export function getSnackBySlug(slug: string): Snack | undefined {
  return snacks.find((s) => s.slug === slug);
}

/**
 * Sample "your snack list" (the sticky basket from the Snacks screen),
 * pre-filled the way the prototype shows it. Note: the prototype's UI
 * hardcodes the estimate as "₹340", which doesn't match the sum of its
 * own three line items (120 + 160 + 80 = 360) — this mock corrects that
 * to a real computed total rather than propagate the typo.
 */
export const sampleSnackList: SnackList = {
  id: "snacklist-demo",
  userId: "user-demo",
  items: [
    { snackId: "sk1", name: "Masala Mathri", quantity: 1, price: 120 },
    { snackId: "sk3", name: "Besan Ladoo", quantity: 1, price: 160 },
    { snackId: "sk6", name: "Spicy Peanut Masala", quantity: 1, price: 80 },
  ],
  estimateTotal: 360,
  whatsappPayload:
    "Hi Homekrafted! I'd like to order:\n1x Masala Mathri\n1x Besan Ladoo\n1x Spicy Peanut Masala\n\nEstimated total: ₹360",
  status: "received",
  createdAt: "2026-07-23T10:00:00+05:30",
};
