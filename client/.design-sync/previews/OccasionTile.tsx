import { OccasionTile } from "homekrafted-web";
import { demoOccasions } from "../preview-lib/fixtures";

/** One occasion: gold ring, initial, name and its tagline. */
export const Default = () => (
  <div style={{ width: 200 }}>
    <OccasionTile occasion={demoOccasions[0]} href="#" />
  </div>
);

/** The occasions strip on the home page. */
export const Row = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 160px)", gap: 12 }}>
    {demoOccasions.map((o) => (
      <OccasionTile key={o.id} occasion={o} href="#" />
    ))}
  </div>
);
