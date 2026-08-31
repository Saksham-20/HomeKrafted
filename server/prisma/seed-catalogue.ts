/**
 * M56 catalogue refresh: real (licensed) photography for the craft
 * listings that shipped image-less, one new food category, and fourteen
 * new demo listings across the existing kitchens and makers.
 *
 * **Additive, upsert-by-slug, and safe to run against production** — the
 * `seed-crafts.ts` contract. Nothing here deletes, nothing here
 * overwrites a value somebody set, and a second run is a no-op.
 *
 *   npx ts-node prisma/seed-catalogue.ts
 *
 * **Every image path here is licensed stock photography**, committed
 * under `client/public/images/products/` and recorded file-by-file in
 * `docs/IMAGE-LICENSES.md` (Pexels License — real photographs, never
 * AI-generated, per CLAUDE.md's imagery rule). They are stand-ins for a
 * demo catalogue: a real maker's upload replaces them listing by
 * listing, which is why the backfill below touches only images that are
 * still NULL.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** The category the M56 batch adds. Food ties sort by name (sortOrder 0). */
const NEW_CATEGORIES = [
  {
    slug: 'sweets-ladoos',
    name: 'Sweets & Ladoos',
    imagePlaceholder: 'Sweets & Ladoos category tile',
    imageSrc: '/images/categories/sweets-ladoos.jpg',
    group: 'food' as const,
    sortOrder: 0,
  },
];

/**
 * Craft categories shipped without a tile image (seed-crafts held no
 * photography). Filled only where still NULL, so a hand-set tile stays.
 */
const CATEGORY_TILE_BACKFILL: Record<string, string> = {
  'candles-home': '/images/categories/candles-home.jpg',
  'handmade-jewellery': '/images/categories/handmade-jewellery.jpg',
  'art-prints': '/images/categories/art-prints.jpg',
  'personalised-gifts': '/images/categories/personalised-gifts.jpg',
};

/**
 * The eight craft listings seeded image-less by `seed-crafts.ts`. Sets
 * the `sortOrder: 0` `ProductImage.src` only where it is still NULL —
 * a maker's own upload is never overwritten.
 */
const PRODUCT_IMAGE_BACKFILL: Record<string, string> = {
  'sandalwood-soy-candle': '/images/products/sandalwood-soy-candle.jpg',
  'block-printed-table-runner': '/images/products/block-printed-table-runner.jpg',
  'stoneware-mug-pair': '/images/products/stoneware-mug-pair.jpg',
  'brass-diya-set': '/images/products/brass-diya-set.jpg',
  'oxidised-silver-jhumkas': '/images/products/oxidised-silver-jhumkas.jpg',
  'thread-and-bead-necklace': '/images/products/thread-and-bead-necklace.jpg',
  'hand-painted-botanical-print': '/images/products/hand-painted-botanical-print.jpg',
  'personalised-name-keyring': '/images/products/personalised-name-keyring.jpg',
};

/**
 * Existing demo food listings that survive a courier (M56, owner's
 * framing: some food is a craft in shipping terms — a jar of pickle or a
 * tin of cookies posts anywhere; a thali or warm brownies are eaten
 * fresh, nearby). Flipped to `national` only while still on the `local`
 * default, and only for these seeded slugs — a real kitchen's own choice
 * of scope is never touched. Deliberately absent: green-chilli-chutney
 * (ground fresh), besan/motichoor ladoo (made to order), brownies
 * (baked the morning of delivery).
 */
const SHIPPING_SCOPE_BACKFILL: string[] = [
  'mango-thokku-pickle',
  'ragi-almond-cookies',
  'roasted-makhana',
  'dark-chocolate-bark',
  'dry-fruit-laddoo-box',
  'masala-chai-blend',
  'festive-assorted-hamper',
  // The M56 listings repeat here so a database seeded by an earlier run
  // of this script (which created them `local`) converges too.
  'chakli-spirals',
  'masala-mathri',
  'roasted-chivda',
  'haldi-doodh-mix',
  'mixed-veg-pickle',
  'homemade-granola',
  'banana-chips',
];

