import { UsersClient } from "@/components/admin/UsersClient";

/** `/admin/users` — unscoped user directory, search/filter, suspend/reactivate. */
export default function AdminUsersPage() {
  return <UsersClient />;
}
