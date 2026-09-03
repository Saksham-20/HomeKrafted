import { StepPills } from "homekrafted-web";

const STEPS = [
  { n: 1, label: "Your basket" },
  { n: 2, label: "Address" },
  { n: 3, label: "Pay" },
];

/** Checkout, one step per position — first, middle, last. */
export const Progress = () => (
  <div style={{ display: "grid", gap: 20, width: 460 }}>
    <StepPills steps={STEPS} activeIndex={0} />
    <StepPills steps={STEPS} activeIndex={1} />
    <StepPills steps={STEPS} activeIndex={2} />
  </div>
);

/** The guided listing flow — four questions, one screen each. */
export const ListingFlow = () => (
  <div style={{ width: 560 }}>
    <StepPills
      steps={[
        { n: 1, label: "Photo" },
        { n: 2, label: "What it is" },
        { n: 3, label: "Price" },
        { n: 4, label: "Stock" },
      ]}
      activeIndex={1}
    />
  </div>
);
