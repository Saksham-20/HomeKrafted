import type { Metadata } from "next";
import clsx from "clsx";
import { MapPin, Percent, UtensilsCrossed, Zap } from "lucide-react";
import { getMealPromo } from "@/lib/api";
import { MealPreOrder } from "@/components/food/MealPreOrder";
import { getChannelRule } from "@/lib/channel";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StoreBadges } from "@/components/ui/StoreBadges";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { AppInstallPanel } from "@/components/home/AppInstallPanel";
import { pageMetadata } from "@/lib/seo";
import styles from "./AppPromo.module.css";

const VALUE_PROPS = [
  {
    icon: UtensilsCrossed,
    title: "Full meal menus",
    description:
      "Hot home-cooked thalis, curries and combos from local kitchens — beyond the Snacks menu on web.",
  },
  {
    icon: MapPin,
    title: "Live rider tracking",
    description: "Watch your order move from kitchen to doorstep in real time, on a map.",
  },
  {
    icon: Zap,
    title: "Faster reordering",
    description: "Save your favourites and reorder a past meal in one tap.",
  },
  {
    icon: Percent,
    title: "App-only offers",
    description: "Occasional app-exclusive discounts and extra wallet cashback.",
  },
] as const;

/**
 * Food Delivery / app promo (M5) — full-meals marketing only. Not a port:
 * the prototype has no dedicated screen for this (its Home page just
 * shows the dark "Food Delivery · Coming soon" card), so this page is
 * built fresh, reusing the same dark-gradient/gold-bright treatment that
 * card and `AppTrackingBand` (Laundry) already established for
 * "this happens on the app, not here" surfaces.
 *
 * Channel-critical: `lib/channel.ts` marks full-meals `hasMenuOnWeb:
 * false` (also no cart/checkout) — ordering and live tracking are
 * entirely in-app. The assertion below fails loudly if that ever changes
 * without this page being deliberately redesigned; nothing here should
 * quietly grow a menu.
 */
export const metadata: Metadata = pageMetadata({
  title: "Homemade food delivery on the app",
  description:
    "Full meals from home kitchens, with live tracking, are coming to the Homekrafted app. Pre-order your slot and we'll message you when it opens.",
  path: "/app-promo",
});

export default async function AppPromoPage() {
  const channel = getChannelRule("full-meals");
  if (channel.hasMenuOnWeb) {
    throw new Error(
      "Full-meals channel rule now allows a web menu, but this page still renders promo-only — update AppPromoPage deliberately before relaxing this assertion.",
    );
  }

  const mealPromo = await getMealPromo();

  return (
    <>
      <section className={styles.hero}>
        <div className={clsx("container", styles.heroGrid)}>
          <div className={styles.copy}>
            <ChannelBadge channel="full-meals" className={styles.badge} />
            <h1 className={styles.title}>Full meals, delivered hot.</h1>
            <p className={styles.lede}>{mealPromo.description}</p>
            <StoreBadges
              variant="outline"
              appStoreHref={mealPromo.appStoreUrl}
              playStoreHref={mealPromo.playStoreUrl}
              className={styles.storeBadges}
            />
            <p className={styles.notify}>Notify me when it launches →</p>
          </div>
          <div className={styles.imageWrap}>
            <ImageSlot
              ratio="4/5"
              label={mealPromo.imagePlaceholder}
              src={mealPromo.imageSrc}
              size="1000×1250"
            />
          </div>
        </div>
      </section>

      {/* Pre-order. `full-meals.hasPreOrderOnWeb` is true while
          `hasMenuOnWeb` stays false — there's still no menu here, so this
          asks for a time and hands off to a human, rather than pretending
          to be a checkout. */}
      {channel.hasPreOrderOnWeb && (
        <section className={clsx("container", styles.propsSection)}>
          <MealPreOrder />
        </section>
      )}


      <section className={clsx("container", styles.propsSection)}>
        <span className={styles.propsEyebrow}>Why the app</span>
        <h2 className={styles.propsTitle}>Everything full meals need, in your pocket</h2>
        <div className={styles.propsGrid}>
          {VALUE_PROPS.map(({ icon: Icon, title, description }) => (
            <div key={title} className={styles.propCard}>
              <span className={styles.propIcon} aria-hidden="true">
                <Icon size={24} strokeWidth={1.6} />
              </span>
              <h3 className={styles.propTitle}>{title}</h3>
              <p className={styles.propDescription}>{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={clsx("container", styles.installSection)}>
        <AppInstallPanel />
      </section>
    </>
  );
}
