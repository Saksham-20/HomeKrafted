import { SellerListingEditorClient } from "@/components/seller/SellerListingEditorClient";

export interface SellerListingEditPageProps {
  params: Promise<{ id: string }>;
}

/** `/seller/listings/[id]` — edit a listing. The actual product lookup is owner-scoped client state (see `SellerListingEditorClient`), so this just forwards the route param. */
export default async function SellerListingEditPage({ params }: SellerListingEditPageProps) {
  const { id } = await params;
  return <SellerListingEditorClient productId={id} />;
}
