import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRICITY_AREAS, TRICITY_CENTRE, distanceKm } from '../../src/common/geo';

/**
 * **The one test that spans both packages.**
 *
 * `client/lib/geo.ts` and `server/src/common/geo.ts` each carry a copy of
 * the tricity area table, because `client/` and `server/` are separate npm
 * packages with no shared build. CLAUDE.md says in as many words that the
 * two must stay identical, and until now nothing checked: a kitchen's
 * coordinates are stamped from the *server's* table when an application is
 * approved, and a buyer's picked area comes from the *client's*. If one
 * copy gained a sector or nudged a centroid, a buyer and a kitchen in the
 * same sector would resolve to different points and the distance filter
 * would quietly mis-sort — with nothing failing and no error anywhere.
 *
 * The client copy is read as **text and parsed**, not imported: importing
 * across the package boundary would need a build step, path aliases and a
 * tsconfig that reaches outside `server/`, all so a test could do what a
 * regex does honestly. If this parse ever breaks, that is a signal the
 * table's shape changed — which is itself worth failing on.
 */

interface Area {
  id: string;
  label: string;
  city: string;
  lat: number;
  lng: number;
}

const CLIENT_GEO = join(__dirname, '../../../client/lib/geo.ts');

function parseClientAreas(): Area[] {
  const source = readFileSync(CLIENT_GEO, 'utf8');
  const block = source.match(/TRICITY_AREAS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error(`Could not find TRICITY_AREAS in ${CLIENT_GEO}`);

  const entry =
    /\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*city:\s*'([^']+)',\s*lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)\s*\}/g;

  const areas: Area[] = [];
  for (const m of block[1].matchAll(entry)) {
    areas.push({ id: m[1], label: m[2], city: m[3], lat: Number(m[4]), lng: Number(m[5]) });
  }
  return areas;
}

function parseClientCentre(): { lat: number; lng: number } {
  const source = readFileSync(CLIENT_GEO, 'utf8');
  const m = source.match(/TRICITY_CENTRE[^=]*=\s*\{\s*lat:\s*([-\d.]+),\s*lng:\s*([-\d.]+)\s*\}/);
  if (!m) throw new Error(`Could not find TRICITY_CENTRE in ${CLIENT_GEO}`);
  return { lat: Number(m[1]), lng: Number(m[2]) };
}

describe('client/server area-table parity', () => {
  const clientAreas = parseClientAreas();

  it('parsed a plausible table from the client, not an empty match', () => {
    expect(clientAreas.length).toBeGreaterThan(10);
  });

  it('lists exactly the same areas, in the same order', () => {
    // Order is asserted too: these render as a picker, and a silent
    // reshuffle on one side is the kind of diff nobody reads.
    expect(clientAreas.map((a) => a.id)).toEqual(TRICITY_AREAS.map((a) => a.id));
  });

  it('resolves every area to the identical point, to the last decimal', () => {
    // `toEqual`, not `toBeCloseTo`: these are literals copied between two
    // files, so any difference at all is a drift, not a rounding artefact.
    for (const server of TRICITY_AREAS) {
      const client = clientAreas.find((a) => a.id === server.id);
      expect(client).toBeDefined();
      expect({ lat: client!.lat, lng: client!.lng }).toEqual({
        lat: server.lat,
        lng: server.lng,
      });
      expect(distanceKm(client!, server)).toBe(0);
    }
  });

  it('labels and cities agree, so the same place is not named twice', () => {
    for (const server of TRICITY_AREAS) {
      const client = clientAreas.find((a) => a.id === server.id)!;
      expect(client.label).toBe(server.label);
      expect(client.city).toBe(server.city);
    }
  });

  it('shares the fallback centre', () => {
    expect(parseClientCentre()).toEqual(TRICITY_CENTRE);
  });
});
