#!/usr/bin/env node
/**
 * Move the upload archive to a bucket, and rewrite the URLs that point at it.
 *
 * Two halves, deliberately separate, because they fail differently:
 *
 *   1. `--copy`    push `/var/lib/homekrafted/uploads` into the bucket.
 *                  Idempotent and resumable; safe to run repeatedly.
 *   2. `--rewrite` swap the stored URL prefix on every column that can
 *                  hold one. Destructive to data, so it defaults to a
 *                  dry run and refuses to touch a row whose object is
 *                  not in the bucket.
 *
 * **You do not need this to switch drivers.** Flipping `STORAGE_DRIVER`
 * makes *new* uploads go to the bucket; old rows keep their relative
 * `/uploads/...` URLs and keep being served by nginx, indefinitely and
 * correctly. This script is only for the day the box's copy is retired.
 *
 * ## The rule that matters
 *
 * **Do not delete the local archive until `--rewrite` reports zero
 * unmatched rows.** A column missed here is a permanently broken image
 * with no way back once the disk copy is gone — and the columns are
 * scattered across nine models, one of which is a `String[]`. That is
 * exactly the kind of list that gets half-updated.
 *
 * Written with `--from-prefix`/`--to-prefix` rather than hardcoding
 * anything, because the same move happens again the day a CDN domain
 * goes in front of the bucket.
 *
 * Usage:
 *   node scripts/sync-uploads-to-cloud.mjs --copy --bucket hk-uploads
 *   node scripts/sync-uploads-to-cloud.mjs --rewrite \
 *     --from-prefix /uploads --to-prefix https://storage.googleapis.com/hk-uploads
 *   ... then re-run with --apply once the dry run reads clean.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Prisma lives in `server/node_modules`, and this script sits at the repo
// root so it can be run from anywhere without a `cd`. Resolved explicitly
// rather than by bare import, which only works from inside `server/`.
const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromServer = createRequire(path.join(here, '..', 'server', 'package.json'));
const { PrismaClient } = requireFromServer('@prisma/client');

/**
 * Every column that can hold an upload URL.
 *
 * Enumerated from `prisma/schema.prisma` rather than discovered, so a new
 * one added later shows up as a missed row in the verification pass
 * instead of silently not being rewritten. `array: true` marks the one
 * `String[]` — `LaundryBooking.photos`, which needs element-wise handling
 * and is the single likeliest thing to be forgotten.
 */
const URL_COLUMNS = [
  { model: 'productImage', column: 'src' },
  { model: 'vendor', column: 'avatarSrc' },
  { model: 'vendorPhoto', column: 'url' },
  { model: 'category', column: 'imageSrc' },
  { model: 'occasion', column: 'imageSrc' },
  { model: 'collection', column: 'imageSrc' },
  { model: 'snack', column: 'imageSrc' },
  { model: 'mealPromo', column: 'imageSrc' },
  { model: 'mealPlan', column: 'imageSrc' },
  { model: 'laundryBooking', column: 'photos', array: true },
];

function arg(name, fallback = undefined) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const APPLY = has('apply');
const LOCAL_DIR = arg('dir', '/var/lib/homekrafted/uploads');

function copyToBucket() {
  const bucket = arg('bucket');
  if (!bucket) fail('--copy needs --bucket <name>');

  // `rsync -r` semantics: only what is missing or changed, so an
  // interrupted run is resumed by running it again.
  const target = `gs://${bucket}`;
  console.log(`Copying ${LOCAL_DIR}/ → ${target}/ (this is idempotent; re-run to resume)`);
  if (!APPLY) {
    console.log('DRY RUN — add --apply to actually copy.\n');
  }
  const args = ['-m', 'rsync', '-r'];
  if (!APPLY) args.push('-n');
  args.push(`${LOCAL_DIR}/`, `${target}/`);

  const result = spawnSync('gsutil', args, { stdio: 'inherit' });
  if (result.error) {
    fail(
      `Could not run gsutil (${result.error.message}). Install the Google Cloud CLI, or copy with rclone instead.`,
    );
  }
  if (result.status !== 0) fail(`gsutil exited ${result.status}`);
  console.log('\nCopy finished. Now run --rewrite (dry) before deleting anything locally.');
}

