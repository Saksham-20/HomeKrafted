/**
 * The one-time, operator-run data pass the markup commission model
 * (2026-09-16, `src/common/pricing/commission.ts`) promises in its
 * migration comment — reinterprets every stored catalogue price from
 * "what the buyer paid" to "what the maker keeps".
 *
 * **Why this has to exist at all.** `WeightOption.price`/`mrp` and
 * `MealPlan.pricePerMeal` were typed by makers as their **buyer-facing**
 * sticker price — that was true under the M37 deduction model, and it is
 * still true of every row nobody has re-typed since. The markup model
 * reads the same columns as the maker's **base** and adds the fee on
 * top. Ship the new read path against untouched rows and every price on
 * the site jumps by the commission the moment `commissionEnabled` is (or
 * already is — see below) true: a buyer who saw ₹1,000 yesterday sees
 * ₹1,236 today for a listing nobody edited.
 *
 * **This is why it has to run at a chosen moment, not automatically on
 * deploy.** Production has had `commissionEnabled: true` (20%, 18% GST)
 * live since 2026-09-05, under the deduction model — buyers there are
 * *already* paying exactly the stored sticker price. Deploying the new
 * read path with no data pass would silently mark every one of those
 * prices up by ~23.6% on the next request, with no line in this diff
 * touching a single row. Running this script first, with the *current*
 * rate, divides that same factor back out so a buyer sees the identical
 * number immediately after cutover — only the meaning of the stored
 * figure changes, not what anyone is charged.
 *
 * **Reversible in the sense that it is deterministic, not in the sense
 * that it is free to run twice.** `baseFromBuyerPrice` divides by
 * `markUpFactor(rate)`; running the pass a second time at the same rate
 * would divide a base that has already been divided, halving every
 * maker's take-home a second time. There is no way to detect that from
 * the prices alone (a base and a buyer price are both just numbers), so
 * this writes a `PlatformSetting` marker (`markupPricesMigratedAt`) the
 * first time it actually applies, and `--apply` refuses to run again
 * without `--force`.
 *
 * **Read the rate once, apply it to everything, in one transaction.** A
 * rate change mid-run would divide half the catalogue by one factor and
 * half by another — the exact drift `resolveCartLines` reading `now`
 * once already guards against, one level up.
 *
 *   npx ts-node prisma/migrate-to-markup-prices.ts              # dry run — report only, writes nothing
 *   npx ts-node prisma/migrate-to-markup-prices.ts --apply      # writes, refuses if already run
 *   npx ts-node prisma/migrate-to-markup-prices.ts --apply --force   # writes anyway (you know what you're doing)
 */
import { PrismaClient } from '@prisma/client';
import { baseFromBuyerPrice, markUpFactor, type CommissionRate } from '../src/common/pricing/commission';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const MARKER_KEY = 'markupPricesMigratedAt';

const round2 = (value: number): number => Math.round(value * 100) / 100;

async function readCommissionRate(): Promise<CommissionRate> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: ['commissionPct', 'commissionGstPct', 'commissionEnabled'] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    pct: Number(byKey.get('commissionPct') ?? 10),
    gstPct: Number(byKey.get('commissionGstPct') ?? 18),
    enabled: byKey.get('commissionEnabled') === 'true',
  };
}

async function main() {
  const rate = await readCommissionRate();
  const factor = markUpFactor(rate);

  console.log(`Commission rate read from PlatformSettings: pct=${rate.pct} gstPct=${rate.gstPct} enabled=${rate.enabled}`);
  console.log(`Markup factor: ${factor} (every stored price is divided by this)`);

  if (factor === 1) {
    console.log(
      'Factor is 1 (commission off, or 0%) — every base would equal the current stored price. ' +
        'Nothing to do; run this again once a real rate is set, right before flipping the switch on.',
    );
    return;
  }

  if (APPLY && !FORCE) {
    const marker = await prisma.platformSetting.findUnique({ where: { key: MARKER_KEY } });
    if (marker) {
      console.error(
        `Already applied at ${marker.value} (rate then: see the audit log). Refusing to run again — ` +
          `a second pass would divide an already-divided base. Pass --force if you are certain this run ` +
          `is correct (e.g. recovering from a partial failure that never reached the marker write below).`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const [weightOptions, mealPlans] = await Promise.all([
    prisma.weightOption.findMany({ select: { id: true, sku: true, price: true, mrp: true } }),
    prisma.mealPlan.findMany({ select: { id: true, name: true, pricePerMeal: true } }),
  ]);

  console.log(`\n${weightOptions.length} weight option(s), ${mealPlans.length} meal plan(s) to reinterpret.\n`);

  let sampleCount = 0;
  const SAMPLE_LIMIT = 10;

  const weightUpdates = weightOptions.map((w) => {
    const newPrice = baseFromBuyerPrice(Number(w.price), rate);
    const newMrp = baseFromBuyerPrice(Number(w.mrp), rate);
    if (sampleCount < SAMPLE_LIMIT) {
      console.log(`  WeightOption ${w.sku}: price ₹${w.price} → ₹${newPrice}, mrp ₹${w.mrp} → ₹${newMrp}`);
      sampleCount++;
    }
    return { id: w.id, price: newPrice, mrp: newMrp };
  });

  const mealPlanUpdates = mealPlans.map((m) => {
    const newPrice = round2(Number(m.pricePerMeal) / factor);
    if (sampleCount < SAMPLE_LIMIT) {
      console.log(`  MealPlan "${m.name}": pricePerMeal ₹${m.pricePerMeal} → ₹${newPrice}`);
      sampleCount++;
    }
    return { id: m.id, pricePerMeal: newPrice };
  });

  if (weightOptions.length > SAMPLE_LIMIT || mealPlans.length > SAMPLE_LIMIT) {
    console.log(`  … (${weightOptions.length + mealPlans.length - SAMPLE_LIMIT} more, not shown)`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to write these values.');
    return;
  }

  await prisma.$transaction([
    ...weightUpdates.map((u) =>
      prisma.weightOption.update({ where: { id: u.id }, data: { price: u.price, mrp: u.mrp } }),
    ),
    ...mealPlanUpdates.map((u) => prisma.mealPlan.update({ where: { id: u.id }, data: { pricePerMeal: u.pricePerMeal } })),
    prisma.platformSetting.upsert({
      where: { key: MARKER_KEY },
      create: { key: MARKER_KEY, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    }),
  ]);

  console.log(
    `\nApplied. ${weightUpdates.length} weight option(s) and ${mealPlanUpdates.length} meal plan(s) reinterpreted as base prices.`,
  );
  console.log(
    'Every buyer-facing read now marks these back up by the same factor — a buyer sees the same number they saw before this ran.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
