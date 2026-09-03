import { ServiceCard } from "homekrafted-web";
import { demoServices } from "../preview-lib/fixtures";

/** Unselected and selected, the only axis this card has. */
export const Selection = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 260px)", gap: 16 }}>
    <ServiceCard service={demoServices[0]} onSelect={() => {}} />
    <ServiceCard service={demoServices[1]} selected onSelect={() => {}} />
  </div>
);

/** The three pricing models the card has to carry: per-kg, per-item, per-hour. */
export const PricingModels = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 230px)", gap: 16 }}>
    {demoServices.map((s) => <ServiceCard key={s.id} service={s} onSelect={() => {}} />)}
  </div>
);
