"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthContext";
import { followVendor, getFollowState, unfollowVendor } from "@/lib/api";

export interface FollowButtonProps {
  /** Storefront slug — the follow endpoints are keyed on it, not the id. */
  vendorSlug: string;
  /** Lets the header's follower count move with the button. */
  onCountChange?: (followerCount: number) => void;
  className?: string;
}

/**
 * Follow/Following toggle on a storefront.
 *
 * Was local `useState` with a comment admitting "no persistence yet" —
 * the button lied every time it was pressed, and `Vendor.followerCount`
 * was a seeded decoration with no `VendorFollow` row behind it. M15 gave
 * that table (in the schema since M8.1) its endpoints; this reads and
 * writes them.
 *
 * State is fetched on mount rather than handed down as a prop: the
 * storefront page is a public Server Component with no session, so it
 * cannot answer "am *I* following this" — see `lib/api/vendors.ts`.
 *
 * Optimistic, rolling back on failure. A follow is low-stakes, and the
 * round trip is the only thing that would make the control feel broken.
 */
export function FollowButton({ vendorSlug, onCountChange, className }: FollowButtonProps) {
  const router = useRouter();
  const { user, ready: authReady } = useAuth();
  const [following, setFollowing] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Derived rather than a third piece of state: a signed-out visitor has
  // nothing to fetch, so the button is ready the moment auth settles.
  const ready = authReady && (!user || fetched);

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    getFollowState(vendorSlug)
      .then((state) => {
        if (cancelled) return;
        setFollowing(state.following);
        onCountChange?.(state.followerCount);
      })
      .catch(() => {
        // A failed read just leaves the button at "Follow" — not worth an
        // error state on a control this small.
      })
      .finally(() => {
        if (!cancelled) setFetched(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user, vendorSlug]);

  async function handleClick() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/storefront/${vendorSlug}`)}`);
      return;
    }
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      const state = next ? await followVendor(vendorSlug) : await unfollowVendor(vendorSlug);
      setFollowing(state.following);
      onCountChange?.(state.followerCount);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={following ? "secondary" : "primary"}
      className={className}
      onClick={handleClick}
      disabled={busy || !ready}
      aria-pressed={following}
    >
      {following ? "Following ✓" : "Follow"}
    </Button>
  );
}
