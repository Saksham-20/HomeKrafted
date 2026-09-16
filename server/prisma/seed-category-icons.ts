import { PrismaClient } from '@prisma/client';

/**
 * Give every shelf a mark (G3 §6).
 *
 * `Category.icon` is a stored id an admin picks, which is the whole point:
 * a slug→icon map in code covers only the shelves that existed the day
 * somebody wrote it, and every shelf minted afterwards falls back for ever.
 * But the column arrived empty, and with the emoji map deleted a browse
 * page with no icons set draws the same wrapped gift on every chip — which
 * is that failure wearing a different hat.
 *
 * So this is a **starting point, not a rule**: exactly the
 * `seed-avatars.ts` contract.
 *
 *  - **Additive and idempotent.** It only ever fills a shelf whose `icon`
 *    is NULL, so running it twice changes nothing the second time.
 *  - **It never overwrites a choice.** The moment an admin picks a mark on
 *    `/admin/catalog/categories`, this file stops having an opinion about
 *    that shelf.
 *  - **Allowlisted by slug.** A shelf that is not named here keeps its NULL
 *    and draws the fallback, which is honest: nobody has decided yet.
 *  - **Every id must exist in `client/lib/icons/registry.ts`**, or the
 *    page draws the fallback anyway. `icon-registry.spec.ts` guards the
 *    registry against the generated file; this list is checked by
 *    `category-icons.spec.ts`.
 *
 *   npx ts-node prisma/seed-category-icons.ts
 */
const prisma = new PrismaClient();

/** Slug → registry id. Marks describe the *drawing*, not the shelf's copy. */
export const CATEGORY_ICONS: Record<string, string> = {
  // --- Food -------------------------------------------------------------
  bakery: 'lucide:croissant',
  chocolates: 'craft:chocolates',
  chutneys: 'lucide-lab:jar',
  cookies: 'lucide:cookie',
  hampers: 'craft:gift',
  pickles: 'lucide-lab:jar',
  snacks: 'lucide:popcorn',
  sweets: 'lucide:candy',
  cakes: 'lucide:cake',
  breads: 'lucide:wheat',
  beverages: 'lucide:coffee',
  'meal-plans': 'lucide:utensils',

  // --- Gifts: departments ----------------------------------------------
  'handmade-jewellery': 'craft:jewellery',
  'jewellery-and-accessories': 'craft:jewellery',
  'candles-home': 'craft:candles',
  'candles-and-lighting': 'craft:candles',
  'art-prints': 'craft:art-prints',
  'wall-art': 'craft:art-prints',
  'home-d-cor': 'craft:home-decor',
  'home-decor': 'craft:home-decor',
  'home-decor-2': 'craft:home-decor',
  'bath-and-self-care': 'craft:self-care',
  'self-care': 'craft:self-care',
  'kids-and-soft-toys': 'craft:kids',
  'flowers-and-plants': 'craft:flowers',
  'hampers-and-gift-sets': 'craft:gift',
  'chocolates-and-edible-gifts': 'craft:chocolates',
  'kitchen-and-dining': 'craft:kitchen',
  'personalised-gifts': 'craft:personalised',

  // --- Gifts: subcategories --------------------------------------------
  'bangles-and-kadas': 'lucide:circle-dot',
  earrings: 'hugeicons:ear-rings-01',
  'necklaces-and-sets': 'hugeicons:necklace',
  'bracelets-and-anklets': 'lucide:link',
  rings: 'lucide-lab:gem-ring',
  'hair-accessories': 'lucide:scissors',
  'potlis-and-pouches': 'lucide:shopping-bag',

  'scented-jar-candles': 'lucide-lab:jar',
  'shaped-and-festive-candles': 'craft:candles',
  'diyas-and-tealights': 'lucide-lab:candle-holder',
  'holders-and-lanterns': 'lucide:lamp',

  'original-paintings': 'lucide:palette',
  miniatures: 'lucide:frame',
  'prints-and-posters': 'lucide:printer',
  'custom-portraits': 'lucide:user-round',

  'resin-art': 'lucide:droplets',
  'showpieces-and-figurines': 'lucide:box',
  'vases-and-planters': 'lucide:flower-2',
  'torans-and-wall-hangings': 'lucide:wind',
  'pooja-and-festive-d-cor': 'lucide:flame',

  'face-care': 'lucide:sparkles',
  'hair-care': 'lucide:wind',
  'soaps-and-bath': 'lucide-lab:soap-bar',
  'balms-and-oils': 'lucide:droplet',

  'amigurumi-and-soft-toys': 'lucide-lab:yarn-ball',
  'baby-keepsakes': 'lucide:baby',
  'kids-room-d-cor': 'lucide:bed',

  'crochet-and-forever-flowers': 'lucide-lab:flower-rose-single',
  'dried-and-preserved': 'lucide:leaf',
  plants: 'hugeicons:plant-02',

  'festive-hampers': 'lucide:gift',
  'self-care-sets': 'lucide-lab:soap-bar',
  'mixed-hampers': 'lucide:package',

  'chocolates-2': 'hugeicons:chocolate',
  'cookies-and-tins': 'lucide:cookie',
  mithai: 'lucide:candy',
  'jars-and-preserves': 'lucide-lab:jar',

  mugs: 'lucide:coffee',
  serveware: 'lucide:soup',
  'trays-and-coasters': 'lucide:square',
};

async function main() {
  const blank = await prisma.category.findMany({
    where: { icon: null },
    select: { id: true, slug: true, name: true },
  });

  let set = 0;
  for (const shelf of blank) {
    const icon = CATEGORY_ICONS[shelf.slug];
    if (!icon) continue;
    await prisma.category.update({ where: { id: shelf.id }, data: { icon } });
    set += 1;
  }

  const stillBlank = blank.filter((shelf) => !CATEGORY_ICONS[shelf.slug]);
  console.log(`Set ${set} icon${set === 1 ? '' : 's'}.`);
  if (stillBlank.length > 0) {
    // Named rather than counted: these are the shelves an admin has to
    // decide on, and a number nobody can act on is not a report.
    console.log(
      `No mark yet (they draw the wrapped gift): ${stillBlank.map((s) => s.slug).join(', ')}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
