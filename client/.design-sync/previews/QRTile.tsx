import { QRTile } from "homekrafted-web";

/** The decorative app-download tile, at two sizes. */
export const Sizes = () => (
  <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
    <QRTile />
    <QRTile size={72} />
  </div>
);
