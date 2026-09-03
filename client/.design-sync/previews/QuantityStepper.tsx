import { QuantityStepper } from "homekrafted-web";

const row: React.CSSProperties = { display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" };

/** A cart line's stepper — itemName is what makes the buttons distinguishable. */
export const Default = () => (
  <div style={row}>
    <QuantityStepper defaultValue={1} itemName="Mango Thokku Pickle" />
    <QuantityStepper defaultValue={3} itemName="Ragi almond cookies" />
  </div>
);

/** At the floor and at the ceiling — the two ends a cart actually hits. */
export const Bounds = () => (
  <div style={row}>
    <QuantityStepper value={1} min={1} max={6} itemName="Green chilli chutney" onChange={() => {}} />
    <QuantityStepper value={6} min={1} max={6} itemName="Green chilli chutney" onChange={() => {}} />
  </div>
);

/** Disabled — a line the kitchen has paused for the day. */
export const Disabled = () => (
  <div style={row}>
    <QuantityStepper value={2} disabled itemName="Chicken chettinad" onChange={() => {}} />
  </div>
);
