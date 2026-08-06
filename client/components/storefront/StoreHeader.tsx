"use client";

import { useState } from "react";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { FollowButton } from "./FollowButton";
import { VerifiedBadges } from "./VerifiedBadges";
import type { Vendor, VendorProfile } from "@/lib/types";
import styles from "./StoreHeader.module.css";

export interface StoreHeaderProps {
  vendor: Vendor;
  /** M16. Optional so the header still renders for a kitchen with no profile row yet. */
  profile?: VendorProfile;
}

/**
 * Maker storefront header — banner, circular avatar, name, rating,
 * follow, bio + location.
 *
 * A client component since M15 purely so the follower count and the
 * follow button move together: the count sits in the meta row and the
 * button on the far right, so lifting one piece of state here beats
 * splitting the header into two islands. It takes a `vendor` prop and
 * fetches nothing, so no data-fetching follows it into the bundle.
 */
export function StoreHeader({ vendor, profile }: StoreHeaderProps) {
  const [followerCount, setFollowerCount] = useState(vendor.followerCount);

  return (
    <div className={styles.wrap}>
      <div className={styles.banner}>
        <ImageSlot
          ratio="16/5"
          label={vendor.bannerPlaceholder}
          // Decorative: the shop's name is the <h1> right below it, so
          // describing the banner again is noise in a screen reader.
          alt=""
          src={vendor.bannerSrc}
          sizes="(max-width: 1180px) 100vw, 1180px"
          priority
        />
      </div>
      <div className={styles.row}>
        <div className={styles.avatar}>
          <ImageSlot
            ratio="1/1"
            shape="circle"
            label={vendor.avatarPlaceholder}
            alt={`${vendor.name} shop photo`}
            src={vendor.avatarSrc}
            sizes="88px"
            compact
          />
        </div>
        <div className={styles.details}>
          <h1 className={styles.name}>{vendor.name}</h1>
          {profile?.tagline && <p className={styles.tagline}>{profile.tagline}</p>}
          <div className={styles.meta}>
            {/* A kitchen approved this morning has no rating, and "★ 0.0
                (0 reviews)" says it has the worst one. See `ProductCard`. */}
            <span className={styles.rating}>
              {vendor.reviewCount > 0
                ? `★ ${vendor.rating.toFixed(1)} (${vendor.reviewCount} reviews)`
                : "No reviews yet"}
            </span>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span>
              {followerCount} follower{followerCount === 1 ? "" : "s"}
            </span>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span>{vendor.location}</span>
          </div>
          {profile && <VerifiedBadges profile={profile} />}
          <p className={styles.bio}>{vendor.bio}</p>
        </div>
        <FollowButton
          vendorSlug={vendor.slug}
          onCountChange={setFollowerCount}
          className={styles.followBtn}
        />
      </div>
    </div>
  );
}
