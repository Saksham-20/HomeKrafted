import { DietDot } from "homekrafted-web";

const line: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "center",
  font: "500 14px/1.4 var(--hk-font-body)", color: "var(--hk-ink)",
};

/** Both marks, each next to the dish it labels. */
export const BothDiets = () => (
  <div style={{ display: "grid", gap: 10 }}>
    <span style={line}><DietDot diet="veg" /> Ragi almond cookies</span>
    <span style={line}><DietDot diet="non-veg" /> Chicken chettinad, half kilo</span>
  </div>
);
