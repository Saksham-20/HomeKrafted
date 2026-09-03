import { Card } from "homekrafted-web";

const body: React.CSSProperties = { font: "500 14px/1.5 var(--hk-font-body)", color: "var(--hk-ink)" };
const title: React.CSSProperties = { font: "600 18px/1.3 var(--hk-font-display)", marginBottom: 6 };

/** The default surface: white, hairline border, medium padding. */
export const Default = () => (
  <div style={{ width: 320 }}>
    <Card>
      <div style={title}>Meera&apos;s Kitchen</div>
      <p style={body}>Small-batch South Indian pickles, made to order in Sector 35, Chandigarh.</p>
    </Card>
  </div>
);

/** The four padding steps, so a caller can see what each buys. */
export const Padding = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 170px)", gap: 12 }}>
    {(["none", "sm", "md", "lg"] as const).map((p) => (
      <Card key={p} padding={p}>
        <div style={body}>padding=&quot;{p}&quot;</div>
      </Card>
    ))}
  </div>
);

/** Hoverable — lift plus a gold border, for a card that is itself a link. */
export const Hoverable = () => (
  <div style={{ width: 320 }}>
    <Card hoverable>
      <div style={title}>Festive assorted hamper</div>
      <p style={body}>Six jars from three kitchens, packed in one box.</p>
    </Card>
  </div>
);
