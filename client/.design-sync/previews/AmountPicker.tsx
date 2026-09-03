import { AmountPicker } from "homekrafted-web";

const frame: React.CSSProperties = { width: 380 };

/** Wallet top-up amounts, nothing chosen yet. */
export const Default = () => (
  <div style={frame}>
    <AmountPicker options={[200, 500, 1000, 2000]} />
  </div>
);

/** With one selected — the state the top-up screen sits in. */
export const Selected = () => (
  <div style={frame}>
    <AmountPicker options={[200, 500, 1000, 2000]} value={500} onChange={() => {}} />
  </div>
);

/** Disabled, while a top-up is being confirmed. */
export const Disabled = () => (
  <div style={frame}>
    <AmountPicker options={[200, 500, 1000, 2000]} value={1000} disabled onChange={() => {}} />
  </div>
);
