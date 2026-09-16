/**
 * R1 leftover, seeded R2 — the launch set of dispatch zones (D5's
 * circles). Coordinates are `TRICITY_AREAS` centroids from
 * `src/common/geo.ts` — the same hand-checked table a kitchen's and a
 * buyer's coordinates already resolve through — never re-typed by hand,
 * so a zone centre and the area it is named after can't drift apart.
 *
 * **Additive and idempotent, by name** (`DeliveryZone.name` is unique).
 * Re-running this only creates zones that do not exist yet; it never
 * edits a radius or a centre an admin has since changed on
 * `/admin/riders/zones` — that screen is the one place a live zone is
 * meant to be tuned.
 *
 *   npx ts-node prisma/seed-rider-zones.ts
 */
import { PrismaClient } from '@prisma/client';
import { areaById } from '../src/common/geo';

const prisma = new PrismaClient();

/** name -> the `TRICITY_AREAS` id its centre comes from. Radius is the D5 default (6 km) for every launch zone. */
const ZONES: { name: string; city: string; areaId: string }[] = [
  { name: 'Chandigarh Central', city: 'Chandigarh', areaId: 'chd-sector-17' },
  { name: 'Chandigarh South', city: 'Chandigarh', areaId: 'chd-sector-43' },
  { name: 'Manimajra', city: 'Chandigarh', areaId: 'chd-manimajra' },
  { name: 'Mohali (Phase 7)', city: 'Mohali', areaId: 'moh-phase-7' },
  { name: 'Kharar', city: 'Mohali', areaId: 'moh-kharar' },
  { name: 'Panchkula (Sector 9)', city: 'Panchkula', areaId: 'pkl-sector-9' },
  { name: 'Zirakpur (VIP Road)', city: 'Zirakpur', areaId: 'zkp-vip-road' },
];

const RADIUS_KM = 6;

async function main() {
  for (const zone of ZONES) {
    const existing = await prisma.deliveryZone.findUnique({ where: { name: zone.name } });
    if (existing) {
      console.log(`= ${zone.name} already exists — left untouched`);
      continue;
    }

    const area = areaById(zone.areaId);
    if (!area) {
      // A programmer error (a typo'd `areaId`), not a data problem — fail
      // loudly rather than silently skipping a launch zone.
      throw new Error(`TRICITY_AREAS has no area "${zone.areaId}" for zone "${zone.name}"`);
    }

    await prisma.deliveryZone.create({
      data: {
        name: zone.name,
        city: zone.city,
        centerLat: area.lat,
        centerLng: area.lng,
        radiusKm: RADIUS_KM,
      },
    });
    console.log(`+ ${zone.name} (${area.lat}, ${area.lng}) r=${RADIUS_KM}km`);
  }

  const total = await prisma.deliveryZone.count();
  console.log(`\n${total} delivery zones total.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
