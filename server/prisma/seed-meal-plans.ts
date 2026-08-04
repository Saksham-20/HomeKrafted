/**
 * Adds demo meal plans to whatever kitchens already exist.
 *
 * **Separate from `seed.ts` on purpose, and safe to run against
 * production.** `seed.ts` clears every table it owns before re-inserting,
 * which is right for a dev reset and catastrophic anywhere real. This one
 * only ever upserts by slug and never deletes, so a second run is a no-op
 * and no existing row is touched.
 *
 *   npx ts-node prisma/seed-meal-plans.ts
 *
 * It attaches plans to approved HomeKrafters that are already there rather
 * than creating kitchens of its own — a demo kitchen invented here would
 * have no storefront, no products and no reviews, and would look broken the
 * moment anybody clicked it.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** One plan per meal, so the `?mealType=` filter has something to filter. */
const PLANS = [
  {
    slugSuffix: 'ghar-ka-khana-lunch',
    name: 'Ghar Ka Khana — Lunch',
    description:
      'A proper home lunch, cooked the same morning. The kind of food you would make for yourself if you had the time.',
    mealType: 'lunch' as const,
    diet: 'veg' as const,
    pricePerMeal: 120,
    servingSize: '2 rotis, dal, sabzi, rice and salad',
    weeklyMenu: [
      'Monday — Rajma chawal, roti, salad',
      'Tuesday — Chole, jeera rice, roti',
      'Wednesday — Kadhi pakora, rice, roti',
      'Thursday — Aloo gobi, dal, roti',
      'Friday — Paneer bhurji, dal, roti',
      'Saturday — Chef special',
    ],
    imagePlaceholder: 'lunch_thali.jpg — home lunch thali',
    maxSubscribers: 20,
  },
  {
    slugSuffix: 'ghar-ka-khana-dinner',
    name: 'Ghar Ka Khana — Dinner',
    description:
      'A lighter evening meal delivered hot, for the nights when cooking after work is not happening.',
    mealType: 'dinner' as const,
    diet: 'veg' as const,
    pricePerMeal: 130,
    servingSize: '3 rotis, dal or sabzi, rice and salad',
    weeklyMenu: [
      'Monday — Mixed veg, dal, roti',
      'Tuesday — Bhindi masala, dal, roti',
      'Wednesday — Matar paneer, roti',
      'Thursday — Lauki chana dal, roti',
      'Friday — Sarson da saag, makki roti',
      'Saturday — Chef special',
    ],
    imagePlaceholder: 'dinner_thali.jpg — home dinner thali',
    maxSubscribers: 15,
  },
  {
    slugSuffix: 'morning-tiffin',
    name: 'Morning Tiffin',
    description:
      'Breakfast that is not a packet. Poha, upma, paratha or idli, rotating through the week.',
    mealType: 'breakfast' as const,
    diet: 'veg' as const,
    pricePerMeal: 80,
    servingSize: 'One hot breakfast plus chutney or curd',
    weeklyMenu: [
      'Monday — Poha with peanuts',
      'Tuesday — Aloo paratha with curd',
      'Wednesday — Upma with coconut chutney',
      'Thursday — Idli sambar',
      'Friday — Besan chilla',
      'Saturday — Chef special',
    ],
    imagePlaceholder: 'breakfast_tiffin.jpg — morning tiffin',
    maxSubscribers: 25,
  },
];

async function main(): Promise<void> {
  const sellers = await prisma.seller.findMany({
    where: { status: 'approved' },
    include: { vendor: true },
    orderBy: { createdAt: 'asc' },
  });

  if (sellers.length === 0) {
    console.log('No approved HomeKrafters found — nothing to attach meal plans to.');
    return;
  }

  console.log(`Found ${sellers.length} approved HomeKrafter(s).`);

  let created = 0;
  let unchanged = 0;

  for (const [index, plan] of PLANS.entries()) {
    // Spread the plans across whatever kitchens exist, so the list is not
    // three plans from one vendor.
    const seller = sellers[index % sellers.length];
    const slug = `${seller.vendor.slug}-${plan.slugSuffix}`;

    const existing = await prisma.mealPlan.findUnique({ where: { slug } });
    if (existing) {
      unchanged += 1;
      console.log(`  = ${slug} (already there, left alone)`);
      continue;
    }

    await prisma.mealPlan.create({
      data: {
        slug,
        vendorId: seller.vendorId,
        sellerId: seller.id,
        name: plan.name,
        description: plan.description,
        mealType: plan.mealType,
        diet: plan.diet,
        pricePerMeal: plan.pricePerMeal,
        servingSize: plan.servingSize,
        weeklyMenu: plan.weeklyMenu,
        imagePlaceholder: plan.imagePlaceholder,
        maxSubscribers: plan.maxSubscribers,
      },
    });
    created += 1;
    console.log(`  + ${slug} → ${seller.vendor.name} (₹${plan.pricePerMeal}/meal)`);
  }

  // Delivery brackets are derived from the kitchen's stated hours, and a
  // kitchen that has stated none falls back to the default meal window. That
  // is correct behaviour, not a gap — but a demo where every kitchen shows
  // the identical window is a worse demo, so give the first one real hours
  // if it has no profile yet.
  const first = sellers[0];
  const profile = await prisma.vendorProfile.findUnique({ where: { vendorId: first.vendorId } });
  if (!profile) {
    await prisma.vendorProfile.create({
      data: {
        vendorId: first.vendorId,
        workingDays: [1, 2, 3, 4, 5, 6],
        opensAt: '08:00',
        closesAt: '21:00',
        prepTimeMins: 120,
        knownFor: [],
        languages: [],
      },
    });
    console.log(`  + profile hours for ${first.vendor.name} (08:00–21:00, closed Sunday)`);
  }

  console.log(`\nDone. ${created} created, ${unchanged} left alone.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
