import { StatusTimeline } from "homekrafted-web";

const frame: React.CSSProperties = { width: 260 };

/** An order part-way through: cooked and packed, out for delivery next. */
export const OrderProgress = () => (
  <div style={frame}>
    <StatusTimeline
      steps={[
        { label: "Order placed", done: true },
        { label: "Accepted by the kitchen", done: true },
        { label: "Packed", done: true },
        { label: "Out for delivery", done: false, current: true },
        { label: "Delivered", done: false },
      ]}
    />
  </div>
);

/** The Snacks WhatsApp timeline — the one place the WhatsApp green belongs. */
export const WhatsappTone = () => (
  <div style={frame}>
    <StatusTimeline
      tone="whatsapp"
      steps={[
        { label: "Received", done: true },
        { label: "Accepted", done: true },
        { label: "Out for delivery", done: false, current: true },
      ]}
    />
  </div>
);

/** Horizontal, for a wide order-detail header. */
export const Horizontal = () => (
  <div style={{ width: 520 }}>
    <StatusTimeline
      orientation="horizontal"
      steps={[
        { label: "Placed", done: true },
        { label: "Accepted", done: true },
        { label: "Packed", done: false, current: true },
        { label: "Delivered", done: false },
      ]}
    />
  </div>
);
