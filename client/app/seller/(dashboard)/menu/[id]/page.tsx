import { SellerMenuEditorClient } from "@/components/seller/SellerMenuEditorClient";

export interface SellerMenuEditPageProps {
  params: Promise<{ id: string }>;
}

/** `/seller/menu/[id]` (M10b, snack type) — edit a snack. The actual snack lookup is owner-scoped client state (see `SellerMenuEditorClient`), so this just forwards the route param. */
export default async function SellerMenuEditPage({ params }: SellerMenuEditPageProps) {
  const { id } = await params;
  return <SellerMenuEditorClient snackId={id} />;
}
