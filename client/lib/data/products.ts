import type { Product } from "@/lib/types";

/**
 * The 8 seed products, ported from the prototype's `<script type="text/x-dc">`
 * sample data (maker / price / mrp / weight / rating / reviews / tag).
 * Cashback is a flat 5% platform-wide rate, matching the home page's
 * "Earn 5% cashback on every order" wallet promo copy (checks out against
 * the prototype's product-detail cashback of ₹12 on a ₹249 item).
 *
 * Only "Mango Thokku Pickle" carries the full product-detail fields
 * (multi-weight pricing, gallery thumbs, ingredients/shelf-life/storage) —
 * that is the one product the prototype's Product Detail screen actually
 * shows. The other 7 get a single weight tier + a short description in
 * the same voice; a fuller content pass lands with the real catalog in M2.
 */
export const products: Product[] = [
  {
    id: "pr1",
    slug: "mango-thokku-pickle",
    vendorId: "vd1",
    name: "Mango Thokku Pickle",
    categoryId: "ct1",
    featured: true,
    occasionIds: ["oc4", "oc8"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Mango Thokku Pickle product photo",
        src: "/images/products/mango-thokku-pickle.jpg",
        ratio: "1/1",
      },
      {
        placeholder: "Mango Thokku Pickle front view",
        src: "/images/products/mango-thokku-pickle.jpg",
        ratio: "1/1",
      },
      {
        placeholder: "Mango Thokku Pickle open jar",
        src: "/images/products/mango-thokku-pickle.jpg",
        ratio: "1/1",
      },
      {
        placeholder: "Mango Thokku Pickle serving spread",
        src: "/images/products/mango-thokku-pickle.jpg",
        ratio: "1/1",
      },
      {
        placeholder: "Mango Thokku Pickle label view",
        src: "/images/products/mango-thokku-pickle.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "mango-thokku-pickle-250g", label: "250 g", price: 249, mrp: 299, stock: 40 },
      { sku: "mango-thokku-pickle-500g", label: "500 g", price: 469, mrp: 549, stock: 25 },
      { sku: "mango-thokku-pickle-1kg", label: "1 kg", price: 899, mrp: 999, stock: 12 },
    ],
    defaultWeightSku: "mango-thokku-pickle-250g",
    rating: 4.8,
    reviewCount: 128,
    tags: ["Bestseller"],
    isPackaged: true,
    cashbackPct: 5,
    description:
      "Slow-cooked strips of raw mango in cold-pressed sesame oil, tempered with mustard, fenugreek and hand-pounded red chilli. Made in small batches in a home kitchen in Andhra — tangy, fiery and deeply aromatic. No added colour, no preservatives; the oil layer on top keeps it fresh naturally.",
    ingredients: "Raw mango, sesame oil, chilli, mustard, salt",
    shelfLife: "6 months",
    storageInstructions: "Refrigerate after opening",
    madeIn: "Guntur, Andhra Pradesh",
  },
  {
    id: "pr2",
    slug: "green-chilli-chutney",
    vendorId: "vd2",
    name: "Green Chilli Chutney",
    categoryId: "ct2",
    occasionIds: ["oc4"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Green Chilli Chutney product photo",
        src: "/images/products/green-chilli-chutney.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "green-chilli-chutney-200g", label: "200 g", price: 189, mrp: 219, stock: 35 },
    ],
    defaultWeightSku: "green-chilli-chutney-200g",
    rating: 4.7,
    reviewCount: 86,
    tags: ["New"],
    isPackaged: true,
    cashbackPct: 5,
    description:
      "A fiery, tangy green chilli chutney stone-ground the traditional way — brilliant spooned over dosa, idli or a simple curd rice.",
  },
  {
    id: "pr3",
    slug: "ragi-almond-cookies",
    vendorId: "vd3",
    name: "Ragi Almond Cookies",
    categoryId: "ct3",
    featured: true,
    occasionIds: ["oc1", "oc6"],
    dietary: ["vegetarian", "gluten-free"],
    images: [
      {
        placeholder: "Ragi Almond Cookies product photo",
        src: "/images/products/ragi-almond-cookies.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "ragi-almond-cookies-200g", label: "200 g", price: 220, mrp: 260, stock: 50 },
    ],
    defaultWeightSku: "ragi-almond-cookies-200g",
    rating: 4.9,
    reviewCount: 204,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    description:
      "Wholesome finger-millet cookies studded with almonds, lightly sweetened and baked in small batches for a nutty, crumbly bite.",
  },
  {
    id: "pr4",
    slug: "roasted-makhana",
    vendorId: "vd4",
    name: "Roasted Makhana",
    categoryId: "ct7",
    occasionIds: ["oc5", "oc8"],
    dietary: ["vegetarian", "vegan", "gluten-free"],
    images: [
      {
        placeholder: "Roasted Makhana product photo",
        src: "/images/products/roasted-makhana.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "roasted-makhana-100g", label: "100 g", price: 160, mrp: 190, stock: 60 },
    ],
    defaultWeightSku: "roasted-makhana-100g",
    rating: 4.6,
    reviewCount: 92,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    description:
      "Fox nuts dry-roasted with a light spice dusting — a crunchy, guilt-free snack straight from the pantry.",
  },
  {
    id: "pr5",
    slug: "dark-chocolate-bark",
    vendorId: "vd5",
    name: "Dark Chocolate Bark",
    categoryId: "ct6",
    occasionIds: ["oc2", "oc1"],
    dietary: ["vegetarian", "vegan"],
    images: [
      {
        placeholder: "Dark Chocolate Bark product photo",
        src: "/images/products/dark-chocolate-bark.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "dark-chocolate-bark-150g", label: "150 g", price: 340, mrp: 399, stock: 30 },
    ],
    defaultWeightSku: "dark-chocolate-bark-150g",
    rating: 4.8,
    reviewCount: 73,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    description:
      "Single-origin dark chocolate hand-tempered and topped with roasted nuts, snapped into rustic shards.",
  },
  {
    id: "pr6",
    slug: "dry-fruit-laddoo-box",
    vendorId: "vd6",
    name: "Dry Fruit Laddoo Box",
    categoryId: "ct5",
    featured: true,
    occasionIds: ["oc3", "oc7"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Dry Fruit Laddoo Box product photo",
        src: "/images/products/dry-fruit-laddoo-box.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "dry-fruit-laddoo-box-400g", label: "400 g", price: 560, mrp: 640, stock: 20 },
    ],
    defaultWeightSku: "dry-fruit-laddoo-box-400g",
    rating: 4.9,
    reviewCount: 140,
    tags: ["Festive"],
    isPackaged: true,
    cashbackPct: 5,
    description:
      "A festive assortment of dates, almonds and cashews bound into ghee-rich laddoos — no refined sugar, just dried-fruit sweetness.",
  },
  {
    id: "pr7",
    slug: "masala-chai-blend",
    vendorId: "vd7",
    name: "Masala Chai Blend",
    categoryId: "ct7",
    occasionIds: ["oc4", "oc8"],
    dietary: ["vegetarian", "vegan"],
    images: [
      {
        placeholder: "Masala Chai Blend product photo",
        src: "/images/products/masala-chai-blend.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "masala-chai-blend-150g", label: "150 g", price: 275, mrp: 310, stock: 45 },
    ],
    defaultWeightSku: "masala-chai-blend-150g",
    rating: 4.7,
    reviewCount: 61,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    description:
      "A hand-blended CTC tea with cardamom, ginger and clove — brews into a rich, spiced cup every time.",
  },
  {
    id: "pr8",
    slug: "festive-assorted-hamper",
    vendorId: "vd8",
    name: "Festive Assorted Hamper",
    categoryId: "ct8",
    featured: true,
    occasionIds: ["oc3", "oc5", "oc7"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Festive Assorted Hamper product photo",
        src: "/images/products/festive-assorted-hamper.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "festive-assorted-hamper-curated", label: "Curated", price: 1499, mrp: 1750, stock: 15 },
    ],
    defaultWeightSku: "festive-assorted-hamper-curated",
    rating: 4.9,
    reviewCount: 57,
    tags: ["Curated"],
    isPackaged: true,
    cashbackPct: 5,
    description:
      "Our own curated edit of best-selling pickles, bakes and sweets from across the maker community, packed into one gift-ready box.",
  },
];

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

/** Cart/hamper/checkout (M3) resolve lines by id — the cart itself only stores `productId`. */
export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
