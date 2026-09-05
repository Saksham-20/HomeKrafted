"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CartBar } from "@/components/cart/CartBar";

export interface ConsumerChromeProps {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

/**
 * Hides the consumer `Header`/`Footer` on the role surfaces (`/seller/*`
 * now, `/admin/*` from M11) — those get their own shell
 * (`components/seller/SellerShell.tsx`), not the shopper chrome.
 *
 * There's only one root layout (`app/layout.tsx`) in this app, so without
 * this gate every route — including `/seller/*` — would render inside
 * the consumer header/footer. Moving every M0–M7 route into a `(consumer)`
 * route group would also solve this, but touches ~40 existing route
 * files for no behavioural gain; a client-side pathname check here is
 * the smaller, lower-risk diff and keeps the consumer app's file layout
 * completely untouched. `Header`/`Footer` are async server components —
 * passed in as `children`-style props (React renders server components
 * server-side regardless of whether this client component chooses to
 * output them), so this stays a client component without dragging their
 * data-fetching into the client bundle.
 *
 * There was a third slot above the header until M33: a pine
 * `AnnouncementBar` strip of value props ("Cooked this morning in a home
 * kitchen near you · Chandigarh · Mohali · Panchkula · Zirakpur · Freshly
 * prepared · No preservatives"). Removed on owner instruction. It cost
 * 38px of every page on a phone and up to 102px when it wrapped (M26-013),
 * said nothing the hero does not, and its "cooked this morning" line was
 * a claim about food sitting above a page that also sells candles.
 */
/**
 * Marks the page as the consumer surface, so `styles/globals.css` can give
 * `.container` the header's width on every consumer route
 * (`body:has([data-surface="consumer"]) .container`) and leave the two
 * portals at theirs.
 *
 * A rendered, empty, hidden element rather than a `useEffect` that sets a
 * body attribute: the effect runs after first paint, so the page would
 * render at 1180px and then jump to 1440px — a layout shift on every
 * navigation, which is the one thing a width rule must not do. This is in
 * the server HTML, so the first paint is already right. And a marker, not
 * a wrapper `<div>`: the header is `position: fixed` on `/` and the cart
 * bar is sticky, and a new block ancestor around them is a new containing
 * block for nothing anybody wanted.
 */
function SurfaceMarker() {
  return <span data-surface="consumer" hidden aria-hidden="true" />;
}

export function ConsumerChrome({ header, footer, children }: ConsumerChromeProps) {
  const pathname = usePathname();
  /**
   * `/corporate/quote/*` joins the role surfaces (M20), for a different
   * reason than they did.
   *
   * It is a five-figure B2B quote opened from an email by somebody who
   * has no account and may never have heard of us. The shopper chrome put
   * a cart, a wallet balance and a hamburger above it, and a footer
   * offering Login, Wallet and Order history below — none of which that
   * person can use, and one of which reads as the account-creation prompt
   * the page is specifically not supposed to have. It carries its own
   * brand bar instead (`QuoteClient`).
   *
   * Only the `/corporate/quote` subtree. `/corporate` itself is an
   * ordinary marketing page and keeps the normal chrome.
   */
  const isBareSurface =
    pathname.startsWith("/seller") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/corporate/quote");

  if (isBareSurface) {
    return <>{children}</>;
  }

  return (
    <>
      <SurfaceMarker />
      {header}
      {children}
      {footer}
      {/* After the footer, so its in-flow spacer lands at the very end of
          the page and the footer's legal row stays clear of the bar. */}
      <CartBar />
    </>
  );
}
