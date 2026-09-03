import { SlotPicker } from "homekrafted-web";

const DAYS = [
  { id: "d1", primary: "Today", secondary: "19 Jul" },
  { id: "d2", primary: "Tomorrow", secondary: "20 Jul" },
  { id: "d3", primary: "Sun", secondary: "21 Jul" },
  { id: "d4", primary: "Mon", secondary: "22 Jul" },
];

const WINDOWS = [
  { id: "w1", primary: "9 – 11 AM" },
  { id: "w2", primary: "12 – 2 PM" },
  { id: "w3", primary: "4 – 6 PM" },
];

/** Day variant — bold day name over its date. */
export const Days = () => (
  <div style={{ width: 420 }}>
    <SlotPicker variant="day" options={DAYS} value="d2" columns={4} onChange={() => {}} />
  </div>
);

/** Slot variant — one centred label per cell. */
export const Windows = () => (
  <div style={{ width: 420 }}>
    <SlotPicker variant="slot" options={WINDOWS} value="w2" columns={3} onChange={() => {}} />
  </div>
);

/** Disabled, while the kitchen's calendar is loading. */
export const Disabled = () => (
  <div style={{ width: 420 }}>
    <SlotPicker variant="slot" options={WINDOWS} value="w1" columns={3} disabled onChange={() => {}} />
  </div>
);
