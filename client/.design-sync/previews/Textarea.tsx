import { Textarea } from "homekrafted-web";

const frame: React.CSSProperties = { width: 380 };

/** Labelled, with the hint line under it. */
export const WithLabel = () => (
  <div style={frame}>
    <Textarea
      label="Gift message"
      hint="The maker writes this on the card that goes in the box."
      placeholder="Happy Diwali, Ma — from all of us."
      rows={4}
    />
  </div>
);

/** Filled, as a HomeKrafter's storefront story. */
export const Filled = () => (
  <div style={frame}>
    <Textarea
      label="Your story"
      defaultValue="I have been making pickles from my grandmother's recipes for eleven years, in small batches, in my own kitchen in Sector 35."
      rows={4}
    />
  </div>
);

/** Disabled. */
export const Disabled = () => (
  <div style={frame}>
    <Textarea label="Delivery note" defaultValue="Ring the bell twice." rows={3} disabled />
  </div>
);
