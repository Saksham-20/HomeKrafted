import { AdminLoginClient } from "@/components/admin/AdminLoginClient";

/**
 * `/admin/login` (M11a) — deliberately outside the `(dashboard)` route
 * group, so it renders without `AdminShell`'s sidebar/topbar (nothing to
 * navigate to before you're signed in). `ConsumerChrome` also hides the
 * consumer Header/Footer here since the path starts with `/admin`.
 */
export default function AdminLoginPage() {
  return <AdminLoginClient />;
}
