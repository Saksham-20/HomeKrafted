import { redirect } from "next/navigation";

/**
 * `/seller/login` (M10a) — folded into the single unified `/login` entry
 * point (M8.5, see `components/auth/LoginClient.tsx`'s doc comment).
 * `?role=seller` pre-selects the seller tab there. Kept as a redirect
 * rather than deleted so any existing link/bookmark to `/seller/login`
 * (including `middleware.ts`'s prior redirect target) still lands
 * somewhere sensible.
 */
export default function SellerLoginPage() {
  redirect("/login?role=seller");
}
