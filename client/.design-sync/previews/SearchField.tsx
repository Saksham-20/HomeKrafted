import { SearchField } from "homekrafted-web";

/** The header's search box, at rest and with a query in it. */
export const Default = () => (
  <div style={{ display: "grid", gap: 12, width: 360 }}>
    <SearchField placeholder="Search pickles, cakes, candles…" aria-label="Search the catalogue" />
    <SearchField defaultValue="mango pickle" aria-label="Search the catalogue" />
  </div>
);

/** Disabled, for a screen still loading its catalogue. */
export const Disabled = () => (
  <div style={{ width: 360 }}>
    <SearchField placeholder="Search pickles, cakes, candles…" aria-label="Search the catalogue" disabled />
  </div>
);
