import clsx from "clsx";
import { BadgeCheck, MapPin, ShieldCheck } from "lucide-react";
import type { VendorProfile } from "@/lib/types";
import styles from "./VerifiedBadges.module.css";

export interface VerifiedBadgesProps {
  profile: Pick<VendorProfile, "identityVerified" | "addressVerified" | "fssaiVerified">;
  className?: string;
}

/**
 * The three checks, in the storefront header (M16).
 *
 * Only *earned* badges render. Nothing here says "not verified" — the
 * absence is the message on a header, and a row of grey crosses next to
 * someone's name reads as an accusation rather than an absence. The full
 * earned/unearned list belongs in `<TrustPanel>`, further down the page,
 * where a buyer has asked for it.
 *
 * A badge is only shown when an admin has set the flag
 * (`PATCH /admin/sellers/:id/verification`); a submitted-but-unchecked
 * FSSAI number never reaches this component, because the public profile
 * payload doesn't carry it.
 */
export function VerifiedBadges({ profile, className }: VerifiedBadgesProps) {
  const badges = [
    profile.fssaiVerified && { key: "fssai", Icon: ShieldCheck, label: "FSSAI registered" },
    profile.identityVerified && { key: "identity", Icon: BadgeCheck, label: "Identity verified" },
    profile.addressVerified && { key: "address", Icon: MapPin, label: "Address verified" },
  ].filter(Boolean) as { key: string; Icon: typeof ShieldCheck; label: string }[];

  if (badges.length === 0) return null;

  return (
    <ul className={clsx(styles.list, className)}>
      {badges.map(({ key, Icon, label }) => (
        <li key={key} className={styles.badge}>
          <Icon size={14} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
