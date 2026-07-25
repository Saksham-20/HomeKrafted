import { ProfileClient } from "@/components/account/ProfileClient";

/**
 * Profile (M7a) — no server data to fetch; the editable fields live on
 * `useAuth().user` (client state, see `lib/auth/AuthContext.tsx`). Kept as
 * a thin server wrapper for consistency with every other route.
 */
export default function ProfilePage() {
  return <ProfileClient />;
}
