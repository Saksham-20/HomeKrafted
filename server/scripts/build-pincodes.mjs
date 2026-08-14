/**
 * Regenerates `src/common/pincodes.json` from the GeoNames postal dump.
 *
 *   node scripts/build-pincodes.mjs
 *
 * Committed so the table is reproducible rather than a blob somebody
 * dropped in once. Run it when GeoNames publishes a correction; the
 * output is deterministic, so an unchanged upstream produces an
 * unchanged file and an empty diff.
 *
 * ---------------------------------------------------------------------
 * SOURCE AND LICENCE
 *
 * https://download.geonames.org/export/zip/IN.zip — **CC-BY 4.0**. Using
 * it obliges us to credit GeoNames with a link to www.geonames.org on a
 * page a visitor can reach. That credit lives in the site footer and in
 * `docs/LAUNCH-READINESS.md`; if this table is ever removed, remove the
 * credit with it, and if the table is kept, the credit is not optional.
 *
 * ---------------------------------------------------------------------
 * WHAT THIS TABLE IS FOR, AND WHAT IT IS NOT FOR
 *
 * It is the authority for **which pincodes exist** and **what district
 * and state each one is in**. Those fields are reliable.
 *
 * Its coordinates are **a seed, never an answer**. Measured over the
 * whole dump on 2026-08-14:
 *
 *   19,238 pincodes
 *    1,877  one post office            — centroid is exact
 *    6,586  several, spread <= 2 km    — centroid is usable
 *   10,775  several, spread >  2 km    — centroid is meaningless
 *   -> only 44% carry a trustworthy centroid
 *   median internal spread 12.4 km, p90 65.6 km, worst 714 km
 *
 * Two examples of what that means in practice. Pincode 134109 resolves
 * ~11 km from where Panchkula Sector 8 actually is. Pincode 160055 spans
 * Mohali *and* Rupnagar, 45 km apart, so its mean lands in a field
 * between them.
 *
 * This is why `Vendor.lat`/`lng` are confirmed by an admin at approval
 * rather than taken from here, and why `TRICITY_AREAS` in `geo.ts` is
 * kept for the serviced cities: those coordinates are hand-checked and
 * beat this dump by 1–5 km in the launch city. A future session tempted
 * to "simplify" by deleting the curated table and reading coordinates
 * straight out of this one would be trading accurate coordinates for
 * inaccurate ones across the entire live catalogue.
 *
 * `spreadKm` is emitted per pincode precisely so that decision stays
 * visible to code: a caller can ask how much to trust a centroid instead
 * of assuming.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const INPUT = process.argv[2] ?? join(HERE, 'IN.txt');
const OUTPUT = join(HERE, '..', 'src', 'common', 'pincodes.json');

const EARTH_RADIUS_KM = 6371;
const toRadians = (deg) => (deg * Math.PI) / 180;

function distanceKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat));
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** The most frequent value, ties broken alphabetically so runs are deterministic. */
function commonest(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

const rows = readFileSync(INPUT, 'utf8').trim().split('\n');
const byPin = new Map();

for (const line of rows) {
  // GeoNames postal format, tab separated:
  // 0 country 1 postalcode 2 place 3 admin1(state) 4 admin1code
  // 5 admin2(district) 6 admin2code 7 admin3 8 admin3code 9 lat 10 lng 11 accuracy
  const f = line.split('\t');
  const pin = f[1];
  const lat = Number(f[9]);
  const lng = Number(f[10]);
  if (!/^\d{6}$/.test(pin) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  if (!byPin.has(pin)) byPin.set(pin, []);
  byPin.get(pin).push({ place: f[2], state: f[3], district: f[5] || f[2], lat, lng });
}

const table = {};
for (const pin of [...byPin.keys()].sort()) {
  const offices = byPin.get(pin);

  // The widest gap between any two post offices sharing this pincode —
  // how wrong the centroid below could be. Emitted, not discarded.
  let spreadKm = 0;
  for (let i = 0; i < offices.length; i++) {
    for (let j = i + 1; j < offices.length; j++) {
      spreadKm = Math.max(spreadKm, distanceKm(offices[i], offices[j]));
    }
  }

  const lat = offices.reduce((n, o) => n + o.lat, 0) / offices.length;
  const lng = offices.reduce((n, o) => n + o.lng, 0) / offices.length;

  table[pin] = {
    // 4dp is ~11 m, far finer than anything here is accurate to, and it
    // keeps the file a third smaller than raw floats.
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    district: commonest(offices.map((o) => o.district)),
    state: commonest(offices.map((o) => o.state)),
    spreadKm: Number(spreadKm.toFixed(1)),
  };
}

const json = JSON.stringify(table);
writeFileSync(OUTPUT, json);

const trustworthy = Object.values(table).filter((p) => p.spreadKm <= 2).length;
console.log(`wrote ${OUTPUT}`);
console.log(`  pincodes           ${Object.keys(table).length}`);
console.log(`  trustworthy (<=2km) ${trustworthy} (${((100 * trustworthy) / Object.keys(table).length).toFixed(1)}%)`);
console.log(`  bytes              ${json.length}`);
console.log(`  sha256             ${createHash('sha256').update(json).digest('hex').slice(0, 16)}`);
