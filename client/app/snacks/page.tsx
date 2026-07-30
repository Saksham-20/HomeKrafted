import clsx from "clsx";
import { getBuyerCoords } from "@/lib/location/server";
import { getSnackCategoryFilters, getSnacks } from "@/lib/api";
import { getChannelRule } from "@/lib/channel";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { SnacksClient } from "@/components/snacks/SnacksClient";
import styles from "./Snacks.module.css";

/**
 * Snacks — browsable menu + WhatsApp ordering (M5). Ported from the
 * prototype's `isSnacks` block (`handoff/prototype/Homekrafted.dc.html`):
 * hero (channel eyebrow, "no checkout" pill, title, copy), category
 * chips + grid, and a sticky "your snack list" aside that sends a
 * prefilled `wa.me` message instead of checking out on-site.
 *
 * Channel-critical: `lib/channel.ts` marks Snacks `hasCartOnWeb: false`
 * and `hasCheckoutOnWeb: false` (WhatsApp is the only order path). The
 * assertion below fails loudly if that ever changes without this page
 * being deliberately redesigned — nothing here should quietly grow a
 * cart/checkout.
 */
export default async function SnacksPage() {
  const channel = getChannelRule("snacks");
  if (channel.hasCartOnWeb || channel.hasCheckoutOnWeb) {
    throw new Error(
      "Snacks channel rule now allows a web cart/checkout, but this page still renders the WhatsApp-only flow — update SnacksPage/SnacksClient deliberately before relaxing this assertion.",
    );
  }

  // Same cookie-read as /shop — see `getBuyerCoords`.
  const near = await getBuyerCoords();
  const [snacks, categories] = await Promise.all([getSnacks(near), getSnackCategoryFilters()]);

  return (
    <>
      <section>
        <div className={clsx("container", styles.heroInner)}>
          <div className={styles.badgeRow}>
            <ChannelBadge channel="snacks" />
            <span className={styles.noCheckout}>No checkout — we reply on chat</span>
          </div>
          <h1 className={styles.title}>Fresh home snacks, daily</h1>
          <p className={styles.subtitle}>
            Browse today&rsquo;s menu, build your list, and send it to us on WhatsApp —
            you&rsquo;ll get order updates right in the chat. Full meals &amp; live tracking
            are on the app.
          </p>
        </div>
      </section>
      <div className="container">
        <SnacksClient snacks={snacks} categories={categories} />
      </div>
    </>
  );
}
