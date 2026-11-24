import { SellerListingEditorClient } from "@/components/seller/SellerListingEditorClient";

export interface NewSellerListingPageProps {
  searchParams: Promise<{ from?: string | string[] }>;
}

/** `/seller/listings/new` — create a listing; `?from=<id>` starts it as a copy of one of yours. */
export default async function NewSellerListingPage({ searchParams }: NewSellerListingPageProps) {
  const { from } = await searchParams;
  return <SellerListingEditorClient duplicateFrom={typeof from === "string" ? from : undefined} />;
}
