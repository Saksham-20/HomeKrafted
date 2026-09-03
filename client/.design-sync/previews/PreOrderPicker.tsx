import { useState } from "react";
import { PreOrderPicker } from "homekrafted-web";

/* Days are passed explicitly rather than derived from the clock: the component
   builds a rolling window from `new Date()`, and a preview that moves every day
   re-renders differently on every capture. */
const DAYS = [
  { id: "d1", day: "Today", date: "19 Jul", isoDate: "2026-07-19", isToday: true,
    windows: [{ id: "w2", label: "12 – 2 PM" }, { id: "w3", label: "4 – 6 PM" }] },
  { id: "d2", day: "Tomorrow", date: "20 Jul", isoDate: "2026-07-20", isToday: false,
    windows: [{ id: "w1", label: "9 – 11 AM" }, { id: "w2", label: "12 – 2 PM" }, { id: "w3", label: "4 – 6 PM" }] },
  { id: "d3", day: "Sun", date: "21 Jul", isoDate: "2026-07-21", isToday: false,
    windows: [{ id: "w1", label: "9 – 11 AM" }, { id: "w3", label: "4 – 6 PM" }] },
  { id: "d4", day: "Mon", date: "22 Jul", isoDate: "2026-07-22", isToday: false,
    windows: [{ id: "w1", label: "9 – 11 AM" }, { id: "w2", label: "12 – 2 PM" }],
    unavailableReason: "Kitchen closed" },
];

/** Pick a day, then a window — scheduling is information, never a transaction. */
export const Default = () => {
  const [value, setValue] = useState<{ dayId: string; windowId: string } | undefined>({ dayId: "d2", windowId: "w2" });
  return (
    <div style={{ width: 520 }}>
      <PreOrderPicker
        days={DAYS}
        value={value}
        onChange={setValue}
        title="When would you like it?"
        zoneLabel="Delivering in Chandigarh, Mohali and Panchkula"
      />
    </div>
  );
};

/** With the confirm action — how the Snacks flow carries a slot into WhatsApp. */
export const WithConfirm = () => {
  const [value, setValue] = useState<{ dayId: string; windowId: string } | undefined>(undefined);
  return (
    <div style={{ width: 520 }}>
      <PreOrderPicker
        days={DAYS}
        value={value}
        onChange={setValue}
        title="Pre-order for later"
        onConfirm={() => {}}
        confirmLabel="Send this on WhatsApp"
      />
    </div>
  );
};
