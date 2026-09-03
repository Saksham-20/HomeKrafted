import { SnackCard } from "homekrafted-web";
import { demoSnacks } from "../preview-lib/fixtures";

/** One snack — Snacks has no web checkout, so the action builds a WhatsApp list. */
export const Default = () => (
  <div style={{ width: 260 }}>
    <SnackCard snack={demoSnacks[0]} onAdd={() => {}} />
  </div>
);

/** Added to the WhatsApp list already. */
export const Added = () => (
  <div style={{ width: 260 }}>
    <SnackCard snack={demoSnacks[1]} added onAdd={() => {}} />
  </div>
);

/** A row of the menu. */
export const Menu = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 220px)", gap: 16 }}>
    {demoSnacks.slice(0, 3).map((s) => <SnackCard key={s.id} snack={s} onAdd={() => {}} />)}
  </div>
);
