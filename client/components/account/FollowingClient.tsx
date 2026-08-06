"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ImageSlot } from "@/components/placeholder/ImageSlot";
import { getFollowedVendors, unfollowVendor } from "@/lib/api";
import type { Vendor } from "@/lib/types";
import styles from "./FollowingClient.module.css";

/**
 * `/account/following` — the storefronts this buyer follows.
 *
 * The other half of M15's follow feature: following something with
 * nowhere to see what you follow is a button, not a feature. Unfollowing
 * from here removes the row optimistically and restores it if the write
 * fails.
 */
export function FollowingClient() {
  const [vendors, setVendors] = useState<Vendor[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFollowedVendors()
      .then((rows) => {
        if (!cancelled) setVendors(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUnfollow(vendor: Vendor) {
    const previous = vendors ?? [];
    setVendors(previous.filter((row) => row.id !== vendor.id));
    try {
      await unfollowVendor(vendor.slug);
    } catch {
      setVendors(previous);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Account</span>
        <h1 className={styles.title}>Following</h1>
        <p className={styles.subtitle}>
          {vendors === undefined
            ? "HomeKrafters you follow"
            : `${vendors.length} HomeKrafter${vendors.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {failed ? (
        <p className={styles.error} role="alert">
          Couldn&apos;t load who you follow. Reload the page to try again.
        </p>
      ) : vendors === undefined ? (
        <p className={styles.loading}>Loading…</p>
      ) : vendors.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>You&apos;re not following anyone yet.</p>
          <p className={styles.emptyBody}>
            Follow a kitchen from its storefront and their new batches will be easy to find
            again.
          </p>
          <Link href="/shop" className={styles.emptyCta}>
            Find a HomeKrafter
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {vendors.map((vendor) => (
            <li key={vendor.id} className={styles.row}>
              <Link href={`/storefront/${vendor.slug}`} className={styles.rowLink}>
                <span className={styles.avatar}>
                  <ImageSlot
                    ratio="1/1"
                    shape="circle"
                    label={vendor.avatarPlaceholder}
                    src={vendor.avatarSrc}
                    compact
                  />
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>{vendor.name}</span>
                  <span className={styles.meta}>
                    {vendor.reviewCount > 0 ? `★ ${vendor.rating.toFixed(1)} · ` : ""}
                    {vendor.location}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                className={styles.unfollow}
                onClick={() => handleUnfollow(vendor)}
              >
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
