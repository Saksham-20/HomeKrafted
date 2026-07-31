import { SupportQueueClient } from "@/components/admin/SupportQueueClient";

/** `/admin/support` (M15) — the dispute queue. Tickets were written from M7b and read by nothing until this. */
export default function AdminSupportPage() {
  return <SupportQueueClient />;
}
