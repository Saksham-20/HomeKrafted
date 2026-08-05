/**
 * Seeds the Handcrafted Gifts vertical: four craft categories, two craft
 * makers, and their listings.
 *
 * **Additive, upsert-by-slug, and safe to run against production** — the
 * same contract as `seed-meal-plans.ts`, and for the same reason.
 * `seed.ts` clears every table it owns before re-inserting, which is right
 * for a dev reset and catastrophic anywhere real. Nothing here deletes, and
 * a second run is a no-op.
 *
 *   npx ts-node prisma/seed-crafts.ts
 *
 * `/gifts` shipped in M20 and has been live and **empty** since: every
 * seeded vendor is a food kitchen, and until this run there was no way for
 * a craft to exist at all. (There is now — `POST /seller/listings` takes
 * `kind`, so a maker can list one from the portal. This is the demo
 * catalogue, not the mechanism.)
 *
 * Unlike the meal-plan seeder this *does* create vendors, because attaching
 * a candle to a Punjabi food kitchen would read as a bug rather than a
 * catalogue. They get a real storefront, a real seller record and a real
 * login, so clicking through to one is not a dead end.
 *
 * **No `imageSrc` on any listing.** We hold no craft photography, and
 * CLAUDE.md forbids fabricating product imagery — so these render through
 * `ImageSlot`'s placeholder until a maker uploads their own. A labelled
 * placeholder is honest; a generated candle is not.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/** Same documented demo password as `seed.ts` — see `docs/TESTING.md`. */
const DEMO_PASSWORD = 'Passw0rd!123';

/**
 * `sortOrder` continues after the eight food categories, which all sit at
 * the default 0 and fall back to name. Craft tiles therefore land after
 * food on the home page rather than interleaving with it.
 */
const CRAFT_CATEGORIES = [
  {
    slug: 'candles-home',
    name: 'Candles & Home',
    imagePlaceholder: 'CANDLES & HOME',
    sortOrder: 10,
  },
  {
    slug: 'handmade-jewellery',
    name: 'Handmade Jewellery',
    imagePlaceholder: 'JEWELLERY',
    sortOrder: 11,
  },
  { slug: 'art-prints', name: 'Art & Prints', imagePlaceholder: 'ART & PRINTS', sortOrder: 12 },
  {
    slug: 'personalised-gifts',
    name: 'Personalised Gifts',
    imagePlaceholder: 'PERSONALISED',
    sortOrder: 13,
  },
];

interface CraftMaker {
  vendorSlug: string;
  vendorName: string;
  email: string;
  userName: string;
  bio: string;
  location: string;
  area: string;
  lat: number;
  lng: number;
  listings: {
    slug: string;
    name: string;
    categorySlug: string;
    description: string;
    /**
     * `local` or `national`. Deliberately per-listing, not per-maker: a
     * framed print posts fine, a large ceramic piece is a local pickup.
     * Deriving it from `kind` would forbid exactly that distinction.
     */
    shippingScope: 'local' | 'national';
    tiers: { label: string; price: number; mrp: number; stock: number }[];
    occasionSlugs?: string[];
  }[];
}

