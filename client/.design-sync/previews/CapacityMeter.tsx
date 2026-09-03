import { CapacityMeter } from "homekrafted-web";

const frame: React.CSSProperties = { width: 320 };

/** A kitchen part-way through the day's ceiling. */
export const Default = () => (
  <div style={frame}>
    <CapacityMeter title="Orders today" current={8} max={20} />
  </div>
);

/** The three readings that matter: room left, nearly full, full. */
export const Levels = () => (
  <div style={{ display: "grid", gap: 16, width: 320 }}>
    <CapacityMeter title="Tiffin subscribers" current={4} max={24} />
    <CapacityMeter title="Tiffin subscribers" current={21} max={24} />
    <CapacityMeter title="Tiffin subscribers" current={24} max={24} label="Full for today" />
  </div>
);
