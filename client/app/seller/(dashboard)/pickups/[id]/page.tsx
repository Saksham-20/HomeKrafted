import { PartnerPickupDetailClient } from "@/components/seller/PartnerPickupDetailClient";

export interface SellerPickupDetailPageProps {
  params: Promise<{ id: string }>;
}

/** `/seller/pickups/[id]` (M10b, laundry type) — booking detail + status advance + slot editing. */
export default async function SellerPickupDetailPage({ params }: SellerPickupDetailPageProps) {
  const { id } = await params;
  return <PartnerPickupDetailClient bookingId={id} />;
}
