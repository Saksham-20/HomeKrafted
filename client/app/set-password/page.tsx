import { pageMetadata } from "@/lib/seo";
import { SetPasswordClient } from "@/components/auth/SetPasswordClient";

export const metadata = pageMetadata({
  title: "Choose your password",
  description: "Replace the temporary password you were given.",
  path: "/set-password",
  noindex: true,
});

/**
 * `/set-password` (M32) — where somebody signed in with an admin-issued
 * temporary password replaces it.
 *
 * No Suspense boundary needed, unlike `/reset-password`: this screen
 * reads nothing from the query string. It reads the session, which is
 * client state.
 */
export default function SetPasswordPage() {
  return <SetPasswordClient />;
}
