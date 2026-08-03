import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo";
import { ResetPasswordClient } from "@/components/auth/ResetPasswordClient";

export const metadata = pageMetadata({
  title: "Set a new password",
  description: "Choose a new password for your Homekrafted account.",
  path: "/reset-password",
  noindex: true,
});

/**
 * `ResetPasswordClient` reads `?token=` via `useSearchParams`, which opts
 * the tree into client-side rendering and therefore needs a Suspense
 * boundary — without one the build fails rather than degrading, since Next
 * cannot prerender a component that depends on the request's query string.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordClient />
    </Suspense>
  );
}
