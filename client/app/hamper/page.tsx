import { getHamperBoxes, getProducts } from "@/lib/api";
import { HamperBuilderClient } from "@/components/hamper/HamperBuilderClient";

/**
 * Hamper builder (M3) — server wrapper: fetches the box tiers + full
 * product catalog (the "fill it up" grid draws from the same catalog
 * as Shop), hands them to the client wizard. Ported from the prototype's
 * combined Box+Fill screen (`handoff/prototype/Homekrafted.dc.html`,
 * `isHamper` block) but split into real wizard steps — see
 * `HamperBuilderClient` for why.
 */
export default async function HamperPage() {
  const [boxes, products] = await Promise.all([getHamperBoxes(), getProducts()]);

  return <HamperBuilderClient boxes={boxes} products={products} />;
}
