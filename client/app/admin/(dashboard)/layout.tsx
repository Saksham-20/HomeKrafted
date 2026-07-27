import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Layout for every shelled admin route (`/admin`, `/admin/users`,
 * `/admin/sellers`, `/admin/orders`) — the `(dashboard)` route group
 * excludes `/admin/login`, which has no sidebar/topbar to show. See
 * `AdminShell` for the responsive behaviour and the client-side
 * role-gate fallback.
 */
export default function AdminDashboardLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
