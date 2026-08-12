import { SellerDetailClient } from "@/components/admin/SellerDetailClient";

/**
 * `/admin/sellers/[id]` (M32) — one HomeKrafter, whole.
 *
 * No `loading.tsx` here, deliberately: the page is a thin wrapper around a
 * client component, so a Suspense boundary would cover nothing but its own
 * ~285ms throttle (M31).
 */
export default async function AdminSellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SellerDetailClient sellerId={id} />;
}
