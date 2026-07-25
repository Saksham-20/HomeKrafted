"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export interface FollowButtonProps {
  initialFollowing?: boolean;
  className?: string;
}

/** Follow/Following toggle on the storefront header — local state only (no persistence yet). */
export function FollowButton({ initialFollowing = false, className }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  return (
    <Button
      variant={following ? "secondary" : "primary"}
      className={className}
      onClick={() => setFollowing((value) => !value)}
      aria-pressed={following}
    >
      {following ? "Following ✓" : "Follow"}
    </Button>
  );
}