const MAKERS: CraftMaker[] = [
  {
    vendorSlug: 'the-slow-studio',
    vendorName: 'The Slow Studio',
    email: 'studio@theslowstudio.example',
    userName: 'Ritika Bansal',
    bio: 'Hand-poured soy candles, block-printed textiles and small ceramics, made in a Sector 8 flat in batches of thirty at a time.',
    location: 'Sector 8, Chandigarh',
    area: 'chd-sector-8',
    // Exactly the `chd-sector-8` centroid from `src/common/geo.ts`. An
    // approximate value would make a kitchen's stated area and its actual
    // coords disagree, which is the drift CLAUDE.md warns the two geo
    // tables about.
    lat: 30.7419,
    lng: 76.7906,
    listings: [
      {
        slug: 'sandalwood-soy-candle',
        name: 'Sandalwood Soy Candle',
        categorySlug: 'candles-home',
        description:
          'Hand-poured soy wax with sandalwood and a little vetiver, in a reusable stoneware pot. Around 40 hours of burn. Poured, cured and labelled by hand, so no two pots are quite identical.',
        shippingScope: 'national',
        tiers: [
          { label: 'Single', price: 640, mrp: 750, stock: 24 },
          { label: 'Set of 2', price: 1180, mrp: 1500, stock: 12 },
        ],
        occasionSlugs: ['housewarming', 'thank-you'],
      },
      {
        slug: 'block-printed-table-runner',
        name: 'Block-Printed Table Runner',
        categorySlug: 'candles-home',
        description:
          'Hand block-printed cotton runner, natural dyes, six feet long. Printed one block at a time, so the repeat wanders slightly — that is the point of it.',
        shippingScope: 'national',
        tiers: [{ label: '6 ft', price: 1450, mrp: 1800, stock: 8 }],
        occasionSlugs: ['housewarming', 'wedding'],
      },
      {
        slug: 'stoneware-mug-pair',
        name: 'Stoneware Mug Pair',
        categorySlug: 'candles-home',
        description:
          'Two wheel-thrown stoneware mugs, matte glaze, about 300ml each. Dishwasher safe. Fired in small kiln loads.',
        // Local: two heavy glazed mugs are not something a one-person
        // studio should be posting across the country.
        shippingScope: 'local',
        tiers: [{ label: 'Pair', price: 1350, mrp: 1600, stock: 6 }],
        occasionSlugs: ['anniversary', 'housewarming'],
      },
      {
        slug: 'brass-diya-set',
        name: 'Brass Diya Set of Four',
        categorySlug: 'candles-home',
        description:
          'Four small cast-brass diyas, hand-finished and unlacquered so they age. Comes boxed in the same cotton the runners are printed on.',
        shippingScope: 'national',
        tiers: [{ label: 'Set of 4', price: 890, mrp: 1100, stock: 20 }],
        occasionSlugs: ['diwali', 'housewarming'],
      },
    ],
  },
  {
    vendorSlug: 'maati-and-thread',
    vendorName: 'Maati & Thread',
    email: 'hello@maatiandthread.example',
    userName: 'Simran Kaur',
    bio: 'Hand-worked silver, thread jewellery and paper art from a Mohali studio. Everything is made to order, which is why it takes a week.',
    location: 'Phase 5, Mohali',
    area: 'moh-phase-5',
    lat: 30.702,
    lng: 76.71,
    listings: [
      {
        slug: 'oxidised-silver-jhumkas',
        name: 'Oxidised Silver Jhumkas',
        categorySlug: 'handmade-jewellery',
        description:
          'Sterling silver jhumkas, oxidised and hand-polished, with a small freshwater pearl drop. Light enough to actually wear all evening.',
        shippingScope: 'national',
        tiers: [{ label: 'One pair', price: 2400, mrp: 2900, stock: 10 }],
        occasionSlugs: ['birthday', 'wedding', 'anniversary'],
      },
      {
        slug: 'thread-and-bead-necklace',
        name: 'Thread & Bead Necklace',
        categorySlug: 'handmade-jewellery',
        description:
          'Hand-knotted silk thread with glass and brass beads, adjustable length. Made to order in whatever colourway you ask for.',
        shippingScope: 'national',
        tiers: [{ label: 'Standard', price: 1150, mrp: 1400, stock: 15 }],
        occasionSlugs: ['birthday', 'thank-you'],
      },
      {
        slug: 'hand-painted-botanical-print',
        name: 'Hand-Painted Botanical Print',
        categorySlug: 'art-prints',
        description:
          'Original gouache on cotton-rag paper, A4, unframed. Painted individually rather than reproduced, so the one that arrives is the one in the photograph.',
        shippingScope: 'national',
        tiers: [{ label: 'A4, unframed', price: 1800, mrp: 2200, stock: 5 }],
        occasionSlugs: ['housewarming', 'birthday'],
      },
      {
        slug: 'personalised-name-keyring',
        name: 'Personalised Name Keyring',
        categorySlug: 'personalised-gifts',
        description:
          'Hand-stamped brass keyring, up to twelve letters. Tell us the name when you order. Each letter is struck one at a time, so the spacing is a person, not a machine.',
        shippingScope: 'national',
        tiers: [
          { label: 'Single', price: 450, mrp: 550, stock: 40 },
          { label: 'Set of 3', price: 1200, mrp: 1650, stock: 15 },
        ],
        occasionSlugs: ['birthday', 'corporate', 'thank-you'],
      },
    ],
  },
];

