import { getHamperBoxes, getProducts } from "@/lib/api";
import { HamperBuilderClient } from "@/components/hamper/HamperBuilderClient";
import { HamperComingSoon } from "@/components/hamper/HamperComingSoon";
import { isHamperBuilderLive } from "@/lib/features";

/**
 * Hamper builder (M3) — server wrapper: fetches the box tiers + full
 * product catalog (the "fill it up" grid draws from the same catalog
 * as Shop), hands them to the client wizard. Ported from the prototype's
 * combined Box+Fill screen (`handoff/prototype/Homekrafted.dc.html`,
 * `isHamper` block) but split into real wizard steps — see
 * `HamperBuilderClient` for why.
 *
 * The wizard is currently held behind `FEATURES.hamperBuilder`
 * (`lib/features.ts`): while that's off this route renders
 * `<HamperComingSoon>` and skips the catalog fetch only the builder needs.
 */
export default async function HamperPage() {
  const boxes = await getHamperBoxes();

  if (!isHamperBuilderLive()) {
    return <HamperComingSoon boxes={boxes} />;
  }

  const products = await getProducts();
  return <HamperBuilderClient boxes={boxes} products={products} />;
}
