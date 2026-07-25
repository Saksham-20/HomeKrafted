import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { FollowButton } from "./FollowButton";
import type { Vendor } from "@/lib/types";
import styles from "./StoreHeader.module.css";

export interface StoreHeaderProps {
  vendor: Vendor;
}

/** Maker storefront header — banner, circular avatar, name, rating, follow, bio + location. */
export function StoreHeader({ vendor }: StoreHeaderProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.banner}>
        <ImageSlot ratio="16/5" label={vendor.bannerPlaceholder} />
      </div>
      <div className={styles.row}>
        <div className={styles.avatar}>
          <ImageSlot ratio="1/1" shape="circle" label={vendor.avatarPlaceholder} compact />
        </div>
        <div className={styles.details}>
          <h1 className={styles.name}>{vendor.name}</h1>
          <div className={styles.meta}>
            <span className={styles.rating}>
              ★ {vendor.rating.toFixed(1)} ({vendor.reviewCount} reviews)
            </span>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span>{vendor.followerCount} followers</span>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span>{vendor.location}</span>
          </div>
          <p className={styles.bio}>{vendor.bio}</p>
        </div>
        <FollowButton initialFollowing={vendor.isFollowing} className={styles.followBtn} />
      </div>
    </div>
  );
}
