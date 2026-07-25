import { MapPin } from "lucide-react";
import { ChannelBadge } from "@/components/ui/ChannelBadge";
import { StoreBadges } from "@/components/ui/StoreBadges";
import styles from "./AppTrackingBand.module.css";

/**
 * "Live rider tracking is on the app" band — ported from the Laundry
 * screen's dark closing section (`handoff/prototype/Homekrafted.dc.html`,
 * `isLaundry` block, the `#2B241C→#3a3025` gradient card). Enforces the
 * channel rule from `lib/channel.ts` (`liveTracking: "app-only"`) in the
 * UI itself: `<ChannelBadge channel="full-meals">` reuses the exact
 * "On the app · Coming soon" gold-dark pill (the same "this happens on
 * the app, not here" messaging `full-meals` already carries) rather than
 * inventing a fourth badge variant, and `<StoreBadges>` gives it real
 * app-store links in place of the prototype's static "Notify me →" pill.
 */
export function AppTrackingBand() {
  return (
    <div className={styles.band}>
      <span className={styles.iconTile} aria-hidden="true">
        <MapPin size={22} strokeWidth={1.7} />
      </span>
      <div className={styles.body}>
        <ChannelBadge channel="full-meals" className={styles.badge} />
        <div className={styles.title}>Live rider tracking is on the app</div>
        <p className={styles.copy}>
          Track your pickup &amp; delivery in real time — download the Homekrafted app.
        </p>
      </div>
      <StoreBadges variant="outline" className={styles.storeBadges} />
    </div>
  );
}