interface NewListing {
  slug: string;
  name: string;
  vendorSlug: string;
  categorySlug: string;
  kind: 'food' | 'craft';
  shippingScope: 'local' | 'national';
  /** Prisma enum spelling — `gluten_free`, not the frontend's dash. */
  dietary: ('vegetarian' | 'vegan' | 'gluten_free' | 'sugar_free' | 'contains_nuts')[];
  tags: ('Bestseller' | 'New' | 'Festive' | 'Curated')[];
  occasionSlugs: string[];
  imageSrc: string;
  description: string;
  tiers: { label: string; price: number; mrp: number; stock: number }[];
}

const NEW_LISTINGS: NewListing[] = [
  // ---- Homemade food, on the existing kitchens ------------------------
  {
    slug: 'chakli-spirals',
    name: 'Chakli Spirals',
    vendorSlug: 'crunch-corner',
    categorySlug: 'snacks',
    kind: 'food',
    shippingScope: 'national',
    dietary: ['vegetarian'],
    tags: ['Bestseller'],
    occasionSlugs: ['diwali', 'thank-you'],
    imageSrc: '/images/products/chakli-spirals.jpg',
    description:
      'Crisp rice-flour spirals pressed by hand and fried in small batches — the tea-time chakli that disappears before the tea does. Lightly spiced with sesame and ajwain.',
    tiers: [
      { label: '250 g', price: 180, mrp: 220, stock: 30 },
      { label: '500 g', price: 340, mrp: 440, stock: 18 },
    ],
  },
  {
    slug: 'masala-mathri',
    name: 'Masala Mathri',
    vendorSlug: 'dadis-recipe',
    categorySlug: 'snacks',
    kind: 'food',
    shippingScope: 'national',
    dietary: ['vegetarian'],
    tags: [],
    occasionSlugs: ['karwa-chauth', 'thank-you'],
    imageSrc: '/images/products/masala-mathri.jpg',
    description:
      'Flaky, kasuri-methi mathri rolled and fried the way it has been in this family for three generations. Keeps for weeks in the jar; rarely lasts that long.',
    tiers: [{ label: '300 g', price: 160, mrp: 200, stock: 25 }],
  },
  {
    slug: 'roasted-chivda',
    name: 'Roasted Chivda',
    vendorSlug: 'home-batch',
    categorySlug: 'snacks',
    kind: 'food',
    shippingScope: 'national',
    dietary: ['vegetarian', 'vegan'],
    tags: ['New'],
    occasionSlugs: ['thank-you'],
    imageSrc: '/images/products/roasted-chivda.jpg',
    description:
      'Thin poha roasted — not fried — with peanuts, curry leaves and a squeeze of lime powder. A lighter chivda that still crunches.',
    tiers: [{ label: '250 g', price: 150, mrp: 190, stock: 40 }],
  },
  {
    slug: 'besan-ladoo',
    name: 'Besan Ladoo',
    vendorSlug: 'dadis-recipe',
    categorySlug: 'sweets-ladoos',
    kind: 'food',
    shippingScope: 'local',
    dietary: ['vegetarian'],
    tags: ['Bestseller', 'Festive'],
    occasionSlugs: ['diwali', 'raksha-bandhan', 'birthday'],
    imageSrc: '/images/products/besan-ladoo.jpg',
    description:
      'Gram flour roasted slow in ghee until it smells like a festival, rolled while still warm. Made to order in the two days before delivery, never stocked.',
    tiers: [
      { label: 'Box of 12', price: 380, mrp: 450, stock: 20 },
      { label: 'Box of 24', price: 720, mrp: 900, stock: 10 },
    ],
  },
  {
    slug: 'motichoor-ladoo',
    name: 'Motichoor Ladoo',
    vendorSlug: 'dadis-recipe',
    categorySlug: 'sweets-ladoos',
    kind: 'food',
    shippingScope: 'local',
    dietary: ['vegetarian'],
    tags: ['Festive'],
    occasionSlugs: ['diwali', 'wedding', 'raksha-bandhan'],
    imageSrc: '/images/products/motichoor-ladoo.jpg',
    description:
      'Tiny boondi pearls in saffron sugar syrup, pressed into soft ladoos and finished with melon seeds. The wedding-plate classic, from a home kadhai.',
    tiers: [{ label: 'Box of 12', price: 350, mrp: 420, stock: 22 }],
  },
  {
    slug: 'haldi-doodh-mix',
    name: 'Haldi Doodh Mix',
    vendorSlug: 'hills-leaves',
    categorySlug: 'snacks',
    kind: 'food',
    shippingScope: 'national',
    dietary: ['vegetarian'],
    tags: ['New'],
    occasionSlugs: ['thank-you'],
    imageSrc: '/images/products/haldi-doodh-mix.jpg',
    description:
      'Single-origin turmeric ground with black pepper, cardamom and dried ginger — a spoonful into warm milk is the whole recipe. Blended alongside our chai masalas.',
    tiers: [{ label: '200 g jar', price: 240, mrp: 280, stock: 25 }],
  },
  {
    slug: 'mixed-veg-pickle',
    name: 'Mixed Veg Pickle',
    vendorSlug: 'meeras-homefoods',
    categorySlug: 'pickles',
    kind: 'food',
    shippingScope: 'national',
    dietary: ['vegetarian'],
    tags: ['Bestseller'],
    occasionSlugs: ['housewarming', 'thank-you'],
    imageSrc: '/images/products/mixed-veg-pickle.jpg',
    description:
      'Carrot, cauliflower, turnip and green chilli in mustard oil, sunned on the balcony the old way. Sharp, seasonal and made in winter batches.',
    tiers: [{ label: '400 g jar', price: 280, mrp: 340, stock: 25 }],
  },
  {
    slug: 'homemade-granola',
    name: 'Homemade Granola',
    vendorSlug: 'home-batch',
    categorySlug: 'snacks',
    kind: 'food',
    shippingScope: 'national',
    dietary: ['vegetarian'],
    tags: ['New'],
    occasionSlugs: ['thank-you'],
    imageSrc: '/images/products/homemade-granola.jpg',
    description:
      'Oats, seeds and almonds baked in honey and a little ghee until deeply toasted, with raisins folded in after. No refined sugar, no puffed filler.',
    tiers: [{ label: '400 g jar', price: 420, mrp: 500, stock: 15 }],
  },
  {
    slug: 'banana-chips',
    name: 'Banana Chips',
    vendorSlug: 'crunch-corner',
    categorySlug: 'snacks',
    kind: 'food',
    shippingScope: 'national',
    dietary: ['vegetarian', 'vegan', 'gluten_free'],
    tags: [],
    occasionSlugs: ['thank-you'],
    imageSrc: '/images/products/banana-chips.jpg',
    description:
      'Raw nendran bananas sliced thin and fried crisp in coconut oil, salted and nothing else — the Kerala way, in a Panchkula kitchen.',
    tiers: [{ label: '250 g', price: 140, mrp: 170, stock: 35 }],
  },
  {
    slug: 'walnut-jaggery-brownies',
    name: 'Walnut Jaggery Brownies',
    vendorSlug: 'cocoa-homemade',
    categorySlug: 'bakery',
    kind: 'food',
    shippingScope: 'local',
    dietary: ['vegetarian', 'contains_nuts'],
    tags: ['Bestseller'],
    occasionSlugs: ['birthday', 'anniversary', 'thank-you'],
    imageSrc: '/images/products/walnut-jaggery-brownies.jpg',
    description:
      'Fudgy single-origin dark chocolate brownies sweetened with jaggery, heavy with toasted walnuts. Baked the morning of delivery.',
    tiers: [
      { label: 'Box of 6', price: 480, mrp: 560, stock: 12 },
      { label: 'Box of 9', price: 690, mrp: 840, stock: 8 },
    ],
  },
  // ---- Handcrafted, on the two craft makers ---------------------------
  {
    slug: 'macrame-plant-hanger',
    name: 'Macramé Plant Hanger',
    vendorSlug: 'the-slow-studio',
    categorySlug: 'candles-home',
    kind: 'craft',
    shippingScope: 'national',
    dietary: [],
    tags: ['New'],
    occasionSlugs: ['housewarming'],
    imageSrc: '/images/products/macrame-plant-hanger.jpg',
    description:
      'Hand-knotted cotton rope hanger, about a metre long, sized for a 5–6 inch pot. Knotted in one sitting, so the tension is even top to bottom. Plant and pot not included.',
    tiers: [{ label: 'Single', price: 850, mrp: 1050, stock: 14 }],
  },
  {
    slug: 'terracotta-planter-pair',
    name: 'Terracotta Planter Pair',
    vendorSlug: 'the-slow-studio',
    categorySlug: 'candles-home',
    kind: 'craft',
    // Local, like the mug pair: two fired clay pots are not something a
    // one-person studio should be posting across the country.
    shippingScope: 'local',
    dietary: [],
    tags: [],
    occasionSlugs: ['housewarming'],
    imageSrc: '/images/products/terracotta-planter-pair.jpg',
    description:
      'Two hand-thrown terracotta planters with drainage holes, unglazed so the clay breathes. Roughly 6 inches each; no two pairs match exactly.',
    tiers: [{ label: 'Pair', price: 980, mrp: 1200, stock: 10 }],
  },
  {
    slug: 'embroidered-hoop-art',
    name: 'Embroidered Hoop Art',
    vendorSlug: 'maati-and-thread',
    categorySlug: 'art-prints',
    kind: 'craft',
    shippingScope: 'national',
    dietary: [],
    tags: ['New'],
    occasionSlugs: ['birthday', 'housewarming'],
    imageSrc: '/images/products/embroidered-hoop-art.jpg',
    description:
      'Floral hand embroidery on cotton, framed in its 6-inch wooden hoop and ready to hang. Stitched to order — tell us the colours of the room it is going into.',
    tiers: [{ label: '6-inch hoop', price: 1250, mrp: 1500, stock: 8 }],
  },
  {
    slug: 'crochet-amigurumi-soft-toy',
    name: 'Crochet Amigurumi Soft Toy',
    vendorSlug: 'maati-and-thread',
    categorySlug: 'personalised-gifts',
    kind: 'craft',
    shippingScope: 'national',
    dietary: [],
    tags: [],
    occasionSlugs: ['birthday', 'baby-shower'],
    imageSrc: '/images/products/crochet-amigurumi-soft-toy.jpg',
    description:
      'A hand-crocheted animal in soft cotton yarn with safety eyes — pick an elephant, bear, cat or bunny when you order. Around 20 cm tall, filled with hypoallergenic stuffing.',
    tiers: [{ label: 'One toy', price: 750, mrp: 900, stock: 16 }],
  },
];

