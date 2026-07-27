import { UserDetailClient } from "@/components/admin/UserDetailClient";

export interface AdminUserDetailPageProps {
  params: Promise<{ id: string }>;
}

/** `/admin/users/[id]` — one account's detail + suspend/reactivate. */
export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const { id } = await params;
  return <UserDetailClient userId={id} />;
}
