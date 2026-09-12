import { ownAvatarSrc, evaluateSellerProfileCompleteness } from "./maker-portrait";
import { CHEF_CHARACTERS, isChefCharacter } from "./avatars/chef-characters";

/**
 * What is worth pinning here is the guard, not the drawing.
 *
 * The deterministic tone/caricature helpers this file used to cover are
 * gone with the assigned portrait (owner, 2026-08-29) — a HomeKrafter
 * chooses a character now. `ownAvatarSrc` stayed, and it is the only
 * thing keeping the pre-M28 shared stock photograph off four surfaces
 * that would render it as a named kitchen's own face.
 */
describe("ownAvatarSrc", () => {
  it("drops the shared stock avatar the pre-M28 rows still hold", () => {
    expect(ownAvatarSrc("/images/vendors/avatar.jpg")).toBeUndefined();
  });

  it("keeps an upload", () => {
    expect(ownAvatarSrc("/uploads/storefront/abc.webp")).toBe("/uploads/storefront/abc.webp");
  });

  it("keeps a chosen character", () => {
    for (const character of CHEF_CHARACTERS) {
      expect(ownAvatarSrc(character.src)).toBe(character.src);
    }
  });

  it("answers undefined for a vendor with no picture at all", () => {
    expect(ownAvatarSrc(undefined)).toBeUndefined();
    expect(ownAvatarSrc("")).toBeUndefined();
  });
});

describe("the character set", () => {
  /**
   * Sixteen ids, sixteen files. A duplicate id would make two cells of
   * the picker write the same value and one of them look permanently
   * unselected.
   */
  it("has unique ids and unique files", () => {
    expect(new Set(CHEF_CHARACTERS.map((c) => c.id)).size).toBe(CHEF_CHARACTERS.length);
    expect(new Set(CHEF_CHARACTERS.map((c) => c.src)).size).toBe(CHEF_CHARACTERS.length);
  });

  /**
   * The stored value is a raster path, deliberately: `next/image` refuses
   * SVG without `dangerouslyAllowSVG`, and the storefront's OpenGraph
   * card and its JSON-LD both point at this same string.
   */
  it("stores a .webp under /images/avatars/", () => {
    for (const character of CHEF_CHARACTERS) {
      expect(character.src).toMatch(/^\/images\/avatars\/[a-z-]+\.webp$/);
      expect(character.src).toContain(character.id);
    }
  });

  it("recognises its own files and nothing else", () => {
    expect(isChefCharacter(CHEF_CHARACTERS[0].src)).toBe(true);
    expect(isChefCharacter("/images/avatars/not-a-character.webp")).toBe(false);
    expect(isChefCharacter("/uploads/storefront/abc.webp")).toBe(false);
    expect(isChefCharacter(undefined)).toBe(false);
  });

  /** Every label is what a screen reader reads in the picker. */
  it("labels every character", () => {
    for (const character of CHEF_CHARACTERS) {
      expect(character.label.trim().length).toBeGreaterThan(2);
    }
  });
});

describe("evaluateSellerProfileCompleteness", () => {
  it("fails when vendor is missing or empty", () => {
    const result = evaluateSellerProfileCompleteness(undefined);
    expect(result.isComplete).toBe(false);
    expect(result.missingItems.length).toBe(4);
  });

  it("fails when bio is under 80 characters", () => {
    const result = evaluateSellerProfileCompleteness({
      bio: "Short bio",
      avatarSrc: "/images/avatars/bun.webp",
      city: "Chandigarh",
      fssaiNumber: "12345678901234",
    });
    expect(result.isComplete).toBe(false);
    expect(result.hasBio).toBe(false);
    expect(result.missingItems.some((i: string) => i.includes("at least 80 characters"))).toBe(true);
  });

  it("fails when avatar is the shared stock photo", () => {
    const result = evaluateSellerProfileCompleteness({
      bio: "A passionate home chef who has been preparing authentic traditional recipes for over twenty years with handpicked spices.",
      avatarSrc: "/images/vendors/avatar.jpg",
      city: "Chandigarh",
      fssaiNumber: "12345678901234",
    });
    expect(result.isComplete).toBe(false);
    expect(result.hasAvatar).toBe(false);
  });

  it("passes when all criteria are satisfied", () => {
    const result = evaluateSellerProfileCompleteness({
      bio: "A passionate home chef who has been preparing authentic traditional recipes for over twenty years with handpicked spices and organic ingredients.",
      avatarSrc: "/images/avatars/bun.webp",
      city: "Chandigarh",
      fssaiNumber: "12345678901234",
    });
    expect(result.isComplete).toBe(true);
    expect(result.missingItems).toEqual([]);
  });
});

