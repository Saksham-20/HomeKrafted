import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every admin and seller controller carries its role gate, structurally.
 *
 * **Why this exists:** `RolesGuard` fails *open* — a controller with no
 * `@Roles` metadata is allowed for any authenticated role
 * (`common/guards/roles.guard.ts`). Every controller under `src/admin`
 * and `src/seller` is gated today, but nothing except review stops the
 * next file from shipping without the decorator, at which point every
 * signed-in shopper can call it. That is a silent failure in exactly the
 * shape `vendor-privacy.spec.ts` exists for, so it gets the same
 * treatment: the build fails, naming the file.
 *
 * The two allowlisted files are deliberately public *by design* and
 * documented as such in their own doc comments — they live under
 * `src/admin` for cohesion (they read admin-owned tables), not because
 * they are admin surfaces.
 */

const SRC_ROOT = join(__dirname, '..', '..', 'src');

/** Files under src/admin that are deliberately public — nothing else may join this list casually. */
const ADMIN_PUBLIC_ALLOWLIST = ['public-pincodes.controller.ts', 'public-settings.controller.ts'];

function controllerFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...controllerFiles(full));
    else if (entry.endsWith('.controller.ts')) found.push(full);
  }
  return found;
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Class-level means the decorator sits between `@Controller(...)` and the
 * `export class` line — a method-level `@Roles` on one route would leave
 * every other route in the file open, which is not the guarantee.
 */
function hasClassLevelRoles(source: string, role: 'admin' | 'seller'): boolean {
  const classIndex = source.search(/export class \w+Controller/);
  if (classIndex === -1) return false;
  const header = source.slice(0, classIndex);
  return new RegExp(`@Roles\\('${role}'\\)`).test(header);
}

describe('rbac structure — every portal controller is role-gated at the class', () => {
  const adminControllers = controllerFiles(join(SRC_ROOT, 'admin'));
  const sellerControllers = controllerFiles(join(SRC_ROOT, 'seller'));

  it('scans a real controller population (the layout has not moved under this spec)', () => {
    expect(adminControllers.length).toBeGreaterThan(8);
    expect(sellerControllers.length).toBeGreaterThan(8);
  });

  it("every src/admin controller declares @Roles('admin') on the class", () => {
    const offenders = adminControllers
      .filter((path) => !ADMIN_PUBLIC_ALLOWLIST.includes(fileName(path)))
      .filter((path) => !hasClassLevelRoles(readFileSync(path, 'utf8'), 'admin'))
      .map(fileName);
    expect(offenders).toEqual([]);
  });

  it("every src/seller controller declares @Roles('seller') on the class", () => {
    const offenders = sellerControllers
      .filter((path) => !hasClassLevelRoles(readFileSync(path, 'utf8'), 'seller'))
      .map(fileName);
    expect(offenders).toEqual([]);
  });

  it('the admin public allowlist names real files — a rename must be reconciled here', () => {
    const names = adminControllers.map(fileName);
    for (const allowed of ADMIN_PUBLIC_ALLOWLIST) {
      expect(names).toContain(allowed);
    }
  });

  it('the allowlisted public controllers are actually @Public, not merely ungated', () => {
    for (const allowed of ADMIN_PUBLIC_ALLOWLIST) {
      const path = adminControllers.find((p) => fileName(p) === allowed);
      expect(path).toBeDefined();
      expect(readFileSync(path!, 'utf8')).toMatch(/@Public\(\)/);
    }
  });
});
