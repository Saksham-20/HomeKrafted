/**
 * Assigns chef-character avatars to the seeded DEMO storefronts (M56,
 * owner 2026-08-31).
 *
 * **Additive, allowlisted-by-slug, and safe to run against production** —
 * the `seed-crafts.ts` contract. Nothing here deletes, and a second run
 * is a no-op.
 *
 *   npx ts-node prisma/seed-avatars.ts
 *
 * The characters are the M38b picker cast (`client/lib/avatars/
 * chef-characters.ts`, committed webp files under `/images/avatars/`),
 * one *distinct* drawing per demo kitchen — never one file shared, which
 * is the M28 failure this platform already lived through once.
 *
 * **Demo storefronts only.** The owner's 2026-08-29 decision removed
 * avatar *assignment* for real kitchens — a face somebody chose is not a
 * face somebody was given, and a real kitchen picks its own on
 * /seller/storefront. Two guards make touching a real seller structurally
 * impossible:
 *
 *   1. `DEMO_AVATARS` is a hardcoded slug allowlist of seeded demo rows.
 *      It must never grow an entry for an onboarded seller.
 *   2. A row is updated only while `avatarSrc` is NULL or still the
 *      pre-M28 shared stock file (`/images/vendors/avatar.jpg` — clearing
 *      those rows is the "real fix" CLAUDE.md's avatar section names).
 *      Anything chosen since — a photo upload or a picker choice — is
 *      left exactly as it is.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** The one path M28 banned; still present on pre-M28 production rows. */
const SHARED_STOCK_AVATAR = '/images/vendors/avatar.jpg';

/**
 * Keep in step with `client/lib/data/vendors.ts` and the maps in
 * `seed.ts` / `seed-crafts.ts`. vd8 (`homekrafted` — the platform's own
 * storefront, not a person) and vd9 (`fresh-fold-laundry` — withdrawn
 * module) are absent on purpose.
 */
const DEMO_AVATARS: Record<string, string> = {
  'anjalis-kitchen': '/images/avatars/bun.webp',
  'meeras-homefoods': '/images/avatars/long-hair.webp',
  'home-batch': '/images/avatars/moustache.webp',
  'crunch-corner': '/images/avatars/goatee.webp',
  'cocoa-homemade': '/images/avatars/curly-hair.webp',
  'dadis-recipe': '/images/avatars/grey-bun.webp',
  'hills-leaves': '/images/avatars/turban-beard.webp',
  'meeras-snack-box': '/images/avatars/bangs-glasses.webp',
  'the-slow-studio': '/images/avatars/short-hair.webp',
  'maati-and-thread': '/images/avatars/bob.webp',
};

async function main() {
  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  for (const [slug, src] of Object.entries(DEMO_AVATARS)) {
    const vendor = await prisma.vendor.findUnique({
      where: { slug },
      select: { id: true, avatarSrc: true },
    });

    if (!vendor) {
      missing += 1;
      console.log(`  ! ${slug} (not in this database, skipped)`);
      continue;
    }

    if (vendor.avatarSrc === src) {
      unchanged += 1;
      console.log(`  = ${slug} (already set, left alone)`);
      continue;
    }

    if (vendor.avatarSrc && vendor.avatarSrc !== SHARED_STOCK_AVATAR) {
      // A photo upload or a picker choice made since the seed — theirs,
      // never overwritten.
      unchanged += 1;
      console.log(`  = ${slug} (has its own avatar, left alone)`);
      continue;
    }

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { avatarSrc: src },
    });
    updated += 1;
    console.log(`  + ${slug} → ${src}`);
  }

  console.log(
    `\nDone: ${updated} updated, ${unchanged} left alone, ${missing} not found.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