async function main(): Promise<void> {
  let created = 0;
  let unchanged = 0;

  // ---- Categories -------------------------------------------------------
  console.log('Craft categories...');
  for (const category of CRAFT_CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { slug: category.slug } });
    if (existing) {
      unchanged += 1;
      console.log(`  = ${category.slug} (already there, left alone)`);
      continue;
    }
    await prisma.category.create({
      data: {
        slug: category.slug,
        name: category.name,
        imagePlaceholder: category.imagePlaceholder,
        group: 'craft',
        sortOrder: category.sortOrder,
        productCount: 0,
      },
    });
    created += 1;
    console.log(`  + ${category.slug}`);
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const occasions = await prisma.occasion.findMany({ select: { id: true, slug: true } });
  const occasionIdBySlug = new Map(occasions.map((o) => [o.slug, o.id]));

  // ---- Makers and their listings ---------------------------------------
  for (const maker of MAKERS) {
    console.log(`\n${maker.vendorName}...`);

    let vendor = await prisma.vendor.findUnique({ where: { slug: maker.vendorSlug } });
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: {
          slug: maker.vendorSlug,
          name: maker.vendorName,
          // `artist` already exists in `VendorType` and is what these are.
          type: 'artist',
          bio: maker.bio,
          avatarPlaceholder: `${maker.vendorName.toUpperCase()} — AVATAR`,
          bannerPlaceholder: `${maker.vendorName.toUpperCase()} — BANNER`,
          // No `avatarSrc`/`bannerSrc`: the seeded food kitchens share two
          // stock brand images, which are photographs of food. Reusing them
          // on a jeweller would be worse than the placeholder.
          location: maker.location,
          area: maker.area,
          lat: maker.lat,
          lng: maker.lng,
          // Irrelevant to their `national` listings, which skip the radius
          // gate entirely — it only governs the local ones.
          deliveryRadiusKm: 10,
        },
      });
      created += 1;
      console.log(`  + vendor ${maker.vendorSlug}`);
    } else {
      unchanged += 1;
      console.log(`  = vendor ${maker.vendorSlug} (already there, left alone)`);
    }

    let user = await prisma.user.findUnique({ where: { email: maker.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: maker.email,
          name: maker.userName,
          passwordHash,
          role: 'seller',
          /*
            `email`, not `phone`. These carry a real `passwordHash`, so
            email+password signs them in — unlike a HomeKrafter minted by
            admin approval, who has no credential at all and for whom phone
            OTP is the only first sign-in (M17). Demo accounts, documented
            in `docs/TESTING.md`.
          */
          authProviders: ['email'],
          // `@unique`, and derived from the vendor slug so a second run
          // cannot collide with the first.
          referralCode: maker.vendorSlug.toUpperCase().replace(/-/g, '').slice(0, 12) + '250',
        },
      });
      created += 1;
      console.log(`  + login ${maker.email}`);
    }

    const existingSeller = await prisma.seller.findFirst({ where: { userId: user.id } });
    if (!existingSeller) {
      await prisma.seller.create({
        data: {
          userId: user.id,
          vendorId: vendor.id,
          displayName: maker.vendorName,
          // A display/discovery tag. It must never decide access — every
          // HomeKrafter gets every portal module (CLAUDE.md, M12).
          specialties: ['crafts'],
          status: 'approved',
        },
      });
      created += 1;
      console.log(`  + seller record`);
    }

    for (const listing of maker.listings) {
      const existing = await prisma.product.findUnique({ where: { slug: listing.slug } });
      if (existing) {
        unchanged += 1;
        console.log(`  = ${listing.slug} (already there, left alone)`);
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

      const occasionIds = (listing.occasionSlugs ?? [])
        .map((slug) => occasionIdBySlug.get(slug))
        .filter((id): id is string => Boolean(id));

      await prisma.product.create({
        data: {
          slug: listing.slug,
          vendorId: vendor.id,
          name: listing.name,
          categoryId: category.id,
          kind: 'craft',
          shippingScope: listing.shippingScope,
          // Empty, not guessed. A craft has no dietary tags, and the seller
          // form no longer asks — see `ListingForm`.
          dietary: [],
          defaultWeightSku: tiers[0].sku,
          tags: [],
          isPackaged: true,
          cashbackPct: 5,
          description: listing.description,
          // No `imageSrc`: we hold no craft photography and will not
          // fabricate any. `ImageSlot` renders its labelled placeholder.
          images: {
            create: [
              { placeholder: `${listing.name} — product photo`, ratio: '1/1', sortOrder: 0 },
            ],
          },
          weightOptions: { create: tiers },
          occasions: { create: occasionIds.map((occasionId) => ({ occasionId })) },
        },
      });
      created += 1;
      console.log(`  + ${listing.slug} (₹${tiers[0].price}, ${listing.shippingScope})`);
    }
  }

  // `Category.productCount` is a display number on the tiles. Recompute it
  // from the rows rather than incrementing — the same rule M15 set for
  // ratings and follower counts, and the reason is that a count nobody
  // recomputes drifts the first time anything is deleted.
  console.log('\nRecomputing category counts...');
  for (const category of CRAFT_CATEGORIES) {
    const row = await prisma.category.findUnique({ where: { slug: category.slug } });
    if (!row) continue;
    const count = await prisma.product.count({
      where: { categoryId: row.id, moderationStatus: 'active' },
    });
    await prisma.category.update({ where: { id: row.id }, data: { productCount: count } });
    console.log(`  ${category.slug}: ${count}`);
  }

  console.log(`\nDone. ${created} created, ${unchanged} left alone.`);
  console.log(`Craft maker logins use the demo password: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