async function main(): Promise<void> {
  let created = 0;
  let backfilled = 0;
  let unchanged = 0;
  const touchedCategorySlugs = new Set<string>();

  // ---- New categories ---------------------------------------------------
  console.log('Categories...');
  for (const category of NEW_CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { slug: category.slug } });
    if (existing) {
      unchanged += 1;
      console.log(`  = ${category.slug} (already there, left alone)`);
      continue;
    }
    await prisma.category.create({
      data: { ...category, productCount: 0 },
    });
    created += 1;
    console.log(`  + ${category.slug}`);
  }

  // ---- Category tile backfill -------------------------------------------
  for (const [slug, imageSrc] of Object.entries(CATEGORY_TILE_BACKFILL)) {
    const row = await prisma.category.findUnique({ where: { slug } });
    if (!row) {
      console.log(`  ! ${slug} (not in this database, skipped)`);
      continue;
    }
    if (row.imageSrc) {
      unchanged += 1;
      console.log(`  = ${slug} tile (already has one, left alone)`);
      continue;
    }
    await prisma.category.update({ where: { id: row.id }, data: { imageSrc } });
    backfilled += 1;
    console.log(`  + ${slug} tile → ${imageSrc}`);
  }

  // ---- Craft listing image backfill -------------------------------------
  console.log('\nCraft listing photos...');
  for (const [slug, src] of Object.entries(PRODUCT_IMAGE_BACKFILL)) {
    const product = await prisma.product.findUnique({
      where: { slug },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!product) {
      console.log(`  ! ${slug} (not in this database, skipped)`);
      continue;
    }
    const primary = product.images[0];
    if (primary?.src) {
      // The maker (or an admin) has set a real photo since — theirs.
      unchanged += 1;
      console.log(`  = ${slug} (has a photo, left alone)`);
      continue;
    }
    if (primary) {
      await prisma.productImage.update({ where: { id: primary.id }, data: { src } });
    } else {
      await prisma.productImage.create({
        data: { productId: product.id, placeholder: `${product.name} — product photo`, src, ratio: '1/1', sortOrder: 0 },
      });
    }
    backfilled += 1;
    console.log(`  + ${slug} → ${src}`);
  }

  // ---- Shipping scope backfill -------------------------------------------
  console.log('\nShipping scope...');
  for (const slug of SHIPPING_SCOPE_BACKFILL) {
    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, shippingScope: true },
    });
    if (!product) {
      console.log(`  ! ${slug} (not in this database, skipped)`);
      continue;
    }
    if (product.shippingScope !== 'local') {
      unchanged += 1;
      console.log(`  = ${slug} (already ${product.shippingScope}, left alone)`);
      continue;
    }
    await prisma.product.update({
      where: { id: product.id },
      data: { shippingScope: 'national' },
    });
    backfilled += 1;
    console.log(`  + ${slug} → national`);
  }

  // ---- New listings ------------------------------------------------------
  console.log('\nNew listings...');
  const occasions = await prisma.occasion.findMany({ select: { id: true, slug: true } });
  const occasionIdBySlug = new Map(occasions.map((o) => [o.slug, o.id]));

  for (const listing of NEW_LISTINGS) {
    const existing = await prisma.product.findUnique({ where: { slug: listing.slug } });
    if (existing) {
      unchanged += 1;
      console.log(`  = ${listing.slug} (already there, left alone)`);
      continue;
    }

    const vendor = await prisma.vendor.findUnique({ where: { slug: listing.vendorSlug } });
    if (!vendor) {
      console.log(`  ! ${listing.slug} skipped — vendor ${listing.vendorSlug} missing`);
      continue;
    }
    const category = await prisma.category.findUnique({ where: { slug: listing.categorySlug } });
    if (!category) {
      console.log(`  ! ${listing.slug} skipped — category ${listing.categorySlug} missing`);
      continue;
    }

    const tiers = listing.tiers.map((tier) => ({
      sku: `${listing.slug}-${tier.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label: tier.label,
      price: tier.price,
      mrp: tier.mrp,
      stock: tier.stock,
    }));
    const occasionIds = listing.occasionSlugs
      .map((slug) => occasionIdBySlug.get(slug))
      .filter((id): id is string => Boolean(id));

    await prisma.product.create({
      data: {
        slug: listing.slug,
        vendorId: vendor.id,
        name: listing.name,
        categoryId: category.id,
        kind: listing.kind,
        shippingScope: listing.shippingScope,
        // M22 — explicit, because the column default is `pending` and
        // seeded demo stock is meant to be visible.
        moderationStatus: 'active',
        dietary: listing.dietary,
        defaultWeightSku: tiers[0].sku,
        tags: listing.tags,
        isPackaged: true,
        cashbackPct: 5,
        description: listing.description,
        images: {
          create: [
            {
              placeholder: `${listing.name} — product photo`,
              src: listing.imageSrc,
              ratio: '1/1',
              sortOrder: 0,
            },
          ],
        },
        weightOptions: { create: tiers },
        occasions: { create: occasionIds.map((occasionId) => ({ occasionId })) },
      },
    });
    touchedCategorySlugs.add(listing.categorySlug);
    created += 1;
    console.log(`  + ${listing.slug} (₹${tiers[0].price}, ${listing.kind}, ${listing.shippingScope})`);
  }

  // ---- Recompute counts (never increment — the M15 rule) -----------------
  for (const c of NEW_CATEGORIES) touchedCategorySlugs.add(c.slug);
  console.log('\nRecomputing category counts...');
  for (const slug of touchedCategorySlugs) {
    const row = await prisma.category.findUnique({ where: { slug } });
    if (!row) continue;
    const count = await prisma.product.count({
      where: { categoryId: row.id, moderationStatus: 'active' },
    });
    await prisma.category.update({ where: { id: row.id }, data: { productCount: count } });
    console.log(`  ${slug}: ${count}`);
  }

  console.log(`\nDone. ${created} created, ${backfilled} backfilled, ${unchanged} left alone.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
