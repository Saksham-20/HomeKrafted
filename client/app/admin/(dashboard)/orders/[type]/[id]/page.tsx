import { notFound } from "next/navigation";
import { OrderDetailClient } from "@/components/admin/OrderDetailClient";
import type { AdminOrderType } from "@/lib/api";

export interface AdminOrderDetailPageProps {
  params: Promise<{ type: string; id: string }>;
}

const VALID_TYPES: AdminOrderType[] = ["marketplace", "laundry", "snack"];

function isAdminOrderType(value: string): value is AdminOrderType {
  return (VALID_TYPES as string[]).includes(value);
}

/** `/admin/orders/[type]/[id]` — full detail for one unified order row; `type` routes which of the 3 source tables to fetch. */
export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { type, id } = await params;
  if (!isAdminOrderType(type)) notFound();
  return <OrderDetailClient type={type} id={id} />;
}
