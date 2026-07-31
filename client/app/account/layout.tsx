import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountShell } from "@/components/account/AccountShell";

/**
 * `/account/*` layout (M7a) — wraps every account route in the shared
 * sidebar/tab-strip shell. See `AccountShell` for the responsive
 * behaviour and the signed-out gate.
 */
/**
 * Never indexable: every `/account/*` route is one person's own data. `robots.ts` disallows the path too — this is
 * the belt to that braces, for the case where a crawler reaches the page
 * from an external link rather than by crawling the site.
 */
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
