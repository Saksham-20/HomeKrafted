"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface ConsumerChromeProps {
  announcementBar: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

/**
 * Hides the consumer `AnnouncementBar`/`Header`/`Footer` on the role
 * surfaces (`/seller/*` now, `/admin/*` from M11) — those get their own
 * shell (`components/seller/SellerShell.tsx`), not the shopper chrome.
 *
 * There's only one root layout (`app/layout.tsx`) in this app, so without
 * this gate every route — including `/seller/*` — would render inside
 * the consumer header/footer. Moving every M0–M7 route into a `(consumer)`
 * route group would also solve this, but touches ~40 existing route
 * files for no behavioural gain; a client-side pathname check here is
 * the smaller, lower-risk diff and keeps the consumer app's file layout
 * completely untouched. `AnnouncementBar`/`Header`/`Footer` are async
 * server components — passed in as `children`-style props (React renders
 * server components server-side regardless of whether this client
 * component chooses to output them), so this stays a client component
 * without dragging their data-fetching into the client bundle.
 */
export function ConsumerChrome({
  announcementBar,
  header,
  footer,
  children,
}: ConsumerChromeProps) {
  const pathname = usePathname();
  const isRoleSurface = pathname.startsWith("/seller") || pathname.startsWith("/admin");

  if (isRoleSurface) {
    return <>{children}</>;
  }

  return (
    <>
      {announcementBar}
      {header}
      {children}
      {footer}
    </>
  );
}
