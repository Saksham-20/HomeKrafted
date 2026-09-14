import {
  CRAFT_PALETTE,
  PRIMARY_SWATCH_COUNT,
  colourWouldOverflow,
  hasColour,
  isLightSwatch,
  parseColours,
  toggleColour,
} from "./listing-colours";
import { VARIANT_LABEL_MAX, mergeVariantLabel } from "./listing-input";

describe("reading the colours back out", () => {
  it("splits the stored string and ignores the gaps", () => {
    expect(parseColours("Black, White,  Cream ")).toEqual(["Black", "White", "Cream"]);
    expect(parseColours("")).toEqual([]);
    expect(parseColours(undefined)).toEqual([]);
    expect(parseColours(" , , ")).toEqual([]);
  });

  it("matches a colour whatever the case", () => {
    // The guided flow writes "Rose gold"; somebody typing into the old
    // free-text box wrote "rose gold". One colour.
    expect(hasColour("Rose gold", "rose gold")).toBe(true);
    expect(hasColour("rose gold, Navy", "Rose gold")).toBe(true);
    expect(hasColour("Navy", "Rose gold")).toBe(false);
  });
});

describe("the label ceiling", () => {
  it("refuses the swatch that would push the label past the server's cap", () => {
    // The five-swatch refusal (4363698), measured rather than restated.
    const four = "Black, White, Cream, Rose gold";
    expect(mergeVariantLabel("One", four).length).toBeLessThanOrEqual(VARIANT_LABEL_MAX);
    expect(colourWouldOverflow("One", four, "Gold")).toBe(true);
    expect(colourWouldOverflow("One", "Black, White", "Cream")).toBe(false);
  });

  it("never blocks unticking, which can only shorten it", () => {
    const full = "Black, White, Cream, Rose gold";
    expect(colourWouldOverflow("One", full, "Cream")).toBe(false);
    expect(toggleColour("One", full, "Cream")).toBe("Black, White, Rose gold");
  });

  it("counts the size against the same budget", () => {
    // A long size label leaves less room for colours — one budget, not two.
    expect(colourWouldOverflow("One", "", "Terracotta")).toBe(false);
    expect(
      colourWouldOverflow("Extra large gift box of twelve", "", "Terracotta"),
    ).toBe(true);
  });

  it("holds the line even if a caller forgets to disable the control", () => {
    const full = "Black, White, Cream, Rose gold";
    // Returns the value unchanged rather than building a refused label.
    expect(toggleColour("One", full, "Gold")).toBe(full);
    expect(mergeVariantLabel("One", toggleColour("One", full, "Gold")).length)
      .toBeLessThanOrEqual(VARIANT_LABEL_MAX);
  });

  it("ticks and unticks", () => {
    expect(toggleColour("One", "", "Navy")).toBe("Navy");
    expect(toggleColour("One", "Navy", "Navy")).toBe("");
    expect(toggleColour("One", "Navy", "Olive")).toBe("Navy, Olive");
    // Case-insensitively, so a typed spelling is not duplicated.
    expect(toggleColour("One", "navy", "Navy")).toBe("");
  });
});

describe("the palette", () => {
  it("has no duplicate names and a real hex on every swatch", () => {
    const names = CRAFT_PALETTE.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const swatch of CRAFT_PALETTE) {
      expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("shows enough before 'more colours' to be usable", () => {
    expect(CRAFT_PALETTE.length).toBeGreaterThan(PRIMARY_SWATCH_COUNT);
    expect(PRIMARY_SWATCH_COUNT).toBeGreaterThanOrEqual(6);
  });

  it("picks the tick colour with the higher contrast, on every swatch", () => {
    // Not a taste call — compute both ratios and assert the choice wins.
    const relativeLuminance = (hex: string) => {
      const v = hex.replace("#", "");
      const ch = (i: number) => {
        const c = parseInt(v.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
    };

    for (const swatch of CRAFT_PALETTE) {
      const L = relativeLuminance(swatch.hex);
      const onWhiteTick = 1.05 / (L + 0.05);
      const onDarkTick = (L + 0.05) / 0.05;
      expect([swatch.name, isLightSwatch(swatch.hex)]).toEqual([
        swatch.name,
        onDarkTick > onWhiteTick,
      ]);
    }
  });

  it("draws a dark tick on the pale discs the old name list missed", () => {
    const light = (name: string) =>
      isLightSwatch(CRAFT_PALETTE.find((c) => c.name === name)!.hex);
    // White on Blush measured 2.0:1; dark on it is 10.5:1.
    expect(light("Blush")).toBe(true);
    expect(light("Lavender")).toBe(true);
    expect(light("Peach")).toBe(true);
    expect(light("Sage")).toBe(true);
    // ...and the dark discs still take a white one.
    expect(light("Black")).toBe(false);
    expect(light("Navy")).toBe(false);
    expect(light("Emerald")).toBe(false);
  });

  it("survives a malformed hex instead of throwing", () => {
    expect(isLightSwatch("#fff")).toBe(false);
    expect(isLightSwatch("")).toBe(false);
  });
});
