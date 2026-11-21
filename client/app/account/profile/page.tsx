import { ProfileClient } from "@/components/account/ProfileClient";
import { getCachedSocialConfig } from "@/lib/auth/social-config.server";

/**
 * Profile (M7a). The editable fields live on `useAuth().user` (client
 * state); the one server read is the social config, so the "Connect
 * Google" card knows whether Google is offered at all — the same cached
 * read `/login` uses, so this adds no API round trip most of the time.
 */
export default async function ProfilePage() {
  return <ProfileClient socialConfig={await getCachedSocialConfig()} />;
}
