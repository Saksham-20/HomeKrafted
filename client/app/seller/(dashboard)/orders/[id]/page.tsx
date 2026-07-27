import { SellerOrderDetailClient } from "@/components/seller/SellerOrderDetailClient";

export interface SellerOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

/** `/seller/orders/[id]` — order detail + fulfilment status advance. */
export default async function SellerOrderDetailPage({ params }: SellerOrderDetailPageProps) {
  const { id } = await params;
  return <SellerOrderDetailClient orderId={id} />;
}
