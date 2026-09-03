import { Tag } from "homekrafted-web";

/** The four catalogue tags, which is the whole API. */
export const AllTags = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <Tag label="Bestseller" />
    <Tag label="New" />
    <Tag label="Festive" />
    <Tag label="Curated" />
  </div>
);
