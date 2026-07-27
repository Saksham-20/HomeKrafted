import { SellerLoginClient } from "@/components/seller/SellerLoginClient";

/**
 * `/seller/login` (M10a) — deliberately outside the `(dashboard)` route
 * group, so it renders without `SellerShell`'s sidebar/topbar (nothing to
 * navigate to before you're signed in). `ConsumerChrome` also hides the
 * consumer Header/Footer here since the path starts with `/seller`.
 */
export default function SellerLoginPage() {
  return <SellerLoginClient />;
}
