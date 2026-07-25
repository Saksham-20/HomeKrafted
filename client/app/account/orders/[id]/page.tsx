import { OrderDetailClient } from "@/components/account/OrderDetailClient";

export interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Order/booking detail (M7a) — thin server wrapper, same reasoning as
 * `/account/orders`: the actual entry lookup (`getOrderHistoryEntry`)
 * happens client-side in `OrderDetailClient` so a live-session order or
 * booking (not yet in the seeded history) can resolve too.
 */
export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  return <OrderDetailClient id={id} />;
}
