import { CARICATURE_COUNT, makerCaricature, makerTone, ownAvatarSrc } from "./maker-portrait";

/**
 * These render inside a Server Component, so what is worth pinning is not
 * which face or wash a kitchen gets — it is that the answer is a pure
 * function of the key. A random pick would draw one caricature on the
 * server and a different one in the browser: React #418, the mismatch
 * `CLAUDE.md` records from M12 and the reason `lib/occasions.ts` never
 * reads the clock.
 */
const SLUGS = ["dadis-recipe", "home-batch", "anjalis-kitchen", "crunch-corner"];

describe("makerTone", () => {
  it("returns the same tone for the same key, every call", () => {
    for (const slug of SLUGS) {
      const first = makerTone(slug);
      for (let i = 0; i < 20; i += 1) expect(makerTone(slug)).toBe(first);
    }
  });

  it("only ever returns one of the three defined washes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(makerTone(`vendor-${i}`));
    expect([...seen].sort()).toEqual(["clay", "sage", "sand"]);
  });
});

describe("makerCaricature", () => {
  it("returns the same face for the same key, every call", () => {
    for (const slug of SLUGS) {
      const first = makerCaricature(slug);
      for (let i = 0; i < 20; i += 1) expect(makerCaricature(slug)).toBe(first);
    }
  });

  it("stays inside the drawn set", () => {
    // An index past the end renders nothing at all — an empty disc, which
    // looks like a broken image rather than a missing one.
    for (let i = 0; i < 500; i += 1) {
      const index = makerCaricature(`vendor-${i}`);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(CARICATURE_COUNT);
    }
  });

  it("uses every face", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(makerCaricature(`vendor-${i}`));
    expect(seen.size).toBe(CARICATURE_COUNT);
  });

  it("does not move in lockstep with the wash", () => {
    // Unsalted, both read the same hash and the eighteen combinations
    // collapse to three — every sage kitchen would share one face.
    const pairs = new Set(
      Array.from({ length: 200 }, (_, i) => `${makerTone(`v${i}`)}:${makerCaricature(`v${i}`)}`),
    );
    expect(pairs.size).toBeGreaterThan(3);
  });
});

describe("ownAvatarSrc", () => {
  it("passes through a kitchen's own upload", () => {
    expect(ownAvatarSrc("/uploads/storefront/abc.webp")).toBe("/uploads/storefront/abc.webp");
  });

  it("rejects the shared stock avatar seeded onto every vendor before M28", () => {
    // Production rows written before that day still hold it, which is why
    // two different kitchens rendered under one photograph of the same
    // woman. Reading the column through here draws a caricature instead.
    expect(ownAvatarSrc("/images/vendors/avatar.jpg")).toBeUndefined();
  });

  it("treats an absent value as absent", () => {
    expect(ownAvatarSrc(undefined)).toBeUndefined();
    expect(ownAvatarSrc("")).toBeUndefined();
  });
});
