import { CraftIcon, categoryArt, occasionArt, giftArt } from "homekrafted-web";

const row: React.CSSProperties = { display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" };

/** The category art the tiles draw. */
export const CategoryArt = () => (
  <div style={row}>
    {["candles-home", "handmade-jewellery", "art-prints", "personalised-gifts"].map((slug) => (
      <CraftIcon key={slug} art={categoryArt(slug) ?? giftArt} />
    ))}
  </div>
);

/** The occasion art, which the gold-ring tiles use. */
export const OccasionArt = () => (
  <div style={row}>
    {["birthday", "anniversary", "diwali", "thank-you", "raksha-bandhan"].map((slug) => (
      <CraftIcon key={slug} art={occasionArt(slug) ?? giftArt} />
    ))}
  </div>
);

/** Sizes: 34 for the collections hub, 40 for a tile, 46 for a category circle. */
export const Sizes = () => (
  <div style={row}>
    <CraftIcon art={giftArt} size={34} />
    <CraftIcon art={giftArt} size={40} />
    <CraftIcon art={giftArt} size={46} />
  </div>
);
