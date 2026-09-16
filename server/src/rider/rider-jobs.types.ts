import { Prisma } from '@prisma/client';

/**
 * The one `include` shape every rider-facing job read uses. Kept in its
 * own file, **not** `rider-jobs.mapper.ts`: this constant necessarily
 * spells out `phone`/pickup-address column names to fetch them, and
 * `rider-address-privacy.spec.ts` scans the mapper file's text — putting
 * the include here means that scan sees only property *access*, gated by
 * `mapActiveJobForRider`'s own region, never a `select` literal sitting
 * in the file's public part by construction.
 */
export const JOB_WITH_RELATIONS_INCLUDE = {
  zone: true,
  address: true,
  vendor: {
    include: {
      profile: true,
      seller: { include: { user: { select: { phone: true } } } },
    },
  },
  rider: { include: { user: { select: { name: true, phone: true } } } },
} satisfies Prisma.DeliveryJobInclude;

export type JobWithRelations = Prisma.DeliveryJobGetPayload<{ include: typeof JOB_WITH_RELATIONS_INCLUDE }>;