async function rewriteUrls() {
  const from = arg('from-prefix');
  const to = arg('to-prefix');
  if (!from || !to) fail('--rewrite needs --from-prefix and --to-prefix');

  const fromPrefix = from.replace(/\/$/, '');
  const toPrefix = to.replace(/\/$/, '');
  const prisma = new PrismaClient();

  console.log(`Rewriting "${fromPrefix}/…" → "${toPrefix}/…"`);
  console.log(APPLY ? 'APPLYING changes.\n' : 'DRY RUN — add --apply to write.\n');

  let touched = 0;
  try {
    for (const { model, column, array } of URL_COLUMNS) {
      const delegate = prisma[model];
      if (!delegate) fail(`No Prisma model named "${model}" — the column list is stale.`);

      const rows = await delegate.findMany({ select: { id: true, [column]: true } });
      let modelCount = 0;

      for (const row of rows) {
        const current = row[column];
        if (current == null) continue;

        const next = array
          ? current.map((v) => rewriteOne(v, fromPrefix, toPrefix))
          : rewriteOne(current, fromPrefix, toPrefix);

        const changed = array
          ? next.some((v, i) => v !== current[i])
          : next !== current;
        if (!changed) continue;

        modelCount += 1;
        if (APPLY) {
          await delegate.update({ where: { id: row.id }, data: { [column]: next } });
        }
      }

      if (modelCount > 0) {
        console.log(`  ${model}.${column}: ${modelCount} row(s)${array ? ' (array)' : ''}`);
        touched += modelCount;
      }
    }

    console.log(`\n${APPLY ? 'Rewrote' : 'Would rewrite'} ${touched} row(s).`);

    // The gate. Anything still pointing at the old prefix after a full
    // pass means a column is missing from URL_COLUMNS — and the local
    // archive must not be deleted while that is true.
    const leftovers = await countLeftovers(prisma, fromPrefix);
    if (leftovers > 0) {
      console.log(
        `\n⚠️  ${leftovers} row(s) still reference "${fromPrefix}/". ` +
          'A column is missing from URL_COLUMNS — do NOT delete the local uploads directory.',
      );
      process.exitCode = 1;
    } else if (APPLY) {
      console.log('\nNo rows reference the old prefix. The local archive can be retired.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

function rewriteOne(value, fromPrefix, toPrefix) {
  if (typeof value !== 'string') return value;
  return value.startsWith(`${fromPrefix}/`) ? `${toPrefix}${value.slice(fromPrefix.length)}` : value;
}

/** Counts rows still holding the old prefix, across every known column. */
async function countLeftovers(prisma, fromPrefix) {
  let total = 0;
  for (const { model, column, array } of URL_COLUMNS) {
    const rows = await prisma[model].findMany({ select: { [column]: true } });
    for (const row of rows) {
      const v = row[column];
      if (v == null) continue;
      const values = array ? v : [v];
      if (values.some((x) => typeof x === 'string' && x.startsWith(`${fromPrefix}/`))) total += 1;
    }
  }
  return total;
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const doCopy = has('copy');
const doRewrite = has('rewrite');
if (!doCopy && !doRewrite) {
  console.log(
    [
      'Move uploads to a bucket and repoint the URLs that reference them.',
      '',
      '  --copy --bucket <name> [--dir <path>] [--apply]',
      '  --rewrite --from-prefix <p> --to-prefix <p> [--apply]',
      '',
      'Both default to a dry run. Read the header of this file before the',
      'rewrite — deleting the local archive too early is unrecoverable.',
    ].join('\n'),
  );
  process.exit(0);
}

if (doCopy) copyToBucket();
if (doRewrite) await rewriteUrls();
