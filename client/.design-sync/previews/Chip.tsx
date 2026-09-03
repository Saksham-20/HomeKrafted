import { Chip } from "homekrafted-web";

const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

/** Filter chips: unselected and selected, the axis that matters. */
export const Selection = () => (
  <div style={row}>
    <Chip label="Pickles" onClick={() => {}} />
    <Chip label="Bakes" selected onClick={() => {}} />
    <Chip label="Candles" onClick={() => {}} />
    <Chip label="Under ₹500" selected onClick={() => {}} />
  </div>
);

/** Applied filters carry a remove affordance — the browse page's active bar. */
export const Removable = () => (
  <div style={row}>
    <Chip label="Vegetarian" selected onRemove={() => {}} />
    <Chip label="Ships nationwide" selected onRemove={() => {}} />
    <Chip label="Chandigarh" selected onRemove={() => {}} />
  </div>
);

/** A facet with nothing behind it is dimmed, never hidden. */
export const Disabled = () => (
  <div style={row}>
    <Chip label="Hampers (0)" disabled />
    <Chip label="Gift wrap (0)" disabled />
  </div>
);
