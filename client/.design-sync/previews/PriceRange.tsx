import { PriceRange } from "homekrafted-web";

const frame: React.CSSProperties = { width: 320 };
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** The browse page's price filter, full width of its range. */
export const Default = () => (
  <div style={frame}>
    <PriceRange min={0} max={5000} step={50} defaultValueMin={0} defaultValueMax={5000} formatValue={rupees} />
  </div>
);

/** Narrowed — the state a filtered listing is actually in. */
export const Narrowed = () => (
  <div style={frame}>
    <PriceRange min={0} max={5000} step={50} valueMin={500} valueMax={2200} formatValue={rupees} onChange={() => {}} />
  </div>
);

/** Disabled. */
export const Disabled = () => (
  <div style={frame}>
    <PriceRange min={0} max={5000} step={50} valueMin={0} valueMax={5000} formatValue={rupees} disabled onChange={() => {}} />
  </div>
);
