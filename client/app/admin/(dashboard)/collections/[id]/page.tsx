import { CollectionEditorClient } from "@/components/admin/CollectionEditorClient";

export interface AdminCollectionEditPageProps {
  params: Promise<{ id: string }>;
}

/** `/admin/collections/[id]` — edit a collection. */
export default async function AdminCollectionEditPage({ params }: AdminCollectionEditPageProps) {
  const { id } = await params;
  return <CollectionEditorClient collectionId={id} />;
}
