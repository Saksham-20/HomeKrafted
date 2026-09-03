import { useState } from "react";
import { Combobox } from "homekrafted-web";

const OCCASIONS = [
  { value: "oc1", label: "Diwali" },
  { value: "oc2", label: "Raksha Bandhan" },
  { value: "oc3", label: "Housewarming" },
  { value: "oc4", label: "Birthday" },
  { value: "oc5", label: "Thank you" },
];

const frame: React.CSSProperties = { width: 320 };

/** Single-select, the portal's dense mono label. */
export const Single = () => {
  const [value, setValue] = useState<string[]>(["oc1"]);
  return (
    <div style={frame}>
      <Combobox label="Occasion" options={OCCASIONS} value={value} onChange={setValue} placeholder="Search occasions" />
    </div>
  );
};

/** Multi-select: picks render as removable chips and the list stays open. */
export const Multiple = () => {
  const [value, setValue] = useState<string[]>(["oc1", "oc4"]);
  return (
    <div style={frame}>
      <Combobox
        multiple
        label="Occasions this suits"
        labelTone="plain"
        options={OCCASIONS}
        value={value}
        onChange={setValue}
        hint="Pick every occasion a buyer might shop this for."
      />
    </div>
  );
};

/** With the ask row — a HomeKrafter can request a shelf that isn't there yet. */
export const WithSuggest = () => {
  const [value, setValue] = useState<string[]>([]);
  return (
    <div style={frame}>
      <Combobox
        label="Category"
        options={[
          { value: "ct1", label: "Pickles & preserves" },
          { value: "ct2", label: "Bakes" },
          { value: "ct3", label: "Candles" },
        ]}
        value={value}
        onChange={setValue}
        placeholder="What do you make?"
        onSuggest={async () => "Sent. We'll let you know."}
        emptyMessage="Nothing matches that yet."
      />
    </div>
  );
};

/** Disabled — the field a screen shows while it waits on something else. */
export const Disabled = () => (
  <div style={frame}>
    <Combobox label="Occasion" options={OCCASIONS} value={["oc3"]} onChange={() => {}} disabled />
  </div>
);
