import { FollowingClient } from "@/components/account/FollowingClient";

/** `/account/following` (M15) — owner-scoped read, so the client screen fetches it on mount. */
export default function FollowingPage() {
  return <FollowingClient />;
}
