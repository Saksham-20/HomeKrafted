import type { Metadata } from "next";
import { RouteMessage, RouteMessageLink } from "@/components/feedback/RouteMessage";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * App-wide 404 — catches both an unmatched URL and every explicit
 * `notFound()` call (`/product/[slug]`, `/storefront/[vendor]`,
 * `/collections/[occasion]`). It renders inside the root layout, so the
 * consumer header/footer are already around it; on `/seller/*` and
 * `/admin/*` the route group's own `not-found.tsx` takes over.
 */
export default function NotFound() {
  return (
    <RouteMessage
      eyebrow="404"
      title="We couldn't find that page"
      body="The link may be old, or the item may have sold out and been taken down by its HomeKrafter. Everything else is still here."
      actions={
        <>
          <RouteMessageLink href="/shop">Browse the marketplace</RouteMessageLink>
          <RouteMessageLink href="/" variant="outline">
            Go home
          </RouteMessageLink>
        </>
      }
    />
  );
}
