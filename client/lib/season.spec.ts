import { existsSync } from "node:fs";
import { join } from "node:path";
import { SEASON, seasonDoorHref } from "./season";

const PUBLIC = join(__dirname, "..", "public");

describe("the seasonal home page's content", () => {
  const images = [
    SEASON.hero.image,
    ...SEASON.mood.doors.map((door) => door.image),
    ...SEASON.edit.doors.map((door) => door.image),
    ...SEASON.promos.map((promo) => promo.image),
  ];

  it("only names pictures that are in the repo", () => {
    for (const image of images) {
      expect(existsSync(join(PUBLIC, image))).toBe(true);
    }
  });

  it("only links to a page or an anchor on this one", () => {
    const hrefs = [
      SEASON.hero.primary.href,
      SEASON.hero.secondary.href,
      SEASON.edit.more.href,
      SEASON.bestsellers.more.href,
      SEASON.mealPlans.cta.href,
      ...SEASON.mood.doors.map((door) => door.href),
      ...SEASON.edit.doors.map((door) => door.href),
      ...SEASON.promos.map((promo) => promo.cta.href),
    ];
    for (const href of hrefs) expect(href).toMatch(/^(\/[a-z-]*|#[a-z-]+)$/);
    expect(SEASON.hero.primary.href).toBe(`#${SEASON.anchor}`);
  });
});

describe("seasonDoorHref", () => {
  const door = { label: "Winter sweets", href: "/shop", category: "sweets-ladoos", image: "/x.jpg" };

  it("narrows to the shelf when the live catalogue has it", () => {
    expect(seasonDoorHref(door, new Set(["sweets-ladoos"]))).toBe("/shop?category=sweets-ladoos");
  });

  it("falls back to the page when the shelf is not live", () => {
    expect(seasonDoorHref(door, new Set(["pickles"]))).toBe("/shop");
  });

  it("leaves a door without a shelf alone", () => {
    expect(seasonDoorHref({ ...door, category: undefined }, new Set(["sweets-ladoos"]))).toBe("/shop");
  });
});
