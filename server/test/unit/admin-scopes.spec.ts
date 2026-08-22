import { AdminScope } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ALL_ADMIN_SCOPES } from "../../src/common/admin-scopes";

const root = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

/**
 * Strip comments before scanning. This repo quotes field names in prose
 * constantly, and a scan that counts a comment as code fails *open* —
 * which is how `rbac-structure.spec.ts` once reported three ungated
 * controllers as gated.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("a full admin holds every section (M47)", () => {
  it("covers every value of the Prisma enum", () => {
    expect([...ALL_ADMIN_SCOPES].sort()).toEqual(
      [...Object.values(AdminScope)].sort(),
    );
  });

  it('is not empty — the guard reads an empty list as "nothing"', () => {
    expect(ALL_ADMIN_SCOPES.length).toBeGreaterThan(0);
  });

  /**
   * The seed's admin is the demo operator every tester signs in as. Left
   * without scopes it signs in successfully and 403s on every screen,
   * which reads as a broken deploy rather than a missing column.
   */
  it("the seeded admin is granted them", () => {
    const seed = stripComments(read("prisma/seed.ts"));
    const adminBlock = seed.slice(
      seed.indexOf("const adminUser"),
      seed.indexOf("const adminUser") + 600,
    );

    expect(adminBlock).toContain("role: 'admin'");
    expect(adminBlock).toContain("adminScopes: ALL_ADMIN_SCOPES");
  });

  /**
   * `createActor(h, 'admin')` stands for an ordinary operator in every
   * admin spec. Promoting the row without scopes turned 237 e2e tests
   * into 403s at once.
   */
  it("the e2e harness grants them when it promotes an actor to admin", () => {
    const harness = stripComments(read("test/e2e/harness.ts"));
    expect(harness).toContain("ALL_ADMIN_SCOPES");
  });
});
