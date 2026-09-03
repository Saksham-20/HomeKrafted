import { CategoryTile } from "homekrafted-web";
import { demoCategories } from "../preview-lib/fixtures";

/** One tile, as a real link. */
export const Default = () => (
  <div style={{ width: 200 }}>
    <CategoryTile category={demoCategories[0]} href="#" />
  </div>
);

/** The row a browse page opens with. */
export const Row = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 160px)", gap: 12 }}>
    {demoCategories.map((c) => (
      <CategoryTile key={c.id} category={c} href="#" />
    ))}
  </div>
);
