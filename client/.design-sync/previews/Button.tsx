import { Button } from "homekrafted-web";
import { Heart, ShoppingBag } from "lucide-react";

const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" };

/** The five variants, side by side — the axis that most changes appearance. */
export const Variants = () => (
  <div style={row}>
    <Button variant="primary">Add to cart</Button>
    <Button variant="secondary">View storefront</Button>
    <Button variant="ghost-gold">Add to hamper</Button>
    <Button variant="whatsapp">Order on WhatsApp</Button>
  </div>
);

/** Both sizes, on the two variants a page usually pairs. */
export const Sizes = () => (
  <div style={row}>
    <Button variant="primary" size="sm">Buy now</Button>
    <Button variant="primary" size="md">Buy now</Button>
    <Button variant="secondary" size="sm">Follow kitchen</Button>
    <Button variant="secondary" size="md">Follow kitchen</Button>
  </div>
);

/** Icon-only buttons always carry an aria-label; round is the default, square is the header hamburger. */
export const IconOnly = () => (
  <div style={row}>
    <Button variant="icon" aria-label="Save to wishlist"><Heart size={18} /></Button>
    <Button variant="icon" shape="square" aria-label="Open cart"><ShoppingBag size={18} /></Button>
  </div>
);

/** Disabled is the one state a static card can show honestly. */
export const Disabled = () => (
  <div style={row}>
    <Button variant="primary" disabled>Sold out today</Button>
    <Button variant="secondary" disabled>Pre-order closed</Button>
  </div>
);
