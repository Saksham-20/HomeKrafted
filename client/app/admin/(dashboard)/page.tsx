import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";

/** `/admin` — Dashboard. Thin server wrapper; all data is unscoped client state, see `AdminDashboardClient`. */
export default function AdminDashboardPage() {
  return <AdminDashboardClient />;
}
