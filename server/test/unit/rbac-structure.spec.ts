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
 *
 * **The folder scan is only half the surface.** Three admin-privileged
 * routes do not live under `src/admin` at all, because they hang off a
 * controller most of whose routes belong to the signed-in customer:
 * `POST /orders/:id/refund`, `POST /wallet/adjust` and `GET /users/:id`.
 * Those carry a *method-level* `@Roles('admin')`, which neither this
 * spec's class-level scan nor `RolesGuard`'s fail-closed rule sees —
 * that rule keys on the `/api/v1/admin` path prefix, and these are
 * `/orders`, `/wallet` and `/users`. So the exact failure the guard was
 * written to stop (a new privileged route ships without its decorator and
 * every signed-in shopper can call it) was still open in the three files
 * the guard's own doc comment names, and two of them move money.
 *
 * `ADMIN_ROUTES_OUTSIDE_ADMIN` closes that. It is a registry rather than
 * a scan for the reason `RolesGuard` refuses to infer a role from a path:
 * nothing in a mixed controller distinguishes "admin route missing its
 * decorator" from "customer route that correctly has none", so the
 * intent has to be written down. Renaming or deleting a listed handler
 * fails the build here, which is the point — the registry cannot rot
 * quietly.
 */

const SRC_ROOT = join(__dirname, '..', '..', 'src');

/** Files under src/admin that are deliberately public — nothing else may join this list casually. */
const ADMIN_PUBLIC_ALLOWLIST = ['public-pincodes.controller.ts', 'public-settings.controller.ts'];

/**
 * Admin-only routes that live outside `src/admin`, by file and handler.
 *
 * Adding a route here is a claim that it must never be reachable by a
 * `consumer` or `seller` token. Removing one is a claim that it may.
 */
const ADMIN_ROUTES_OUTSIDE_ADMIN: { file: string; handler: string; route: string }[] = [
  { file: 'orders/orders.controller.ts', handler: 'refund', route: 'POST /orders/:id/refund' },
  { file: 'wallet/wallet.controller.ts', handler: 'adjust', route: 'POST /wallet/adjust' },
  { file: 'users/users.controller.ts', handler: 'getUserById', route: 'GET /users/:id' },
];

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
 * Decorators only — comments stripped.
 *
 * **Why this is not cosmetic.** Every scan below looks for the literal
 * `@Roles('admin')`, and this codebase's doc comments quote decorators
 * constantly (`users.controller.ts` opens by describing "the trailing
 * `@Roles('admin') GET :id`"). Without this, a controller whose only
 * mention of the decorator is *prose about* the decorator reads as
 * gated — the scan fails open, in the one direction a security guard
 * must never fail. Found by the mixed-controller assertion below, which
 * expected three ungated classes and got three "gated" ones, all three
 * gated only in English.
 *
 * Crude on purpose: a `//` or block comment inside a string literal
 * would be mangled, and no controller here has one. It is a decorator
 * scan, not a parser.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Class-level means the decorator sits between `@Controller(...)` and the
 * `export class` line — a method-level `@Roles` on one route would leave
 * every other route in the file open, which is not the guarantee.
 */
function hasClassLevelScope(source: string): boolean {
  const code = stripComments(source);
  const classIndex = code.search(/export class \w+Controller/);
  if (classIndex === -1) return false;
  return /@RequireAdminScope\('\w+'\)/.test(code.slice(0, classIndex));
}

function hasClassLevelRoles(source: string, role: 'admin' | 'seller'): boolean {
  const code = stripComments(source);
  const classIndex = code.search(/export class \w+Controller/);
  if (classIndex === -1) return false;
  const header = code.slice(0, classIndex);
  return new RegExp(`@Roles\\('${role}'\\)`).test(header);
}

/**
 * The decorator block immediately above a method declaration.
 *
 * Walks back from the handler over contiguous decorator/blank lines and
 * stops at the previous method's closing brace, so a `@Roles('admin')`
 * belonging to a *different* handler higher in the file cannot be read as
 * covering this one — which is the whole failure mode being guarded.
 */
function decoratorsAbove(source: string, handler: string): string | null {
  const lines = stripComments(source).split('\n');
  const index = lines.findIndex((line) => new RegExp(`^\\s{2}${handler}\\s*\\(`).test(line));
  if (index === -1) return null;

  const block: string[] = [];
  for (let i = index - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (!line.startsWith('@')) break;
    block.push(line);
  }
  return block.join('\n');
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

  /**
   * M47 — sub-admins. A missing `@RequireAdminScope` is refused at
   * runtime by `AdminScopeGuard`'s fail-closed path rule, which is the
   * real protection; this makes it fail at build time instead, where it
   * is a one-line fix rather than a 403 somebody hits in production.
   */
  it('every src/admin controller declares @RequireAdminScope on the class', () => {
    const offenders = adminControllers
      .filter((path) => !ADMIN_PUBLIC_ALLOWLIST.includes(fileName(path)))
      .filter((path) => !hasClassLevelScope(readFileSync(path, 'utf8')))
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

describe('rbac structure — admin routes that live outside src/admin', () => {
  /**
   * M47. `AdminScopeGuard` covers these through the *role* rule rather
   * than the path rule (they are not under `/api/v1/admin`), so a missing
   * scope decorator here is refused at runtime too — but two of the three
   * move money, and "refused at runtime" means an operator discovers it.
   */
  it.each(ADMIN_ROUTES_OUTSIDE_ADMIN)(
    '$route also declares an admin scope',
    ({ file, handler }) => {
      const block = decoratorsAbove(readFileSync(join(SRC_ROOT, file), 'utf8'), handler);
      expect(block).not.toBeNull();
      expect(block).toMatch(/@RequireAdminScope\('\w+'\)/);
    },
  );

  it.each(ADMIN_ROUTES_OUTSIDE_ADMIN)(
    "$route carries a method-level @Roles('admin')",
    ({ file, handler }) => {
      const source = readFileSync(join(SRC_ROOT, file), 'utf8');
      const decorators = decoratorsAbove(source, handler);

      // A null here means the handler is gone or renamed. That is a
      // registry update somebody has to make deliberately, not a pass.
      expect(decorators).not.toBeNull();
      expect(decorators).toMatch(/@Roles\('admin'\)/);
    },
  );

  it('the controllers holding them are NOT class-gated — otherwise this spec proves nothing', () => {
    // If one of these ever grew a class-level @Roles('admin'), its
    // customer routes would 403 for the customers they belong to. The
    // method-level decorator is load-bearing precisely because the class
    // must stay open.
    for (const { file } of ADMIN_ROUTES_OUTSIDE_ADMIN) {
      const source = readFileSync(join(SRC_ROOT, file), 'utf8');
      expect(hasClassLevelRoles(source, 'admin')).toBe(false);
    }
  });
});
