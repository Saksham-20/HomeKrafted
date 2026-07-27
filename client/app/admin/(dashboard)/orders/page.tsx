import { OrdersClient } from "@/components/admin/OrdersClient";

/** `/admin/orders` — unified, unscoped view across marketplace orders, laundry bookings and snack orders. */
export default function AdminOrdersPage() {
  return <OrdersClient />;
}
