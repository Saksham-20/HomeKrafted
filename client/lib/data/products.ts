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
    kind: "food",
    shippingScope: "national",
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
    kind: "food",
    shippingScope: "national",
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
    kind: "food",
    shippingScope: "national",
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
    kind: "food",
    shippingScope: "national",
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
    kind: "food",
    shippingScope: "national",
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
    kind: "food",
    shippingScope: "national",
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
    // Two days. A hamper is assembled per order, so it is the honest
    // demo case for the "Pre-order" badge (2026-09-05).
    prepTimeMins: 2880,
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
    // The one mock hamper (M18), so `/hamper` has something to render in
    // `NEXT_PUBLIC_USE_MOCK` mode rather than showing its empty state and
    // looking broken offline.
    isHamper: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "national",
    description:
      "Our own curated edit of best-selling pickles, bakes and sweets from across the maker community, packed into one gift-ready box.",
  },
  /*
   * The M56 catalogue refresh (owner, 2026-08-31): ten more food listings
   * on the existing kitchens, plus the twelve craft listings — the eight
   * production rows `server/prisma/seed-crafts.ts` created (mirrored here
   * for the first time, so mock mode's /gifts finally renders a
   * catalogue) and four new ones. Photography is licensed stock
   * (docs/IMAGE-LICENSES.md), stand-ins until real makers upload their
   * own; ratings honest at 0 — nothing invented.
   */
  {
    id: "pr9",
    slug: "chakli-spirals",
    vendorId: "vd4",
    name: "Chakli Spirals",
    categoryId: "ct7",
    occasionIds: ["oc3", "oc8"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Chakli Spirals \u2014 product photo",
        src: "/images/products/chakli-spirals.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "chakli-spirals-250-g", label: "250 g", price: 180, mrp: 220, stock: 30 },
      { sku: "chakli-spirals-500-g", label: "500 g", price: 340, mrp: 440, stock: 18 },
    ],
    defaultWeightSku: "chakli-spirals-250-g",
    rating: 0,
    reviewCount: 0,
    tags: ["Bestseller"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "national",
    description:
      "Crisp rice-flour spirals pressed by hand and fried in small batches \u2014 the tea-time chakli that disappears before the tea does. Lightly spiced with sesame and ajwain.",
  },
  {
    id: "pr10",
    slug: "masala-mathri",
    vendorId: "vd6",
    name: "Masala Mathri",
    categoryId: "ct7",
    occasionIds: ["oc10", "oc8"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Masala Mathri \u2014 product photo",
        src: "/images/products/masala-mathri.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "masala-mathri-300-g", label: "300 g", price: 160, mrp: 200, stock: 25 },
    ],
    defaultWeightSku: "masala-mathri-300-g",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "national",
    description:
      "Flaky, kasuri-methi mathri rolled and fried the way it has been in this family for three generations. Keeps for weeks in the jar; rarely lasts that long.",
  },
  {
    id: "pr11",
    slug: "roasted-chivda",
    vendorId: "vd3",
    name: "Roasted Chivda",
    categoryId: "ct7",
    occasionIds: ["oc8"],
    dietary: ["vegetarian", "vegan"],
    images: [
      {
        placeholder: "Roasted Chivda \u2014 product photo",
        src: "/images/products/roasted-chivda.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "roasted-chivda-250-g", label: "250 g", price: 150, mrp: 190, stock: 40 },
    ],
    defaultWeightSku: "roasted-chivda-250-g",
    rating: 0,
    reviewCount: 0,
    tags: ["New"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "national",
    description:
      "Thin poha roasted \u2014 not fried \u2014 with peanuts, curry leaves and a squeeze of lime powder. A lighter chivda that still crunches.",
  },
  {
    id: "pr12",
    slug: "besan-ladoo",
    vendorId: "vd6",
    name: "Besan Ladoo",
    categoryId: "ct13",
    occasionIds: ["oc3", "oc9", "oc1"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Besan Ladoo \u2014 product photo",
        src: "/images/products/besan-ladoo.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "besan-ladoo-box-of-12", label: "Box of 12", price: 380, mrp: 450, stock: 20 },
      { sku: "besan-ladoo-box-of-24", label: "Box of 24", price: 720, mrp: 900, stock: 10 },
    ],
    defaultWeightSku: "besan-ladoo-box-of-12",
    rating: 0,
    reviewCount: 0,
    tags: ["Bestseller", "Festive"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "local",
    description:
      "Gram flour roasted slow in ghee until it smells like a festival, rolled while still warm. Made to order in the two days before delivery, never stocked.",
  },
  {
    id: "pr13",
    slug: "motichoor-ladoo",
    vendorId: "vd6",
    name: "Motichoor Ladoo",
    categoryId: "ct13",
    occasionIds: ["oc3", "oc7", "oc9"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Motichoor Ladoo \u2014 product photo",
        src: "/images/products/motichoor-ladoo.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "motichoor-ladoo-box-of-12", label: "Box of 12", price: 350, mrp: 420, stock: 22 },
    ],
    defaultWeightSku: "motichoor-ladoo-box-of-12",
    rating: 0,
    reviewCount: 0,
    tags: ["Festive"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "local",
    description:
      "Tiny boondi pearls in saffron sugar syrup, pressed into soft ladoos and finished with melon seeds. The wedding-plate classic, from a home kadhai.",
  },
  {
    id: "pr14",
    slug: "haldi-doodh-mix",
    vendorId: "vd7",
    name: "Haldi Doodh Mix",
    categoryId: "ct7",
    occasionIds: ["oc8"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Haldi Doodh Mix \u2014 product photo",
        src: "/images/products/haldi-doodh-mix.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "haldi-doodh-mix-200-g-jar", label: "200 g jar", price: 240, mrp: 280, stock: 25 },
    ],
    defaultWeightSku: "haldi-doodh-mix-200-g-jar",
    rating: 0,
    reviewCount: 0,
    tags: ["New"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "national",
    description:
      "Single-origin turmeric ground with black pepper, cardamom and dried ginger \u2014 a spoonful into warm milk is the whole recipe. Blended alongside our chai masalas.",
  },
  {
    id: "pr15",
    slug: "mixed-veg-pickle",
    vendorId: "vd2",
    name: "Mixed Veg Pickle",
    categoryId: "ct1",
    occasionIds: ["oc4", "oc8"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Mixed Veg Pickle \u2014 product photo",
        src: "/images/products/mixed-veg-pickle.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "mixed-veg-pickle-400-g-jar", label: "400 g jar", price: 280, mrp: 340, stock: 25 },
    ],
    defaultWeightSku: "mixed-veg-pickle-400-g-jar",
    rating: 0,
    reviewCount: 0,
    tags: ["Bestseller"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "national",
    description:
      "Carrot, cauliflower, turnip and green chilli in mustard oil, sunned on the balcony the old way. Sharp, seasonal and made in winter batches.",
  },
  {
    id: "pr16",
    slug: "homemade-granola",
    vendorId: "vd3",
    name: "Homemade Granola",
    categoryId: "ct7",
    occasionIds: ["oc8"],
    dietary: ["vegetarian"],
    images: [
      {
        placeholder: "Homemade Granola \u2014 product photo",
        src: "/images/products/homemade-granola.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "homemade-granola-400-g-jar", label: "400 g jar", price: 420, mrp: 500, stock: 15 },
    ],
    defaultWeightSku: "homemade-granola-400-g-jar",
    rating: 0,
    reviewCount: 0,
    tags: ["New"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "national",
    description:
      "Oats, seeds and almonds baked in honey and a little ghee until deeply toasted, with raisins folded in after. No refined sugar, no puffed filler.",
  },
  {
    id: "pr17",
    slug: "banana-chips",
    vendorId: "vd4",
    name: "Banana Chips",
    categoryId: "ct7",
    occasionIds: ["oc8"],
    dietary: ["vegetarian", "vegan", "gluten-free"],
    images: [
      {
        placeholder: "Banana Chips \u2014 product photo",
        src: "/images/products/banana-chips.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "banana-chips-250-g", label: "250 g", price: 140, mrp: 170, stock: 35 },
    ],
    defaultWeightSku: "banana-chips-250-g",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "national",
    description:
      "Raw nendran bananas sliced thin and fried crisp in coconut oil, salted and nothing else \u2014 the Kerala way, in a Panchkula kitchen.",
  },
  {
    id: "pr18",
    slug: "walnut-jaggery-brownies",
    vendorId: "vd5",
    name: "Walnut Jaggery Brownies",
    categoryId: "ct4",
    occasionIds: ["oc1", "oc2", "oc8"],
    dietary: ["vegetarian", "contains-nuts"],
    // Baked to order — four hours, so the badge reads in hours rather
    // than days and both label branches are visible in the demo.
    prepTimeMins: 240,
    images: [
      {
        placeholder: "Walnut Jaggery Brownies \u2014 product photo",
        src: "/images/products/walnut-jaggery-brownies.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "walnut-jaggery-brownies-box-of-6", label: "Box of 6", price: 480, mrp: 560, stock: 12 },
      { sku: "walnut-jaggery-brownies-box-of-9", label: "Box of 9", price: 690, mrp: 840, stock: 8 },
    ],
    defaultWeightSku: "walnut-jaggery-brownies-box-of-6",
    rating: 0,
    reviewCount: 0,
    tags: ["Bestseller"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "food",
    shippingScope: "local",
    description:
      "Fudgy single-origin dark chocolate brownies sweetened with jaggery, heavy with toasted walnuts. Baked the morning of delivery.",
  },
  {
    id: "pr19",
    slug: "sandalwood-soy-candle",
    vendorId: "vd11",
    name: "Sandalwood Soy Candle",
    categoryId: "ct9",
    occasionIds: ["oc4", "oc8"],
    dietary: [],
    images: [
      {
        placeholder: "Sandalwood Soy Candle \u2014 product photo",
        src: "/images/products/sandalwood-soy-candle.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "sandalwood-soy-candle-single", label: "Single", price: 640, mrp: 750, stock: 24 },
      { sku: "sandalwood-soy-candle-set-of-2", label: "Set of 2", price: 1180, mrp: 1500, stock: 12 },
    ],
    defaultWeightSku: "sandalwood-soy-candle-single",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "Hand-poured soy wax with sandalwood and a little vetiver, in a reusable stoneware pot. Around 40 hours of burn. Poured, cured and labelled by hand, so no two pots are quite identical.",
  },
  {
    id: "pr20",
    slug: "block-printed-table-runner",
    vendorId: "vd11",
    name: "Block-Printed Table Runner",
    categoryId: "ct9",
    occasionIds: ["oc4", "oc7"],
    dietary: [],
    images: [
      {
        placeholder: "Block-Printed Table Runner \u2014 product photo",
        src: "/images/products/block-printed-table-runner.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "block-printed-table-runner-6-ft", label: "6 ft", price: 1450, mrp: 1800, stock: 8 },
    ],
    defaultWeightSku: "block-printed-table-runner-6-ft",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "Hand block-printed cotton runner, natural dyes, six feet long. Printed one block at a time, so the repeat wanders slightly \u2014 that is the point of it.",
  },
  {
    id: "pr21",
    slug: "stoneware-mug-pair",
    vendorId: "vd11",
    name: "Stoneware Mug Pair",
    categoryId: "ct9",
    occasionIds: ["oc2", "oc4"],
    dietary: [],
    images: [
      {
        placeholder: "Stoneware Mug Pair \u2014 product photo",
        src: "/images/products/stoneware-mug-pair.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "stoneware-mug-pair-pair", label: "Pair", price: 1350, mrp: 1600, stock: 6 },
    ],
    defaultWeightSku: "stoneware-mug-pair-pair",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "local",
    description:
      "Two wheel-thrown stoneware mugs, matte glaze, about 300ml each. Dishwasher safe. Fired in small kiln loads.",
  },
  {
    id: "pr22",
    slug: "brass-diya-set",
    vendorId: "vd11",
    name: "Brass Diya Set of Four",
    categoryId: "ct9",
    occasionIds: ["oc3", "oc4"],
    dietary: [],
    images: [
      {
        placeholder: "Brass Diya Set of Four \u2014 product photo",
        src: "/images/products/brass-diya-set.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "brass-diya-set-set-of-4", label: "Set of 4", price: 890, mrp: 1100, stock: 20 },
    ],
    defaultWeightSku: "brass-diya-set-set-of-4",
    rating: 0,
    reviewCount: 0,
    tags: ["Festive"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "Four small cast-brass diyas, hand-finished and unlacquered so they age. Comes boxed in the same cotton the runners are printed on.",
  },
  {
    id: "pr23",
    slug: "oxidised-silver-jhumkas",
    vendorId: "vd12",
    name: "Oxidised Silver Jhumkas",
    categoryId: "ct10",
    occasionIds: ["oc1", "oc7", "oc2"],
    dietary: [],
    images: [
      {
        placeholder: "Oxidised Silver Jhumkas \u2014 product photo",
        src: "/images/products/oxidised-silver-jhumkas.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "oxidised-silver-jhumkas-one-pair", label: "One pair", price: 2400, mrp: 2900, stock: 10 },
    ],
    defaultWeightSku: "oxidised-silver-jhumkas-one-pair",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "Sterling silver jhumkas, oxidised and hand-polished, with a small freshwater pearl drop. Light enough to actually wear all evening.",
  },
  {
    id: "pr24",
    slug: "thread-and-bead-necklace",
    vendorId: "vd12",
    name: "Thread & Bead Necklace",
    categoryId: "ct10",
    occasionIds: ["oc1", "oc8"],
    dietary: [],
    images: [
      {
        placeholder: "Thread & Bead Necklace \u2014 product photo",
        src: "/images/products/thread-and-bead-necklace.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "thread-and-bead-necklace-standard", label: "Standard", price: 1150, mrp: 1400, stock: 15 },
    ],
    defaultWeightSku: "thread-and-bead-necklace-standard",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "Hand-knotted silk thread with glass and brass beads, adjustable length. Made to order in whatever colourway you ask for.",
  },
  {
    id: "pr25",
    slug: "hand-painted-botanical-print",
    vendorId: "vd12",
    name: "Hand-Painted Botanical Print",
    categoryId: "ct11",
    occasionIds: ["oc4", "oc1"],
    dietary: [],
    images: [
      {
        placeholder: "Hand-Painted Botanical Print \u2014 product photo",
        src: "/images/products/hand-painted-botanical-print.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "hand-painted-botanical-print-a4-unframed", label: "A4, unframed", price: 1800, mrp: 2200, stock: 5 },
    ],
    defaultWeightSku: "hand-painted-botanical-print-a4-unframed",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "Original gouache on cotton-rag paper, A4, unframed. Painted individually rather than reproduced, so the one that arrives is the one in the photograph.",
  },
  {
    id: "pr26",
    slug: "personalised-name-keyring",
    vendorId: "vd12",
    name: "Personalised Name Keyring",
    categoryId: "ct12",
    occasionIds: ["oc1", "oc5", "oc8"],
    dietary: [],
    images: [
      {
        placeholder: "Personalised Name Keyring \u2014 product photo",
        src: "/images/products/personalised-name-keyring.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "personalised-name-keyring-single", label: "Single", price: 450, mrp: 550, stock: 40 },
      { sku: "personalised-name-keyring-set-of-3", label: "Set of 3", price: 1200, mrp: 1650, stock: 15 },
    ],
    defaultWeightSku: "personalised-name-keyring-single",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "Hand-stamped brass keyring, up to twelve letters. Tell us the name when you order. Each letter is struck one at a time, so the spacing is a person, not a machine.",
  },
  {
    id: "pr27",
    slug: "macrame-plant-hanger",
    vendorId: "vd11",
    name: "Macram\u00e9 Plant Hanger",
    categoryId: "ct9",
    occasionIds: ["oc4"],
    dietary: [],
    images: [
      {
        placeholder: "Macram\u00e9 Plant Hanger \u2014 product photo",
        src: "/images/products/macrame-plant-hanger.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "macrame-plant-hanger-single", label: "Single", price: 850, mrp: 1050, stock: 14 },
    ],
    defaultWeightSku: "macrame-plant-hanger-single",
    rating: 0,
    reviewCount: 0,
    tags: ["New"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "Hand-knotted cotton rope hanger, about a metre long, sized for a 5-6 inch pot. Knotted in one sitting, so the tension is even top to bottom. Plant and pot not included.",
  },
  {
    id: "pr28",
    slug: "terracotta-planter-pair",
    vendorId: "vd11",
    name: "Terracotta Planter Pair",
    categoryId: "ct9",
    occasionIds: ["oc4"],
    dietary: [],
    images: [
      {
        placeholder: "Terracotta Planter Pair \u2014 product photo",
        src: "/images/products/terracotta-planter-pair.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "terracotta-planter-pair-pair", label: "Pair", price: 980, mrp: 1200, stock: 10 },
    ],
    defaultWeightSku: "terracotta-planter-pair-pair",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "local",
    description:
      "Two hand-thrown terracotta planters with drainage holes, unglazed so the clay breathes. Roughly 6 inches each; no two pairs match exactly.",
  },
  {
    id: "pr29",
    slug: "embroidered-hoop-art",
    vendorId: "vd12",
    name: "Embroidered Hoop Art",
    categoryId: "ct11",
    occasionIds: ["oc1", "oc4"],
    dietary: [],
    images: [
      {
        placeholder: "Embroidered Hoop Art \u2014 product photo",
        src: "/images/products/embroidered-hoop-art.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "embroidered-hoop-art-6-inch-hoop", label: "6-inch hoop", price: 1250, mrp: 1500, stock: 8 },
    ],
    defaultWeightSku: "embroidered-hoop-art-6-inch-hoop",
    rating: 0,
    reviewCount: 0,
    tags: ["New"],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "Floral hand embroidery on cotton, framed in its 6-inch wooden hoop and ready to hang. Stitched to order \u2014 tell us the colours of the room it is going into.",
  },
  {
    id: "pr30",
    slug: "crochet-amigurumi-soft-toy",
    vendorId: "vd12",
    name: "Crochet Amigurumi Soft Toy",
    categoryId: "ct12",
    occasionIds: ["oc1", "oc6"],
    dietary: [],
    images: [
      {
        placeholder: "Crochet Amigurumi Soft Toy \u2014 product photo",
        src: "/images/products/crochet-amigurumi-soft-toy.jpg",
        ratio: "1/1",
      },
    ],
    weightOptions: [
      { sku: "crochet-amigurumi-soft-toy-one-toy", label: "One toy", price: 750, mrp: 900, stock: 16 },
    ],
    defaultWeightSku: "crochet-amigurumi-soft-toy-one-toy",
    rating: 0,
    reviewCount: 0,
    tags: [],
    isPackaged: true,
    cashbackPct: 5,
    kind: "craft",
    shippingScope: "national",
    description:
      "A hand-crocheted animal in soft cotton yarn with safety eyes \u2014 pick an elephant, bear, cat or bunny when you order. Around 20 cm tall, filled with hypoallergenic stuffing.",
  },
];

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

/** Cart/hamper/checkout (M3) resolve lines by id — the cart itself only stores `productId`. */
export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
