import { ProductCard } from "homekrafted-web";
import { cell, cardWidth, demoProduct, demoProducts } from "../preview-lib/fixtures";

/** The canonical card: photo, maker line, price, wishlist heart, add button. */
export const Default = () => (
  <div style={cardWidth}>
    <ProductCard product={demoProduct} makerName="Meera's Kitchen" href="/product/mango-thokku-pickle" />
  </div>
);

/** The two states a grid card carries — saved, and already in the cart. */
export const States = () => (
  <div style={cell}>
    <div style={cardWidth}>
      <ProductCard product={demoProducts[0]} makerName="Meera's Kitchen" href="#" wishlisted onToggleWishlist={() => {}} />
    </div>
    <div style={cardWidth}>
      <ProductCard product={demoProducts[1]} makerName="Anand Bakes" href="#" added onAdd={() => {}} />
    </div>
  </div>
);

/** How it reads as a row of the catalogue grid. */
export const InAGrid = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 220px)", gap: 16 }}>
    {demoProducts.slice(0, 3).map((p, i) => (
      <ProductCard key={p.id} product={p} makerName={["Meera's Kitchen", "Anand Bakes", "Clay & Co"][i]} href="#" />
    ))}
  </div>
);
