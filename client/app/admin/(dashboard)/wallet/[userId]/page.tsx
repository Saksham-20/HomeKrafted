import { AdminUserWalletDetailClient } from "@/components/admin/AdminUserWalletDetailClient";

export interface AdminWalletDetailPageProps {
  params: Promise<{ userId: string }>;
}

/** `/admin/wallet/[userId]` — one account's wallet ledger + refund/adjustment actions. */
export default async function AdminWalletDetailPage({ params }: AdminWalletDetailPageProps) {
  const { userId } = await params;
  return <AdminUserWalletDetailClient userId={userId} />;
}
