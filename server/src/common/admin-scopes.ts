import { AdminScope } from "@prisma/client";

/**
 * Every section of the admin panel — what "a full admin" means (M47).
 *
 * `User.adminScopes` is deliberately **empty-means-nothing**: an admin
 * whose scopes somebody forgot to set reaches nothing, rather than
 * everything. That is the safe direction, and it has a cost — every path
 * that mints a *full* admin outside the sub-admin screen has to say so.
 * There are three, and all three read this list:
 *
 * - the M47 migration's backfill of the admins that already existed,
 * - `prisma/seed.ts`, whose admin is the demo operator in
 *   `docs/TESTING.md`,
 * - `test/e2e/harness.ts`, whose `createActor(h, 'admin')` stands for an
 *   ordinary operator in every admin spec.
 *
 * The seed was the one that bit: promoting a row to `role: 'admin'` and
 * stopping there produces an account that signs in, renders an empty
 * panel, and 403s on everything — which looks like a broken deploy rather
 * than a missing field.
 *
 * Derived from the Prisma enum rather than typed out, so a new section is
 * covered the day it is added. `admin-scopes.spec.ts` pins that.
 */
export const ALL_ADMIN_SCOPES: AdminScope[] = Object.values(AdminScope);
