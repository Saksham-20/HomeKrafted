import { Suspense } from "react";
import { ListingsClient } from "@/components/seller/ListingsClient";

/** `/seller/listings` — this maker's products, owner-scoped client state. */
export default function SellerListingsPage() {
  return (
    <Suspense fallback={null}>
      <ListingsClient />
    </Suspense>
  );
}
