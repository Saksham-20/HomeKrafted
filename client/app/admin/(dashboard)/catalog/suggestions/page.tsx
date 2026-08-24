import { TaxonomySuggestionsClient } from "@/components/admin/TaxonomySuggestionsClient";

/** `/admin/catalog/suggestions` (M50) — shelves and occasions HomeKrafters have asked for. Approving one mints the real row. */
export default function AdminTaxonomySuggestionsPage() {
  return <TaxonomySuggestionsClient />;
}
