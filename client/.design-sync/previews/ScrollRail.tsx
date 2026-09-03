import { ScrollRail, ProductCard } from "homekrafted-web";
import { demoProducts } from "../preview-lib/fixtures";

/** A horizontal rail of cards — the shape every home-page section uses. */
export const ProductRail = () => (
  <div style={{ width: 620 }}>
    <ScrollRail label="Ordered again and again">
      {demoProducts.map((p, i) => (
        <div key={p.id} style={{ width: 220, flex: "0 0 auto" }}>
          <ProductCard product={p} makerName={["Meera's Kitchen", "Anand Bakes", "Clay & Co", "Sunder Sweets"][i]} href="#" />
        </div>
      ))}
    </ScrollRail>
  </div>
);
