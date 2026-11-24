import { snowflakes } from "./snow";

describe("snowflakes", () => {
  it("draws the same flakes for the same seed — server and browser must agree", () => {
    expect(snowflakes(12, 7)).toEqual(snowflakes(12, 7));
    expect(snowflakes(12, 7)).not.toEqual(snowflakes(12, 8));
  });

  it("keeps every flake small, slow and already falling", () => {
    for (const flake of snowflakes(200, 2026)) {
      expect(flake.x).toBeGreaterThanOrEqual(0);
      expect(flake.x).toBeLessThanOrEqual(100);
      expect(flake.size).toBeGreaterThanOrEqual(1.6);
      expect(flake.size).toBeLessThanOrEqual(3.6);
      expect(flake.fall).toBeGreaterThanOrEqual(16);
      expect(flake.delay).toBeLessThanOrEqual(0);
      expect(-flake.delay).toBeLessThanOrEqual(flake.fall);
    }
  });
});
