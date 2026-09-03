import { StickySummary, Button } from "homekrafted-web";

/** The checkout summary: item lines, an emphasised total, cashback, CTA, footnote. */
export const Checkout = () => (
  <div style={{ width: 340 }}>
    <StickySummary
      title="Order summary"
      lines={[
        { label: "Items (3)", value: "₹658" },
        { label: "Delivery", value: "₹40" },
        { label: "Gift wrap", value: "₹30" },
        { label: "Total", value: "₹728", emphasis: true },
      ]}
      cashbackLabel="Pay with wallet · earn ₹18 cashback"
      footnote="Cancel any time before the kitchen packs your order."
    >
      <Button variant="primary" style={{ width: "100%" }}>Place order</Button>
    </StickySummary>
  </div>
);

/** A shorter one — the cart's running total, no cashback line. */
export const CartTotals = () => (
  <div style={{ width: 340 }}>
    <StickySummary
      title="Your basket"
      lines={[
        { label: "Subtotal", value: "₹438" },
        { label: "Total", value: "₹438", emphasis: true },
      ]}
    >
      <Button variant="primary" style={{ width: "100%" }}>Checkout</Button>
    </StickySummary>
  </div>
);
