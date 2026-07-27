import { AdminListingEditorClient } from "@/components/admin/AdminListingEditorClient";

export interface AdminCatalogEditPageProps {
  params: Promise<{ id: string }>;
}

/** `/admin/catalog/[id]` — full-record edit for any vendor's listing, unscoped. */
export default async function AdminCatalogEditPage({ params }: AdminCatalogEditPageProps) {
  const { id } = await params;
  return <AdminListingEditorClient productId={id} />;
}
